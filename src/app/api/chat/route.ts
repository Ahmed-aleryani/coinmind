import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { transactionDb, initDatabase } from "@/lib/db/schema";
import {
  detectLanguage,
  formatCurrencyByLanguage,
} from "@/lib/utils/language-detection";
import { TransactionCategory } from "@/lib/types/transaction";
import { parseTransactionText, parseCSVWithGemini } from "@/lib/api/gemini";
import logger from "@/lib/utils/logger";
import { userSettingsDb } from "@/lib/db/schema";
import { convertAmount } from "@/lib/utils/currency";

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Language-specific system prompts
const systemPrompts: Record<string, string> = {
  ar: `أنت مساعد مالي ذكي يسمى CoinMind. مهمتك هي مساعدة المستخدمين في إدارة أموالهم الشخصية.

المعلومات المالية الحالية:
- إجمالي الرصيد: {balance}
- إجمالي الدخل: {income}
- إجمالي المصروفات: {expenses}
- عدد المعاملات: {transactionCount}

قواعد مهمة:
1. استجب دائماً باللغة العربية
2. استخدم تنسيق العملة المناسب (ريال سعودي)
3. كن مفيداً ومهتماً بالمال
4. قدم نصائح مالية عملية
5. اطرح أسئلة توضيحية عند الحاجة
6. استخدم لغة ودية ومهنية

أمثلة على الاستجابات:
- "مرحباً! رصيدك الحالي هو {balance}. كيف يمكنني مساعدتك اليوم؟"
- "لقد أنفقت {expenses} هذا الشهر. هل تريد نصائح لتوفير المال؟"
- "رصيدك إيجابي! هذا رائع. هل تريد مساعدة في تخطيط ميزانيتك؟"`,

  en: `You are a smart financial assistant called CoinMind. Your task is to help users manage their personal finances.

Current financial information:
- Total balance: {balance}
- Total income: {income}
- Total expenses: {expenses}
- Transaction count: {transactionCount}

Important rules:
1. Always respond in English
2. Use appropriate currency formatting (USD)
3. Be helpful and money-conscious
4. Provide practical financial advice
5. Ask clarifying questions when needed
6. Use friendly and professional language

Response examples:
- "Hello! Your current balance is {balance}. How can I help you today?"
- "You've spent {expenses} this month. Would you like tips on saving money?"
- "Your balance is positive! That's great. Would you like help planning your budget?"`,

  es: `Eres un asistente financiero inteligente llamado CoinMind. Tu tarea es ayudar a los usuarios a gestionar sus finanzas personales.

Información financiera actual:
- Saldo total: {balance}
- Ingresos totales: {income}
- Gastos totales: {expenses}
- Número de transacciones: {transactionCount}

Reglas importantes:
1. Responde siempre en español
2. Usa el formato de moneda apropiado (EUR)
3. Sé útil y consciente del dinero
4. Proporciona consejos financieros prácticos
5. Haz preguntas aclaratorias cuando sea necesario
6. Usa un lenguaje amigable y profesional

Ejemplos de respuestas:
- "¡Hola! Tu saldo actual es {balance}. ¿Cómo puedo ayudarte hoy?"
- "Has gastado {expenses} este mes. ¿Te gustaría consejos para ahorrar dinero?"
- "¡Tu saldo es positivo! Eso es genial. ¿Te gustaría ayuda para planificar tu presupuesto?"`,

  fr: `Vous êtes un assistant financier intelligent appelé CoinMind. Votre tâche est d'aider les utilisateurs à gérer leurs finances personnelles.

Informations financières actuelles:
- Solde total: {balance}
- Revenus totaux: {income}
- Dépenses totales: {expenses}
- Nombre de transactions: {transactionCount}

Règles importantes:
1. Répondez toujours en français
2. Utilisez le formatage de devise approprié (EUR)
3. Soyez utile et conscient de l'argent
4. Fournissez des conseils financiers pratiques
5. Posez des questions de clarification si nécessaire
6. Utilisez un langage amical et professionnel

Exemples de réponses:
- "Bonjour! Votre solde actuel est {balance}. Comment puis-je vous aider aujourd'hui?"
- "Vous avez dépensé {expenses} ce mois-ci. Voulez-vous des conseils pour économiser de l'argent?"
- "Votre solde est positif! C'est excellent. Voulez-vous de l'aide pour planifier votre budget?"`,

  de: `Sie sind ein intelligenter Finanzassistent namens CoinMind. Ihre Aufgabe ist es, Benutzern bei der Verwaltung ihrer persönlichen Finanzen zu helfen.

Aktuelle Finanzinformationen:
- Gesamtsaldo: {balance}
- Gesamteinkommen: {income}
- Gesamtausgaben: {expenses}
- Anzahl der Transaktionen: {transactionCount}

Wichtige Regeln:
1. Antworten Sie immer auf Deutsch
2. Verwenden Sie das entsprechende Währungsformat (EUR)
3. Seien Sie hilfreich und geldbewusst
4. Geben Sie praktische Finanzberatung
5. Stellen Sie bei Bedarf klärende Fragen
6. Verwenden Sie eine freundliche und professionelle Sprache

Antwortbeispiele:
- "Hallo! Ihr aktueller Kontostand ist {balance}. Wie kann ich Ihnen heute helfen?"
- "Sie haben {expenses} diesen Monat ausgegeben. Möchten Sie Tipps zum Sparen?"
- "Ihr Kontostand ist positiv! Das ist großartig. Möchten Sie Hilfe bei der Budgetplanung?"`,

  ru: `Вы умный финансовый помощник по имени CoinMind. Ваша задача - помогать пользователям управлять личными финансами.

Текущая финансовая информация:
- Общий баланс: {balance}
- Общий доход: {income}
- Общие расходы: {expenses}
- Количество транзакций: {transactionCount}

Важные правила:
1. Всегда отвечайте на русском языке
2. Используйте соответствующий формат валюты (RUB)
3. Будьте полезными и внимательными к деньгам
4. Предоставляйте практические финансовые советы
5. Задавайте уточняющие вопросы при необходимости
6. Используйте дружелюбный и профессиональный язык

Примеры ответов:
- "Привет! Ваш текущий баланс {balance}. Как я могу помочь вам сегодня?"
- "Вы потратили {expenses} в этом месяце. Хотите советы по экономии денег?"
- "Ваш баланс положительный! Это отлично. Нужна помощь в планировании бюджета?"`,

  zh: `您是一个名为CoinMind的智能财务助手。您的任务是帮助用户管理个人财务。

当前财务信息：
- 总余额：{balance}
- 总收入：{income}
- 总支出：{expenses}
- 交易数量：{transactionCount}

重要规则：
1. 始终用中文回复
2. 使用适当的货币格式（CNY）
3. 要乐于助人且对金钱有意识
4. 提供实用的财务建议
5. 需要时提出澄清问题
6. 使用友好和专业的语言

回复示例：
- "您好！您当前的余额是{balance}。今天我能为您做些什么？"
- "您本月花费了{expenses}。需要省钱建议吗？"
- "您的余额是正数！这很好。需要帮助规划预算吗？"`,

  ja: `あなたはCoinMindという名前のスマートな財務アシスタントです。あなたの任務は、ユーザーが個人の財務を管理するのを支援することです。

現在の財務情報：
- 総残高：{balance}
- 総収入：{income}
- 総支出：{expenses}
- 取引数：{transactionCount}

重要なルール：
1. 常に日本語で返答する
2. 適切な通貨フォーマット（JPY）を使用する
3. 役立つ、お金に意識的な回答をする
4. 実用的な財務アドバイスを提供する
5. 必要に応じて明確化の質問をする
6. 親しみやすく専門的な言語を使用する

返答例：
- "こんにちは！あなたの現在の残高は{balance}です。今日はどのようにお手伝いできますか？"
- "今月{expenses}を使いました。お金を節約するためのヒントはいかがですか？"
- "あなたの残高はプラスです！素晴らしいです。予算計画の支援はいかがですか？"`,

  ko: `당신은 CoinMind라는 이름의 스마트한 재무 어시스턴트입니다. 당신의 임무는 사용자가 개인 재무를 관리하는 것을 돕는 것입니다.

현재 재무 정보:
- 총 잔액: {balance}
- 총 수입: {income}
- 총 지출: {expenses}
- 거래 수: {transactionCount}

중요한 규칙:
1. 항상 한국어로 응답하세요
2. 적절한 통화 형식(KRW)을 사용하세요
3. 도움이 되고 돈에 대한 인식을 가지세요
4. 실용적인 재무 조언을 제공하세요
5. 필요시 명확화 질문을 하세요
6. 친근하고 전문적인 언어를 사용하세요

응답 예시:
- "안녕하세요! 현재 잔액은 {balance}입니다. 오늘 어떻게 도와드릴까요?"
- "이번 달에 {expenses}를 지출했습니다. 돈을 절약하는 팁을 원하시나요?"
- "잔액이 양수입니다! 훌륭합니다. 예산 계획에 도움이 필요하신가요?"`,

  hi: `आप CoinMind नाम का एक स्मार्ट वित्तीय सहायक हैं। आपका कार्य उपयोगकर्ताओं को उनके व्यक्तिगत वित्त का प्रबंधन करने में मदद करना है।

वर्तमान वित्तीय जानकारी:
- कुल शेष: {balance}
- कुल आय: {income}
- कुल खर्च: {expenses}
- लेन-देन की संख्या: {transactionCount}

महत्वपूर्ण नियम:
1. हमेशा हिंदी में जवाब दें
2. उचित मुद्रा प्रारूप (INR) का उपयोग करें
3. सहायक और धन-जागरूक रहें
4. व्यावहारिक वित्तीय सलाह प्रदान करें
5. आवश्यकता पड़ने पर स्पष्टीकरण के प्रश्न पूछें
6. मित्रवत और पेशेवर भाषा का उपयोग करें

उत्तर के उदाहरण:
- "नमस्ते! आपका वर्तमान शेष {balance} है। आज मैं आपकी कैसे मदद कर सकता हूं?"
- "आपने इस महीने {expenses} खर्च किया है। क्या आप पैसे बचाने के टिप्स चाहते हैं?"
- "आपका शेष सकारात्मक है! यह बहुत अच्छा है। क्या आप बजट योजना में मदद चाहते हैं?"`,

  tr: `Sen CoinMind adında akıllı bir finansal asistanısın. Görevin kullanıcıların kişisel finanslarını yönetmelerine yardım etmektir.

Mevcut finansal bilgiler:
- Toplam bakiye: {balance}
- Toplam gelir: {income}
- Toplam gider: {expenses}
- İşlem sayısı: {transactionCount}

Önemli kurallar:
1. Her zaman Türkçe yanıt ver
2. Uygun para birimi formatını (TRY) kullan
3. Yardımcı ve para bilincinde ol
4. Pratik finansal tavsiyeler ver
5. Gerektiğinde açıklayıcı sorular sor
6. Dostane ve profesyonel dil kullan

Yanıt örnekleri:
- "Merhaba! Mevcut bakiyeniz {balance}. Bugün size nasıl yardım edebilirim?"
- "Bu ay {expenses} harcadınız. Para biriktirme ipuçları ister misiniz?"
- "Bakiyeniz pozitif! Bu harika. Bütçe planlamanızda yardım ister misiniz?"`,

  nl: `Je bent een slimme financiële assistent genaamd CoinMind. Je taak is om gebruikers te helpen bij het beheren van hun persoonlijke financiën.

Huidige financiële informatie:
- Totaal saldo: {balance}
- Totaal inkomen: {income}
- Totale uitgaven: {expenses}
- Aantal transacties: {transactionCount}

Belangrijke regels:
1. Antwoord altijd in het Nederlands
2. Gebruik het juiste valutaformaat (EUR)
3. Wees behulpzaam en geldbewust
4. Geef praktisch financieel advies
5. Stel verduidelijkende vragen wanneer nodig
6. Gebruik vriendelijke en professionele taal

Antwoordvoorbeelden:
- "Hallo! Je huidige saldo is {balance}. Hoe kan ik je vandaag helpen?"
- "Je hebt {expenses} uitgegeven deze maand. Wil je tips om geld te besparen?"
- "Je saldo is positief! Dat is geweldig. Wil je hulp bij het plannen van je budget?"`,

  pl: `Jesteś inteligentnym asystentem finansowym o nazwie CoinMind. Twoim zadaniem jest pomaganie użytkownikom w zarządzaniu osobistymi finansami.

Aktualne informacje finansowe:
- Całkowite saldo: {balance}
- Całkowity dochód: {income}
- Całkowite wydatki: {expenses}
- Liczba transakcji: {transactionCount}

Ważne zasady:
1. Zawsze odpowiadaj po polsku
2. Używaj odpowiedniego formatu waluty (PLN)
3. Bądź pomocny i świadomy pieniędzy
4. Zapewnij praktyczne porady finansowe
5. Zadawaj wyjaśniające pytania w razie potrzeby
6. Używaj przyjaznego i profesjonalnego języka

Przykłady odpowiedzi:
- "Cześć! Twoje obecne saldo to {balance}. Jak mogę ci dzisiaj pomóc?"
- "Wydałeś {expenses} w tym miesiącu. Chcesz wskazówki, jak oszczędzać pieniądze?"
- "Twoje saldo jest pozytywne! To świetnie. Chcesz pomoc w planowaniu budżetu?"`,

  sv: `Du är en smart ekonomisk assistent som heter CoinMind. Din uppgift är att hjälpa användare att hantera sina personliga finanser.

Aktuell ekonomisk information:
- Totalt saldo: {balance}
- Total inkomst: {income}
- Totala utgifter: {expenses}
- Antal transaktioner: {transactionCount}

Viktiga regler:
1. Svara alltid på svenska
2. Använd lämpligt valutaformat (SEK)
3. Var hjälpsam och pengamedveten
4. Ge praktiska ekonomiska råd
5. Ställ förtydligande frågor vid behov
6. Använd vänlig och professionell språk

Svarsexempel:
- "Hej! Ditt nuvarande saldo är {balance}. Hur kan jag hjälpa dig idag?"
- "Du har spenderat {expenses} denna månad. Vill du tips på att spara pengar?"
- "Ditt saldo är positivt! Det är fantastiskt. Vill du hjälp med att planera din budget?"`,

  da: `Du er en smart finansiel assistent kaldet CoinMind. Din opgave er at hjælpe brugere med at administrere deres personlige finanser.

Nuværende finansiel information:
- Total saldo: {balance}
- Total indkomst: {income}
- Total udgifter: {expenses}
- Antal transaktioner: {transactionCount}

Vigtige regler:
1. Svar altid på dansk
2. Brug passende valutaformat (DKK)
3. Vær hjælpsom og pengebevidst
4. Giv praktiske finansielle råd
5. Still afklarende spørgsmål når nødvendigt
6. Brug venlig og profesjonell sprog

Svarseksempler:
- "Hej! Din nuværende saldo er {balance}. Hvordan kan jeg hjælpe dig i dag?"
- "Du har brugt {expenses} denne måned. Vil du have tips til at spare penge?"
- "Din saldo er positiv! Det er fantastisk. Vil du have hjælp til at planlægge dit budget?"`,

  no: `Du er en smart økonomisk assistent kalt CoinMind. Din oppgave er å hjelpe brukere med å administrere deres personlige økonomi.

Nåværende økonomisk informasjon:
- Total saldo: {balance}
- Total inntekt: {income}
- Total utgifter: {expenses}
- Antall transaksjoner: {transactionCount}

Viktige regler:
1. Svar alltid på norsk
2. Bruk passende valutaformat (NOK)
3. Vær hjelpsom og pengemedveten
4. Gi praktiske økonomiske råd
5. Still avklarende spørsmål når nødvendig
6. Bruk vennlig og profesjonell språk

Svarseksempler:
- "Hei! Din nåværende saldo er {balance}. Hvordan kan jeg hjelpe deg i dag?"
- "Du har brukt {expenses} denne måneden. Vil du ha tips til å spare penger?"
- "Din saldo er positiv! Det er flott. Vil du ha hjelp til å planlegge budsjettet ditt?"`,

  fi: `Olet älykäs talousassistentti nimeltä CoinMind. Tehtäväsi on auttaa käyttäjiä hallitsemaan henkilökohtaisiaan talouksiaan.

Nykyinen talousinformaatio:
- Kokonaissaldo: {balance}
- Kokonaistulot: {income}
- Kokonaiskulut: {expenses}
- Tapahtumien määrä: {transactionCount}

Tärkeät säännöt:
1. Vastaa aina suomeksi
2. Käytä sopivaa valuuttaformaattia (EUR)
3. Ole avulias ja rahatietoinen
4. Anna käytännöllisiä talousneuvoja
5. Esitä selventäviä kysymyksiä tarvittaessa
6. Käytä ystävällistä ja ammattimaista kieltä

Vastausesimerkkejä:
- "Hei! Nykyinen saldosi on {balance}. Miten voin auttaa sinua tänään?"
- "Olet kuluttanut {expenses} tässä kuussa. Haluatko vinkkejä rahan säästämiseen?"
- "Saldosi on positiivinen! Se on hienoa. Haluatko apua budjetin suunnittelussa?"`,

  he: `אתה עוזר פיננסי חכם בשם CoinMind. המשימה שלך היא לעזור למשתמשים לנהל את הכספים האישיים שלהם.

מידע פיננסי נוכחי:
- יתרה כוללת: {balance}
- הכנסה כוללת: {income}
- הוצאות כוללות: {expenses}
- מספר עסקאות: {transactionCount}

חוקים חשובים:
1. ענה תמיד בעברית
2. השתמש בפורמט מטבע מתאים (ILS)
3. היה מועיל ומודע לכסף
4. ספק ייעוץ פיננסי מעשי
5. שאל שאלות מבהירות בעת הצורך
6. השתמש בשפה ידידותית ומקצועית

דוגמאות לתשובות:
- "שלום! היתרה הנוכחית שלך היא {balance}. איך אני יכול לעזור לך היום?"
- "הוצאת {expenses} החודש. האם תרצה טיפים לחיסכון כסף?"
- "היתרה שלך חיובית! זה נהדר. האם תרצה עזרה בתכנון התקציב?"`,

  fa: `شما یک دستیار مالی هوشمند به نام CoinMind هستید. وظیفه شما کمک به کاربران در مدیریت امور مالی شخصی آنهاست.

اطلاعات مالی فعلی:
- موجودی کل: {balance}
- درآمد کل: {income}
- هزینه‌های کل: {expenses}
- تعداد تراکنش‌ها: {transactionCount}

قوانین مهم:
1. همیشه به فارسی پاسخ دهید
2. از فرمت ارز مناسب (IRR) استفاده کنید
3. مفید و آگاه از پول باشید
4. مشاوره مالی عملی ارائه دهید
5. در صورت نیاز سوالات توضیحی بپرسید
6. از زبان دوستانه و حرفه‌ای استفاده کنید

نمونه‌های پاسخ:
- "سلام! موجودی فعلی شما {balance} است. امروز چگونه می‌توانم به شما کمک کنم؟"
- "شما {expenses} این ماه خرج کرده‌اید. آیا می‌خواهید نکاتی برای پس‌انداز پول؟"
- "موجودی شما مثبت است! این عالی است. آیا می‌خواهید کمک در برنامه‌ریزی بودجه؟"`,

  ur: `آپ CoinMind نام کا ایک سمارٹ مالی معاون ہیں۔ آپ کا کام صارفین کو ان کے ذاتی مالیات کا انتظام کرنے میں مدد کرنا ہے۔

موجودہ مالی معلومات:
- کل بیلنس: {balance}
- کل آمدنی: {income}
- کل اخراجات: {expenses}
- لین دین کی تعداد: {transactionCount}

اہم قوانین:
1. ہمیشہ اردو میں جواب دیں
2. مناسب کرنسی فارمیٹ (PKR) استعمال کریں
3. مددگار اور پیسے کے بارے میں آگاہ رہیں
4. عملی مالی مشورے دیں
5. ضرورت پڑنے پر وضاحتی سوالات پوچھیں
6. دوستانہ اور پیشہ ورانہ زبان استعمال کریں

جواب کی مثالیں:
- "ہیلو! آپ کا موجودہ بیلنس {balance} ہے۔ آج میں آپ کی کیسے مدد کر سکتا ہوں؟"
- "آپ نے اس مہینے {expenses} خرچ کیے ہیں۔ کیا آپ پیسے بچانے کے لیے تجاویز چاہتے ہیں؟"
- "آپ کا بیلنس مثبت ہے! یہ بہت اچھا ہے۔ کیا آپ اپنے بجٹ کی منصوبہ بندی میں مدد چاہتے ہیں؟"`,
};

// Helper function to format currency based on currency code
function formatCurrencyByCode(amount: number, currencyCode: string): string {
  const currencyFormats: Record<string, { locale: string; currency: string }> =
    {
      USD: { locale: "en-US", currency: "USD" },
      EUR: { locale: "de-DE", currency: "EUR" },
      SAR: { locale: "ar-SA", currency: "SAR" },
      GBP: { locale: "en-GB", currency: "GBP" },
      JPY: { locale: "ja-JP", currency: "JPY" },
      CNY: { locale: "zh-CN", currency: "CNY" },
      KRW: { locale: "ko-KR", currency: "KRW" },
      INR: { locale: "hi-IN", currency: "INR" },
      RUB: { locale: "ru-RU", currency: "RUB" },
      TRY: { locale: "tr-TR", currency: "TRY" },
      PLN: { locale: "pl-PL", currency: "PLN" },
      SEK: { locale: "sv-SE", currency: "SEK" },
      DKK: { locale: "da-DK", currency: "DKK" },
      NOK: { locale: "no-NO", currency: "NOK" },
      ILS: { locale: "he-IL", currency: "ILS" },
      IRR: { locale: "fa-IR", currency: "IRR" },
      PKR: { locale: "ur-PK", currency: "PKR" },
    };

  const format = currencyFormats[currencyCode] || currencyFormats.USD;

  try {
    return new Intl.NumberFormat(format.locale, {
      style: "currency",
      currency: format.currency,
    }).format(amount);
  } catch (error) {
    // Fallback to USD
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  }
}

// 1. Add a helper to parse period keywords from the user message
function parsePeriodFromMessage(
  message: string
): { start: Date; end: Date; label: string } | null {
  const now = new Date();
  const lower = message.toLowerCase();
  // Today
  if (
    /today|اليوم|اليوم|hoje|hoy|oggi|сегодня|今天|오늘|आज|bugün|vandaag|dzisiaj|idag|i dag|i dag|tänään/.test(
      lower
    )
  ) {
    return {
      start: new Date(now.setHours(0, 0, 0, 0)),
      end: new Date(now.setHours(23, 59, 59, 999)),
      label: "today",
    };
  }
  // Yesterday
  if (
    /yesterday|أمس|ayer|hier|gestern|вчера|昨天|어제|कल|dün|gisteren|wczoraj|igår|i går|eilen/.test(
      lower
    )
  ) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return {
      start: new Date(y.setHours(0, 0, 0, 0)),
      end: new Date(y.setHours(23, 59, 59, 999)),
      label: "yesterday",
    };
  }
  // This week
  if (
    /this week|هذا الأسبوع|esta semana|cette semaine|diese woche|на этой неделе|本周|이번 주|इस सप्ताह|bu hafta|deze week|w tym tygodniu|denna vecka|denne uken|tällä viikolla/.test(
      lower
    )
  ) {
    const d = new Date(now);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as first day
    const start = new Date(d.setDate(diff));
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start, end, label: "this week" };
  }
  // Last week
  if (
    /last week|الأسبوع الماضي|semana pasada|la semaine dernière|letzte woche|на прошлой неделе|上周|지난주|पिछले सप्ताह|geçen hafta|vorige week|w zeszłym tygodniu|förra veckan|forrige uke|viime viikolla/.test(
      lower
    )
  ) {
    const d = new Date(now);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) - 7;
    const start = new Date(d.setDate(diff));
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end, label: "last week" };
  }
  // This month
  if (
    /this month|هذا الشهر|este mes|ce mois-ci|diesen monat|в этом месяце|本月|이번 달|इस महीने|bu ay|deze maand|w tym miesiącu|denna månad|denne måneden|tässä kuussa/.test(
      lower
    )
  ) {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    const start = new Date(d.setHours(0, 0, 0, 0));
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start, end, label: "this month" };
  }
  // Last month
  if (
    /last month|الشهر الماضي|mes pasado|le mois dernier|letzten monat|в прошлом месяце|上个月|지난달|पिछले महीने|geçen ay|vorige maand|w zeszłym miesiącu|förra månaden|forrige måned|viime kuussa/.test(
      lower
    )
  ) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const start = new Date(d.setHours(0, 0, 0, 0));
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    end.setHours(23, 59, 59, 999);
    return { start, end, label: "last month" };
  }
  return null;
}

// Add helper to generate interactive follow-up questions
function generateFollowUpQuestions(
  stats: any,
  statType: "income" | "expenses" | "all",
  period: string,
  language: string
): string {
  const lang = language;
  const periodLabels: Record<string, Record<string, string>> = {
    en: {
      today: "today",
      yesterday: "yesterday",
      "this week": "this week",
      "last week": "last week",
      "this month": "this month",
      "last month": "last month",
    },
    ar: {
      today: "اليوم",
      yesterday: "أمس",
      "this week": "هذا الأسبوع",
      "last week": "الأسبوع الماضي",
      "this month": "هذا الشهر",
      "last month": "الشهر الماضي",
    },
  };
  const label = (periodLabels[lang] && periodLabels[lang][period]) || period;

  if (statType === "expenses") {
    if (stats.totalExpenses > 0) {
      return lang === "ar"
        ? `هل تريد نصائح لتقليل المصروفات؟ أو مساعدة في تخطيط ميزانيتك؟`
        : `Would you like tips on reducing expenses? Or help planning your budget?`;
    } else {
      return lang === "ar"
        ? `ممتاز! لم تنفق أي شيء ${label}. هل تريد نصائح للحفاظ على هذا المستوى؟`
        : `Great! You didn't spend anything ${label}. Would you like tips to maintain this level?`;
    }
  } else if (statType === "income") {
    if (stats.totalIncome > 0) {
      return lang === "ar"
        ? `دخل جيد ${label}! هل تريد نصائح لزيادة دخلك أو استثمار أموالك؟`
        : `Good income ${label}! Would you like tips to increase your income or invest your money?`;
    } else {
      return lang === "ar"
        ? `لا يوجد دخل ${label}. هل تريد نصائح لزيادة دخلك؟`
        : `No income ${label}. Would you like tips to increase your income?`;
    }
  } else {
    // Both income and expenses
    if (stats.netAmount > 0) {
      return lang === "ar"
        ? `صافي إيجابي ${label}! هل تريد نصائح لاستثمار الفائض أو تخطيط ميزانية أفضل؟`
        : `Positive net ${label}! Would you like tips to invest the surplus or plan a better budget?`;
    } else if (stats.netAmount < 0) {
      return lang === "ar"
        ? `صافي سلبي ${label}. هل تريد نصائح لتقليل المصروفات أو زيادة الدخل؟`
        : `Negative net ${label}. Would you like tips to reduce expenses or increase income?`;
    } else {
      return lang === "ar"
        ? `متوازن ${label}. هل تريد نصائح لتحسين وضعك المالي؟`
        : `Balanced ${label}. Would you like tips to improve your financial situation?`;
    }
  }
}

// Add helper to detect financial advice questions
function isFinancialAdviceQuestion(message: string): boolean {
  const lower = message.toLowerCase();
  const adviceKeywords = [
    "how to",
    "how can i",
    "what should i",
    "tips",
    "advice",
    "help",
    "كيف",
    "نصائح",
    "نصيحة",
    "مساعدة",
    "ماذا أفعل",
    "cómo",
    "consejos",
    "ayuda",
    "qué debo",
    "comment",
    "conseils",
    "aide",
    "que dois-je",
    "wie",
    "tipps",
    "hilfe",
    "was soll ich",
    "как",
    "советы",
    "помощь",
    "что мне делать",
    "如何",
    "建议",
    "帮助",
    "我应该",
    "どうやって",
    "アドバイス",
    "助けて",
    "何をすべき",
    "어떻게",
    "조언",
    "도움",
    "무엇을 해야",
    "कैसे",
    "सलाह",
    "मदद",
    "मुझे क्या करना चाहिए",
    "nasıl",
    "ipuçları",
    "yardım",
    "ne yapmalıyım",
    "hoe",
    "tips",
    "hulp",
    "wat moet ik",
    "jak",
    "wskazówki",
    "pomoc",
    "co powinienem",
    "hur",
    "tips",
    "hjälp",
    "vad ska jag",
    "hvordan",
    "tips",
    "hjælp",
    "hvad skal jeg",
    "hvordan",
    "tips",
    "hjelp",
    "hva skal jeg",
    "miten",
    "vinkkejä",
    "apua",
    "mitä minun pitäisi",
  ];
  return adviceKeywords.some((keyword) => lower.includes(keyword));
}

// Add helper to generate financial advice
function generateFinancialAdvice(
  stats: any,
  question: string,
  language: string
): string {
  const lower = question.toLowerCase();
  const lang = language;

  // Expense reduction advice
  if (
    /reduce|decrease|lower|cut|spend less|expense|expenses|spending|cost|costs|spent|spend|أنفق|مصروف|مصروفات|تقليل|خفض|إنفاق|تكلفة|gastar|gasto|gastos|reducir|disminuir|dépenser|dépense|réduire|diminuer|ausgeben|ausgabe|reduzieren|verringern|тратить|расход|сократить|уменьшить|花|支出|减少|降低|使う|支出|減らす|削減|쓰다|지출|줄이다|감소|खर्च|कम|घटानا|harcama|azaltmak|verminderen|uitgeven|verlagen|wydać|wydatek|zmniejszyć|spendera|utgift|minska|bruge|udgift|reducere|bruke|utgift|redusere|kuluttaa|meno|vähentää/.test(
      lower
    )
  ) {
    const tips =
      lang === "ar"
        ? [
            "راجع مصروفاتك غير الضرورية",
            "خطط ميزانيتك مسبقاً",
            "ابحث عن عروض أفضل",
            "استخدم قسائم الخصم",
            "طبخ الطعام في البيت بدلاً من المطاعم",
          ]
        : [
            "Review your non-essential expenses",
            "Plan your budget in advance",
            "Look for better deals",
            "Use discount coupons",
            "Cook at home instead of eating out",
          ];
    return lang === "ar"
      ? `نصائح لتقليل المصروفات:\n${tips
          .map((tip) => `• ${tip}`)
          .join("\n")}\n\nهل تريد المزيد من النصائح؟`
      : `Tips to reduce expenses:\n${tips
          .map((tip) => `• ${tip}`)
          .join("\n")}\n\nWould you like more tips?`;
  }

  // Income increase advice
  if (
    /increase|earn more|income|salary|make more|كسب|دخل|راتب|زيادة|aumentar|ingreso|salario|ganar|augmenter|revenu|salaire|gagner|erhöhen|einkommen|gehalt|verdienen|увеличить|доход|зарплата|заработать|增加|收入|工资|赚更多|増加|収入|給料|稼ぐ|증가|수입|급여|더 벌다|बढ़ाना|आय|वेतन|कमाना|artırmak|gelir|maaş|kazanmak|verhogen|inkomen|salaris|verdienen|zwiększyć|dochód|pensja|zarabiać|öka|inkomst|lön|tjäna|øge|indkomst|løn|tjene|øke|inntekt|lønn|tjene|lisätä|tulot|palkka|ansaita/.test(
      lower
    )
  ) {
    const tips =
      lang === "ar"
        ? [
            "ابحث عن عمل إضافي",
            "طور مهاراتك",
            "ابدأ مشروعاً جانبياً",
            "استثمر في تعليمك",
            "فاوض على راتب أفضل",
          ]
        : [
            "Look for side jobs",
            "Develop your skills",
            "Start a side project",
            "Invest in your education",
            "Negotiate for better salary",
          ];
    return lang === "ar"
      ? `نصائح لزيادة الدخل:\n${tips
          .map((tip) => `• ${tip}`)
          .join("\n")}\n\nهل تريد المزيد من النصائح؟`
      : `Tips to increase income:\n${tips
          .map((tip) => `• ${tip}`)
          .join("\n")}\n\nWould you like more tips?`;
  }

  // Budget planning advice
  if (
    /budget|planning|plan|ميزانية|تخطيط|planificar|presupuesto|plan|budgeter|planification|budgetieren|planung|бюджет|планирование|план|预算|规划|计划|予算|計画|계획|예산|계획|बजट|योजना|planlama|bütçe|plan|budgetteren|planning|budgetera|planering|budgetere|planlægning|budsjettere|planlegging|budjetoida|suunnittelu/.test(
      lower
    )
  ) {
    const tips =
      lang === "ar"
        ? [
            "قسّم دخلك: 50% للضروريات، 30% للرغبات، 20% للتوفير",
            "استخدم تطبيقات تتبع الميزانية",
            "راجع مصروفاتك شهرياً",
            "حدد أهداف مالية واضحة",
            "احتفظ بصندوق طوارئ",
          ]
        : [
            "Split your income: 50% needs, 30% wants, 20% savings",
            "Use budget tracking apps",
            "Review your expenses monthly",
            "Set clear financial goals",
            "Keep an emergency fund",
          ];
    return lang === "ar"
      ? `نصائح لتخطيط الميزانية:\n${tips
          .map((tip) => `• ${tip}`)
          .join("\n")}\n\nهل تريد المزيد من النصائح؟`
      : `Budget planning tips:\n${tips
          .map((tip) => `• ${tip}`)
          .join("\n")}\n\nWould you like more tips?`;
  }

  // Savings advice
  if (
    /save|savings|tahweel|توفير|ahorrar|ahorro|épargner|épargne|sparen|ersparnis|экономить|сбережения|节省|储蓄|節約|貯金|저축|절약|बचत|saving|tasarruf|sparen|besparingen|oszczędzać|oszczędności|spara|besparingar|spare|opsparing|spare|oppsparing|säästää|säästöt/.test(
      lower
    )
  ) {
    const tips =
      lang === "ar"
        ? [
            "ابدأ بالتوفير الصغير",
            "استخدم قاعدة 20% للتوفير",
            "أعدل مصروفاتك تلقائياً",
            "استثمر في أدوات التوفير",
            "احتفظ بصندوق طوارئ",
          ]
        : [
            "Start with small savings",
            "Use the 20% savings rule",
            "Automate your savings",
            "Invest in savings tools",
            "Keep an emergency fund",
          ];
    return lang === "ar"
      ? `نصائح للتوفير:\n${tips
          .map((tip) => `• ${tip}`)
          .join("\n")}\n\nهل تريد المزيد من النصائح؟`
      : `Savings tips:\n${tips
          .map((tip) => `• ${tip}`)
          .join("\n")}\n\nWould you like more tips?`;
  }

  // General financial advice
  return lang === "ar"
    ? `نصائح مالية عامة:\n• تتبع مصروفاتك\n• خطط ميزانيتك\n• وفر 20% من دخلك\n• استثمر في تعليمك\n• احتفظ بصندوق طوارئ\n\nهل تريد نصائح محددة؟`
    : `General financial tips:\n• Track your expenses\n• Plan your budget\n• Save 20% of your income\n• Invest in your education\n• Keep an emergency fund\n\nWould you like specific tips?`;
}

export async function POST(request: NextRequest) {
  try {
    const { message, language, type } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Check if Gemini API key is configured
    if (!process.env.GEMINI_API_KEY) {
      logger.error("GEMINI_API_KEY not configured");
      return NextResponse.json(
        {
          error:
            "AI service not configured. Please set GEMINI_API_KEY environment variable.",
        },
        { status: 500 }
      );
    }

    // Use provided language or detect it
    let detectedLanguage;
    if (language && typeof language === "string") {
      // Use the language provided by frontend
      detectedLanguage = {
        code: language,
        name: language,
        isRTL: ["ar", "he", "fa", "ur"].includes(language),
      };
      logger.info(
        { detectedLanguage: detectedLanguage.code },
        "Language provided by frontend"
      );
    } else {
      // Fallback to server-side detection
      detectedLanguage = detectLanguage(message);
      logger.info(
        { detectedLanguage: detectedLanguage.code },
        "Language detected by server"
      );
    }

    // Handle CSV import requests
    if (type === "csv_import") {
      try {
        logger.info("Processing CSV import request");

        // Extract CSV data from message
        const csvMatch = message.match(
          /Please analyze and import this CSV file data:\n\n([\s\S]*)/
        );
        if (!csvMatch) {
          return NextResponse.json(
            {
              success: false,
              error: "Invalid CSV import request format",
            },
            { status: 400 }
          );
        }

        const csvText = csvMatch[1];
        const result = await parseCSVWithGemini(csvText);

        // Return preview for user confirmation
        const confirmationMessage = `📄 **CSV Analysis Complete**\n\n${result.preview}\n\nWould you like me to import these transactions to your account?\n\n**Click "Confirm" to import or "Cancel" to abort.**`;

        return NextResponse.json({
          success: true,
          data: {
            message: confirmationMessage,
            type: "csv_preview",
            requiresConfirmation: true,
            suggestions: ["Confirm Import", "Cancel Import"],
          },
        });
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : error },
          "CSV import failed"
        );
        return NextResponse.json(
          {
            success: false,
            error: `CSV import failed: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
          { status: 500 }
        );
      }
    }

    // Handle CSV import confirmation
    if (type === "csv_import_confirm") {
      try {
        logger.info("Processing CSV import confirmation");

        // Extract CSV data from message
        const csvMatch = message.match(/Process CSV import: ([\s\S]*)/);
        if (!csvMatch) {
          return NextResponse.json(
            {
              success: false,
              error: "Invalid CSV import confirmation format",
            },
            { status: 400 }
          );
        }

        const csvText = csvMatch[1];
        const result = await parseCSVWithGemini(csvText);

        // Initialize database
        initDatabase();

        // Get user's default currency
        const userSettings = userSettingsDb.get() || { defaultCurrency: "USD" };
        const defaultCurrency = userSettings.defaultCurrency || "USD";

        let importedCount = 0;
        let failedCount = 0;

        // Import each transaction
        for (const transaction of result.transactions) {
          try {
            // Convert amount to user's default currency if needed
            let finalAmount = transaction.amount;
            let finalCurrency = defaultCurrency;
            let conversionRate = 1;

            // For now, assume CSV amounts are in USD
            const csvCurrency = "USD";
            if (csvCurrency !== defaultCurrency) {
              try {
                const converted = await convertAmount(
                  Math.abs(transaction.amount),
                  csvCurrency,
                  defaultCurrency
                );
                finalAmount = transaction.amount < 0 ? -converted : converted;
                conversionRate = converted / Math.abs(transaction.amount);
                finalCurrency = defaultCurrency;
              } catch (conversionError) {
                logger.warn(
                  {
                    error:
                      conversionError instanceof Error
                        ? conversionError.message
                        : conversionError,
                    fromCurrency: csvCurrency,
                    toCurrency: defaultCurrency,
                  },
                  "Currency conversion failed for CSV import, using original amount"
                );
                finalAmount = transaction.amount;
                finalCurrency = csvCurrency;
                conversionRate = 1;
              }
            }

            // Create transaction record
            const newTransaction = {
              description: transaction.description,
              originalAmount: Math.abs(transaction.amount),
              originalCurrency: csvCurrency,
              convertedAmount: finalAmount,
              convertedCurrency: finalCurrency,
              conversionRate: conversionRate,
              conversionFee: 0,
              category: transaction.category as TransactionCategory,
              date: transaction.date,
              type: transaction.type,
              vendor: transaction.vendor || "CSV Import",
            };

            transactionDb.create(newTransaction);
            importedCount++;
          } catch (transactionError) {
            logger.error(
              {
                error:
                  transactionError instanceof Error
                    ? transactionError.message
                    : transactionError,
                transaction,
              },
              "Failed to import individual transaction"
            );
            failedCount++;
          }
        }

        // Create success message
        let successMessage = `✅ **CSV Import Complete**\n\n`;
        successMessage += `Successfully imported **${importedCount}** transactions`;
        if (failedCount > 0) {
          successMessage += `\n⚠️ Failed to import ${failedCount} transactions`;
        }
        successMessage += `\n\nYour transactions have been added to your account. You can view them in the dashboard.`;

        return NextResponse.json({
          success: true,
          data: {
            message: successMessage,
            type: "csv_success",
          },
        });
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : error },
          "CSV import confirmation failed"
        );
        return NextResponse.json(
          {
            success: false,
            error: `CSV import failed: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
          { status: 500 }
        );
      }
    }

    // Initialize database and get financial data
    try {
      initDatabase();
      const transactions = transactionDb.getAll();

      const totalBalance = transactions.reduce(
        (sum: number, t: any) => sum + (t.amount || 0),
        0
      );
      const income = transactions
        .filter((t: any) => (t.amount || 0) > 0)
        .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
      const expenses = Math.abs(
        transactions
          .filter((t: any) => (t.amount || 0) < 0)
          .reduce((sum: number, t: any) => sum + (t.amount || 0), 0)
      );

      // Format currency based on detected language
      const formattedBalance = formatCurrencyByLanguage(
        totalBalance,
        detectedLanguage.code
      );
      const formattedIncome = formatCurrencyByLanguage(
        income,
        detectedLanguage.code
      );
      const formattedExpenses = formatCurrencyByLanguage(
        expenses,
        detectedLanguage.code
      );

      // Check if the message contains transaction information using AI-powered parsing
      let responseText = "";
      let transactionAdded = false;
      let transactionInfo = null;

      try {
        // Use AI-powered transaction parsing with multi-language support
        const parsedTransaction = await parseTransactionText(message);

        if (
          parsedTransaction.amount !== undefined &&
          parsedTransaction.description
        ) {
          transactionInfo = {
            description: parsedTransaction.description,
            amount: parsedTransaction.amount,
            currency: parsedTransaction.currency,
            category: parsedTransaction.category || "Other",
            type:
              parsedTransaction.type ||
              (parsedTransaction.amount > 0 ? "income" : "expense"),
          } as {
            description: string;
            amount: number;
            currency?: string;
            category: TransactionCategory;
            type: "income" | "expense";
          };
        }
      } catch (parseError) {
        logger.warn(
          {
            error:
              parseError instanceof Error ? parseError.message : parseError,
          },
          "AI transaction parsing failed, falling back to keyword detection"
        );
        // Fallback to keyword-based detection
        const fallbackInfo = extractTransactionFromMessage(
          message,
          detectedLanguage.code
        );
        if (fallbackInfo) {
          transactionInfo = {
            ...fallbackInfo,
            currency: undefined, // Fallback doesn't detect currency
            type: (fallbackInfo.amount > 0 ? "income" : "expense") as
              | "income"
              | "expense",
          };
        }
      }

      if (transactionInfo) {
        // Fallback: detect Arabic currencies in the original message if currency is missing
        if (!transactionInfo.currency) {
          const currencyMap: { [key: string]: string } = {
            "ريال|ريالات|ر.س": "SAR",
            "درهم|درهما|د.إ": "AED",
            "دينار كويتي|د.ك": "KWD",
            "دينار بحريني|د.ب": "BHD",
            "دينار أردني|د.أ": "JOD",
            "جنيه|جنيهات|ج.م": "EGP",
            "ليرة|ليرات|ل.ل": "LBP",
            "دولار|دولار أمريكي": "USD",
            يورو: "EUR",
            "درهم مغربي|د.م": "MAD",
            "دينار جزائري|د.ج": "DZD",
            "دينار تونسي|د.ت": "TND",
            "ريال قطري|ر.ق": "QAR",
          };
          for (const [pattern, code] of Object.entries(currencyMap)) {
            if (new RegExp(pattern, "i").test(message)) {
              transactionInfo.currency = code;
              break;
            }
          }
        }
        // USD fallback: if message contains $ or USD, force currency to USD
        if (/\$|\bUSD\b/i.test(message) && transactionInfo.currency !== "USD") {
          transactionInfo.currency = "USD";
        }
        // Add the transaction to the database
        try {
          // Get user's default currency
          const userSettings = userSettingsDb.get() || {
            defaultCurrency: "USD",
          };
          const defaultCurrency = userSettings.defaultCurrency || "USD";

          // Extract currency from parsed transaction or use default
          const transactionCurrency =
            transactionInfo.currency || defaultCurrency;
          let finalAmount = transactionInfo.amount;
          let finalCurrency = transactionCurrency;
          let conversionRate = 1;

          // Convert to user's default currency if different
          if (transactionCurrency !== defaultCurrency) {
            try {
              console.log(
                `[CONVERT] amount: ${transactionInfo.amount}, from: ${transactionCurrency}, to: ${defaultCurrency}`
              );
              const converted = await convertAmount(
                transactionInfo.amount,
                transactionCurrency,
                defaultCurrency
              );
              console.log(`[CONVERT] result: ${converted}`);
              conversionRate = converted / transactionInfo.amount;
              finalAmount = converted;
              finalCurrency = defaultCurrency;
            } catch (conversionError) {
              logger.warn(
                {
                  error:
                    conversionError instanceof Error
                      ? conversionError.message
                      : conversionError,
                  fromCurrency: transactionCurrency,
                  toCurrency: defaultCurrency,
                },
                "Currency conversion failed, using original amount"
              );
              // Keep original amount if conversion fails
              finalAmount = transactionInfo.amount;
              finalCurrency = transactionCurrency;
              conversionRate = 1;
            }
          }

          // Create transaction with new multi-currency fields
          const newTransaction = {
            description: transactionInfo.description,
            originalAmount: transactionInfo.amount,
            originalCurrency: transactionCurrency,
            convertedAmount: finalAmount,
            convertedCurrency: finalCurrency,
            conversionRate: conversionRate,
            conversionFee: 0, // No fee for now
            category: transactionInfo.category as TransactionCategory,
            date: new Date(),
            type:
              transactionInfo.type ||
              ((transactionInfo.amount > 0 ? "income" : "expense") as
                | "income"
                | "expense"),
            vendor: "Chat Input",
          };

          transactionDb.create(newTransaction);
          transactionAdded = true;

          // Get updated financial data
          const updatedTransactions = transactionDb.getAll();
          const updatedBalance = updatedTransactions.reduce(
            (sum: number, t: any) => sum + (t.convertedAmount || t.amount || 0),
            0
          );
          const updatedFormattedBalance = formatCurrencyByCode(
            updatedBalance,
            defaultCurrency
          );

          // Create success message in the detected language
          // Helper to get currency symbol by code
          function getCurrencySymbol(code: string): string {
            const symbols: Record<string, string> = {
              USD: "$",
              EUR: "€",
              GBP: "£",
              JPY: "¥",
              SAR: "ر.س",
              EGP: "£",
              AED: "د.إ",
              KWD: "د.ك",
              BHD: "ب.د",
              JOD: "د.ا",
              CNY: "¥",
              KRW: "₩",
              INR: "₹",
              RUB: "₽",
              TRY: "₺",
              PLN: "zł",
              SEK: "kr",
              NOK: "kr",
              DKK: "kr",
              MAD: "د.م",
              DZD: "دج",
              TND: "د.ت",
              QAR: "ر.ق",
              LBP: "ل.ل",
              YER: "ر.ي", // Yemeni Rial
            };
            return symbols[code] || code;
          }

          // Format number in English numerals
          function formatNumberEn(num: number): string {
            return num.toLocaleString("en-US", {
              maximumFractionDigits: 2,
              minimumFractionDigits: 2,
            });
          }

          // Format number in English numerals, then append currency symbol
          function formatAmountWithSymbol(num: number, code: string): string {
            return `${formatNumberEn(num)}${getCurrencySymbol(code)}`;
          }

          const originalAmountStr = formatAmountWithSymbol(
            Math.abs(transactionInfo.amount),
            transactionCurrency
          );

          // Short confirmation message in all languages, using English numerals and currency symbol, no balance
          const successMessages: Record<string, string> = {
            ar: `تمت إضافة المعاملة: ${transactionInfo.description} ${originalAmountStr}`,
            en: `Transaction added: ${transactionInfo.description} ${originalAmountStr}`,
            es: `Transacción agregada: ${transactionInfo.description} ${originalAmountStr}`,
            fr: `Transaction ajoutée: ${transactionInfo.description} ${originalAmountStr}`,
            de: `Transaktion hinzugefügt: ${transactionInfo.description} ${originalAmountStr}`,
            ru: `Транзакция добавлена: ${transactionInfo.description} ${originalAmountStr}`,
            zh: `交易已添加: ${transactionInfo.description} ${originalAmountStr}`,
            ja: `取引が追加されました: ${transactionInfo.description} ${originalAmountStr}`,
            ko: `거래가 추가되었습니다: ${transactionInfo.description} ${originalAmountStr}`,
            hi: `लेन-देन जोड़ा गया: ${transactionInfo.description} ${originalAmountStr}`,
            tr: `İşlem eklendi: ${transactionInfo.description} ${originalAmountStr}`,
            nl: `Transactie toegevoegd: ${transactionInfo.description} ${originalAmountStr}`,
            pl: `Transakcja dodana: ${transactionInfo.description} ${originalAmountStr}`,
            sv: `Transaktion tillagd: ${transactionInfo.description} ${originalAmountStr}`,
            da: `Transaktion tilføjet: ${transactionInfo.description} ${originalAmountStr}`,
            no: `Transaksjon lagt til: ${transactionInfo.description} ${originalAmountStr}`,
            fi: `Tapahtuma lisätty: ${transactionInfo.description} ${originalAmountStr}`,
            he: `העסקה נוספה: ${transactionInfo.description} ${originalAmountStr}`,
            fa: `تراکنش اضافه شد: ${transactionInfo.description} ${originalAmountStr}`,
            ur: `لین دین شامل کر دیا گیا: ${transactionInfo.description} ${originalAmountStr}`,
          };

          responseText =
            successMessages[detectedLanguage.code] || successMessages.en;
        } catch (transactionError) {
          logger.error(
            {
              error:
                transactionError instanceof Error
                  ? transactionError.message
                  : transactionError,
            },
            "Transaction addition error"
          );

          const errorMessages: Record<string, string> = {
            ar: "عذراً، حدث خطأ أثناء إضافة المعاملة. يرجى المحاولة مرة أخرى.",
            en: "Sorry, there was an error adding the transaction. Please try again.",
            es: "Lo siento, hubo un error al agregar la transacción. Por favor, inténtalo de nuevo.",
            fr: "Désolé, une erreur s'est produite lors de l'ajout de la transaction. Veuillez réessayer.",
            de: "Entschuldigung, beim Hinzufügen der Transaktion ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.",
            ru: "Извините, произошла ошибка при добавлении транзакции. Пожалуйста, попробуйте еще раз.",
            zh: "抱歉，添加交易时出现错误。请重试。",
            ja: "申し訳ありませんが、取引の追加中にエラーが発生しました。もう一度お試しください。",
            ko: "죄송합니다. 거래를 추가하는 중 오류가 발생했습니다. 다시 시도해 주세요.",
            hi: "क्षमा करें, लेन-देन जोड़ने में त्रुटि हुई। कृपया पुनः प्रयास करें।",
            tr: "Üzgünüm, işlem eklenirken bir hata oluştu. Lütfen tekrar deneyin.",
            nl: "Sorry, er is een fout opgetreden bij het toevoegen van de transactie. Probeer het opnieuw.",
            pl: "Przepraszamy, wystąpił błąd podczas dodawania transakcji. Spróbuj ponownie.",
            sv: "Tyvärr, det uppstod ett fel när transaktionen lades till. Försök igen.",
            da: "Beklager, der opstod en fejl ved tilføjelse af transaktionen. Prøv igen.",
            no: "Beklager, det oppstod en feil ved tilføyelse av transaksjonen. Prøv igjen.",
            fi: "Pahoittelut, tapahtuman lisäämisessä tapahtui virhe. Yritä uudelleen.",
            he: "מצטער, אירעה שגיאה בעת הוספת העסקה. אנא נסה שוב.",
            fa: "متأسفانه، در هنگام افزودن تراکنش خطایی رخ داد. لطفاً دوباره تلاش کنید.",
            ur: "معذرت، لین دین شامل کرنے میں غلطی ہوئی۔ براہ کرم دوبارہ کوشش کریں۔",
          };

          responseText =
            errorMessages[detectedLanguage.code] || errorMessages.en;
        }
      }

      // If no transaction was detected or added, use the regular AI response
      if (!transactionAdded) {
        // Get the appropriate system prompt for the detected language
        const systemPrompt =
          systemPrompts[detectedLanguage.code] || systemPrompts.en;

        const prompt =
          systemPrompt
            .replace("{balance}", formattedBalance)
            .replace("{income}", formattedIncome)
            .replace("{expenses}", formattedExpenses)
            .replace("{transactionCount}", transactions.length.toString()) +
          `\n\nUser message: ${message}`;

        logger.debug(
          {
            promptLength: prompt.length,
            detectedLanguage: detectedLanguage.code,
          },
          "Sending chat request to Gemini"
        );

        const result = await model.generateContent(prompt);
        const response = await result.response;
        responseText = response.text();

        logger.info(
          {
            responseLength: responseText.length,
            detectedLanguage: detectedLanguage.code,
          },
          "Chat response generated successfully"
        );
      }

      // Check for period-based stats question
      const period = parsePeriodFromMessage(message);
      if (period) {
        // Determine if the question is about income, expenses, or both
        const lowerMsg = message.toLowerCase();
        // Stricter mutually exclusive detection
        const expenseRegex =
          /\b(expense|spent|أنفقت|مصروف|مصروفات|gasto|dépense|ausgabe|расход|支出|지출|خَرَجَ|harcama|uitgave|wydatek|utgift|meno)\b/;
        const incomeRegex =
          /\b(income|earned|received|دخل|كسبت|استلمت|ingreso|revenu|einkommen|доход|收入|수입|gelir|inkomen|dochód|inkomst|inntekt|tulot)\b/;
        let statType: "income" | "expenses" | "all" = "all";
        if (expenseRegex.test(lowerMsg) && !incomeRegex.test(lowerMsg))
          statType = "expenses";
        else if (incomeRegex.test(lowerMsg) && !expenseRegex.test(lowerMsg))
          statType = "income";
        // Query stats from DB
        const stats = await transactionDb.getStats(period.start, period.end);
        // Format response
        const getCurrencySymbol = (code: string) =>
          ({
            USD: "$",
            EUR: "€",
            GBP: "£",
            JPY: "¥",
            SAR: "ر.س",
            EGP: "£",
            AED: "د.إ",
            KWD: "د.ك",
            BHD: "ب.د",
            JOD: "د.ا",
            CNY: "¥",
            KRW: "₩",
            INR: "₹",
            RUB: "₽",
            TRY: "₺",
            PLN: "zł",
            SEK: "kr",
            NOK: "kr",
            DKK: "kr",
            MAD: "د.م",
            DZD: "دج",
            TND: "د.ت",
            QAR: "ر.ق",
            LBP: "ل.ل",
            YER: "ر.ي",
          }[code] || code);
        const formatNumberEn = (num: number) =>
          num.toLocaleString("en-US", {
            maximumFractionDigits: 2,
            minimumFractionDigits: 2,
          });
        const currency = stats.defaultCurrency;
        let answer = "";
        if (statType === "income") {
          answer = `${formatNumberEn(stats.totalIncome)}${getCurrencySymbol(
            currency
          )}`;
        } else if (statType === "expenses") {
          answer = `${formatNumberEn(stats.totalExpenses)}${getCurrencySymbol(
            currency
          )}`;
        } else {
          answer = `Income: ${formatNumberEn(
            stats.totalIncome
          )}${getCurrencySymbol(currency)}, Expenses: ${formatNumberEn(
            stats.totalExpenses
          )}${getCurrencySymbol(currency)}, Net: ${formatNumberEn(
            stats.netAmount
          )}${getCurrencySymbol(currency)}`;
        }
        // Localize response
        const periodLabels: Record<string, Record<string, string>> = {
          en: {
            today: "today",
            yesterday: "yesterday",
            "this week": "this week",
            "last week": "last week",
            "this month": "this month",
            "last month": "last month",
          },
          ar: {
            today: "اليوم",
            yesterday: "أمس",
            "this week": "هذا الأسبوع",
            "last week": "الأسبوع الماضي",
            "this month": "هذا الشهر",
            "last month": "الشهر الماضي",
          },
          // Add more as needed
        };
        const lang = detectedLanguage.code;
        const label =
          (periodLabels[lang] && periodLabels[lang][period.label]) ||
          period.label;
        let responseText = "";
        if (statType === "income") {
          // Only show income, bold the amount+currency, keep language order
          if (lang === "ar") {
            responseText = `الدخل ${label}: **${answer}**`;
          } else {
            responseText = `Income ${label}: **${answer}**`;
          }
        } else if (statType === "expenses") {
          // Only show expenses, bold the amount+currency, keep language order
          if (lang === "ar") {
            responseText = `المصروفات ${label}: **${answer}**`;
          } else {
            responseText = `Expenses ${label}: **${answer}**`;
          }
        } else {
          // Show all (income, expenses, net)
          if (lang === "ar") {
            responseText = `الدخل: **${formatNumberEn(
              stats.totalIncome
            )}${getCurrencySymbol(currency)}**, المصروفات: **${formatNumberEn(
              stats.totalExpenses
            )}${getCurrencySymbol(currency)}**, الصافي: **${formatNumberEn(
              stats.netAmount
            )}${getCurrencySymbol(currency)}** (${label})`;
          } else {
            responseText = `Income: **${formatNumberEn(
              stats.totalIncome
            )}${getCurrencySymbol(currency)}**, Expenses: **${formatNumberEn(
              stats.totalExpenses
            )}${getCurrencySymbol(currency)}**, Net: **${formatNumberEn(
              stats.netAmount
            )}${getCurrencySymbol(currency)}** (${label})`;
          }
        }
        // Add interactive follow-up question
        const followUp = generateFollowUpQuestions(
          stats,
          statType,
          period.label,
          lang
        );
        responseText += `\n\n${followUp}`;
        return NextResponse.json({
          success: true,
          data: {
            message: responseText,
            detectedLanguage: lang,
            isRTL: detectedLanguage.isRTL,
            transactionAdded: false,
          },
        });
      }

      // Check for financial advice questions
      if (isFinancialAdviceQuestion(message)) {
        const stats = await transactionDb.getStats();
        const advice = generateFinancialAdvice(
          stats,
          message,
          detectedLanguage.code
        );
        return NextResponse.json({
          success: true,
          data: {
            message: advice,
            detectedLanguage: detectedLanguage.code,
            isRTL: detectedLanguage.isRTL,
            transactionAdded: false,
          },
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          message: responseText,
          detectedLanguage: detectedLanguage.code,
          isRTL: detectedLanguage.isRTL,
          transactionAdded: transactionAdded,
        },
      });
    } catch (dbError) {
      logger.error(
        { error: dbError instanceof Error ? dbError.message : dbError },
        "Database error"
      );

      // Fallback response without database data
      const fallbackPrompt = `You are a smart financial assistant called CoinMind. The user said: "${message}". Please respond in ${detectedLanguage.name} (${detectedLanguage.code}) and be helpful with financial advice.`;

      const result = await model.generateContent(fallbackPrompt);
      const response = await result.response;
      const text = response.text();

      return NextResponse.json({
        success: true,
        data: {
          message: text,
          detectedLanguage: detectedLanguage.code,
          isRTL: detectedLanguage.isRTL,
        },
      });
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : error },
      "Chat API error"
    );
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process chat message. Please try again.",
      },
      { status: 500 }
    );
  }
}

// Function to extract transaction information from user message
function extractTransactionFromMessage(
  message: string,
  languageCode: string
): {
  description: string;
  amount: number;
  category: TransactionCategory;
} | null {
  const lowerMessage = message.toLowerCase();

  // Common transaction keywords in different languages
  const transactionKeywords: Record<string, string[]> = {
    en: [
      "spent",
      "bought",
      "paid",
      "purchased",
      "bought",
      "expense",
      "cost",
      "price",
      "paid",
      "spent",
      "bought",
      "purchased",
    ],
    ar: [
      "أنفقت",
      "اشتريت",
      "دفعت",
      "اشتريت",
      "مشتريات",
      "مصاريف",
      "تكلفة",
      "سعر",
      "دفع",
      "إنفاق",
    ],
    es: [
      "gasté",
      "compré",
      "pagué",
      "adquirí",
      "compra",
      "gasto",
      "costo",
      "precio",
      "pago",
    ],
    fr: [
      "dépensé",
      "acheté",
      "payé",
      "acquis",
      "achat",
      "dépense",
      "coût",
      "prix",
      "paiement",
    ],
    de: [
      "ausgegeben",
      "gekauft",
      "bezahlt",
      "erworben",
      "kauf",
      "ausgabe",
      "kosten",
      "preis",
      "zahlung",
    ],
    ru: [
      "потратил",
      "купил",
      "заплатил",
      "приобрел",
      "покупка",
      "расход",
      "стоимость",
      "цена",
      "платеж",
    ],
    zh: [
      "花了",
      "买了",
      "付了",
      "购买了",
      "购买",
      "支出",
      "费用",
      "价格",
      "付款",
    ],
    ja: [
      "使った",
      "買った",
      "払った",
      "購入した",
      "購入",
      "支出",
      "費用",
      "価格",
      "支払い",
    ],
    ko: [
      "썼다",
      "샀다",
      "냈다",
      "구입했다",
      "구매",
      "지출",
      "비용",
      "가격",
      "결제",
    ],
    hi: [
      "खर्च किया",
      "खरीदा",
      "भुगतान किया",
      "खरीदा",
      "खरीदारी",
      "खर्च",
      "लागत",
      "कीमत",
      "भुगतान",
    ],
    tr: [
      "harcadım",
      "aldım",
      "ödedim",
      "satın aldım",
      "alışveriş",
      "harcama",
      "maliyet",
      "fiyat",
      "ödeme",
    ],
    nl: [
      "uitgegeven",
      "gekocht",
      "betaald",
      "aangeschaft",
      "aankoop",
      "uitgave",
      "kosten",
      "prijs",
      "betaling",
    ],
    pl: [
      "wydałem",
      "kupiłem",
      "zapłaciłem",
      "nabyłem",
      "zakup",
      "wydatek",
      "koszt",
      "cena",
      "płatność",
    ],
    sv: [
      "spenderade",
      "köpte",
      "betalade",
      "förvärvade",
      "köp",
      "utgift",
      "kostnad",
      "pris",
      "betalning",
    ],
    da: [
      "brugte",
      "købte",
      "betalte",
      "anskaffede",
      "køb",
      "udgift",
      "omkostning",
      "pris",
      "betaling",
    ],
    no: [
      "brukte",
      "kjøpte",
      "betalte",
      "anskaffet",
      "kjøp",
      "utgift",
      "kostnad",
      "pris",
      "betaling",
    ],
    fi: [
      "käytin",
      "ostin",
      "maksin",
      "hankin",
      "osto",
      "meno",
      "kustannus",
      "hinta",
      "maksu",
    ],
    he: [
      "הוצאתי",
      "קניתי",
      "שילמתי",
      "רכשתי",
      "קנייה",
      "הוצאה",
      "עלות",
      "מחיר",
      "תשלום",
    ],
    fa: [
      "خرج کردم",
      "خریدم",
      "پرداختم",
      "خریداری کردم",
      "خرید",
      "خرج",
      "هزینه",
      "قیمت",
      "پرداخت",
    ],
    ur: [
      "خرچ کیا",
      "خریدا",
      "ادائیگی کی",
      "خریداری کی",
      "خریداری",
      "خرچ",
      "لاگت",
      "قیمت",
      "ادائیگی",
    ],
  };

  const keywords = transactionKeywords[languageCode] || transactionKeywords.en;

  // Check if message contains transaction keywords
  const hasTransactionKeyword = keywords.some((keyword: string) =>
    lowerMessage.includes(keyword)
  );

  if (!hasTransactionKeyword) {
    return null;
  }

  // Extract amount using currency patterns
  const currencyPatterns: Record<string, RegExp[]> = {
    en: [/\$([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*dollars?/i],
    ar: [
      /ر\.س\s*([0-9,]+\.?[0-9]*)/, // SAR
      /([0-9,]+\.?[0-9]*)\s*ريال/, // SAR generic
      /ر\.ي\s*([0-9,]+\.?[0-9]*)/, // Rial Yemeni symbol
      /([0-9,]+\.?[0-9]*)\s*ريال يمني/, // Rial Yemeni Arabic
    ],
    es: [/€([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*euros?/i],
    fr: [/€([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*euros?/i],
    de: [/€([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*euros?/i],
    ru: [/₽([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*рублей?/i],
    zh: [/¥([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*元/],
    ja: [/¥([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*円/],
    ko: [/₩([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*원/],
    hi: [/₹([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*रुपये/],
    tr: [/₺([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*lira/],
    nl: [/€([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*euros?/i],
    pl: [/zł([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*złoty/],
    sv: [/kr([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*kronor/],
    da: [/kr([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*kroner/],
    no: [/kr([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*kroner/],
    fi: [/€([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*euroa/],
    he: [/₪([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*שקלים/],
    fa: [/ریال([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*ریال/],
    ur: [/₨([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*روپے/],
  };

  const patterns = currencyPatterns[languageCode] || currencyPatterns.en;

  let amount = 0;
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      const amountStr = match[1].replace(/,/g, "");
      amount = parseFloat(amountStr);
      if (!isNaN(amount)) {
        break;
      }
    }
  }

  // If no amount found, try to extract numbers
  if (amount === 0) {
    const numberMatch = message.match(/([0-9,]+\.?[0-9]*)/);
    if (numberMatch) {
      const amountStr = numberMatch[1].replace(/,/g, "");
      amount = parseFloat(amountStr);
    }
  }

  if (amount === 0) {
    return null;
  }

  // Determine if it's income or expense based on keywords
  const incomeKeywords: Record<string, string[]> = {
    en: ["earned", "received", "income", "salary", "payment", "deposit"],
    ar: ["كسبت", "استلمت", "دخل", "راتب", "دفع", "إيداع"],
    es: ["gané", "recibí", "ingreso", "salario", "pago", "depósito"],
    fr: ["gagné", "reçu", "revenu", "salaire", "paiement", "dépôt"],
    de: [
      "verdient",
      "erhalten",
      "einkommen",
      "gehalt",
      "zahlung",
      "einzahlung",
    ],
    ru: ["заработал", "получил", "доход", "зарплата", "платеж", "депозит"],
    zh: ["赚了", "收到了", "收入", "工资", "付款", "存款"],
    ja: ["稼いだ", "受け取った", "収入", "給料", "支払い", "預金"],
    ko: ["벌었다", "받았다", "수입", "급여", "지불", "예금"],
    hi: ["कमाया", "प्राप्त किया", "आय", "वेतन", "भुगतान", "जमा"],
    tr: ["kazandım", "aldım", "gelir", "maaş", "ödeme", "mevduat"],
    nl: ["verdiend", "ontvangen", "inkomen", "salaris", "betaling", "storting"],
    pl: ["zarobiłem", "otrzymałem", "dochód", "pensja", "płatność", "wpłata"],
    sv: ["tjänade", "fick", "inkomst", "lön", "betalning", "insättning"],
    da: ["tjente", "modtog", "indkomst", "løn", "betaling", "indskud"],
    no: ["tjente", "mottok", "inntekt", "lønn", "betaling", "innskudd"],
    fi: ["ansaitin", "sain", "tulot", "palkka", "maksu", "talletus"],
    he: ["הרווחתי", "קיבלתי", "הכנסה", "משכורת", "תשלום", "הפקדה"],
    fa: ["کسب کردم", "دریافت کردم", "درآمد", "حقوق", "پرداخت", "سپرده"],
    ur: ["کمایا", "حاصل کیا", "آمدنی", "تنخواہ", "ادائیگی", "جمع"],
  };

  const incomeKeys = incomeKeywords[languageCode] || incomeKeywords.en;
  const isIncome = incomeKeys.some((keyword: string) =>
    lowerMessage.includes(keyword)
  );

  // Make amount negative for expenses (default behavior)
  if (!isIncome) {
    amount = -Math.abs(amount);
  }

  // Extract description (remove amount and common words)
  let description = message;

  // Remove amount patterns
  patterns.forEach((pattern: RegExp) => {
    description = description.replace(pattern, "");
  });

  // Remove common transaction words
  const commonWords: Record<string, string[]> = {
    en: [
      "for",
      "on",
      "at",
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "to",
      "of",
      "with",
      "by",
    ],
    ar: ["في", "على", "إلى", "من", "مع", "ب", "ل", "عن", "حول", "خلال"],
    es: [
      "para",
      "en",
      "a",
      "de",
      "con",
      "por",
      "sin",
      "sobre",
      "entre",
      "hacia",
    ],
    fr: [
      "pour",
      "en",
      "à",
      "de",
      "avec",
      "par",
      "sans",
      "sur",
      "entre",
      "vers",
    ],
    de: [
      "für",
      "in",
      "an",
      "von",
      "mit",
      "durch",
      "ohne",
      "auf",
      "zwischen",
      "zu",
    ],
    ru: ["для", "в", "на", "от", "с", "через", "без", "над", "между", "к"],
    zh: ["为", "在", "到", "的", "和", "或", "但", "在", "向", "与"],
    ja: ["の", "に", "で", "を", "と", "や", "が", "は", "も", "から"],
    ko: ["을", "를", "에", "에서", "로", "와", "과", "이", "가", "의"],
    hi: ["के", "को", "से", "में", "पर", "और", "या", "लेकिन", "तक", "द्वारा"],
    tr: ["için", "de", "da", "ile", "den", "dan", "ve", "veya", "ama", "kadar"],
    nl: [
      "voor",
      "in",
      "op",
      "van",
      "met",
      "door",
      "zonder",
      "over",
      "tussen",
      "naar",
    ],
    pl: ["dla", "w", "na", "od", "z", "przez", "bez", "nad", "między", "do"],
    sv: [
      "för",
      "i",
      "på",
      "av",
      "med",
      "genom",
      "utan",
      "över",
      "mellan",
      "till",
    ],
    da: [
      "for",
      "i",
      "på",
      "af",
      "med",
      "gennem",
      "uden",
      "over",
      "mellem",
      "til",
    ],
    no: [
      "for",
      "i",
      "på",
      "av",
      "med",
      "gjennom",
      "uten",
      "over",
      "mellom",
      "til",
    ],
    fi: [
      "varten",
      "ssa",
      "lla",
      "sta",
      "lla",
      "kautta",
      "ilman",
      "lla",
      "välissä",
      "kohti",
    ],
    he: ["עבור", "ב", "על", "מ", "עם", "דרך", "בלי", "מעל", "בין", "אל"],
    fa: [
      "برای",
      "در",
      "روی",
      "از",
      "با",
      "از طریق",
      "بدون",
      "روی",
      "بین",
      "به",
    ],
    ur: [
      "کے لیے",
      "میں",
      "پر",
      "سے",
      "کے ساتھ",
      "کے ذریعے",
      "بغیر",
      "اوپر",
      "درمیان",
      "کی طرف",
    ],
  };

  const wordsToRemove = commonWords[languageCode] || commonWords.en;
  wordsToRemove.forEach((word: string) => {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    description = description.replace(regex, "");
  });

  // Clean up description
  description = description.replace(/\s+/g, " ").trim();

  // If description is too short, use a generic one
  if (description.length < 3) {
    const genericDescriptions: Record<string, string> = {
      en: "Transaction",
      ar: "معاملة",
      es: "Transacción",
      fr: "Transaction",
      de: "Transaktion",
      ru: "Транзакция",
      zh: "交易",
      ja: "取引",
      ko: "거래",
      hi: "लेन-देन",
      tr: "İşlem",
      nl: "Transactie",
      pl: "Transakcja",
      sv: "Transaktion",
      da: "Transaktion",
      no: "Transaksjon",
      fi: "Tapahtuma",
      he: "עסקה",
      fa: "تراکنش",
      ur: "لین دین",
    };
    description = genericDescriptions[languageCode] || genericDescriptions.en;
  }

  // Determine category based on keywords
  const categoryKeywords: Record<string, Record<string, string[]>> = {
    "Food & Drink": {
      en: [
        "food",
        "lunch",
        "dinner",
        "breakfast",
        "coffee",
        "restaurant",
        "meal",
        "snack",
        "groceries",
      ],
      ar: [
        "طعام",
        "غداء",
        "عشاء",
        "إفطار",
        "قهوة",
        "مطعم",
        "وجبة",
        "وجبة خفيفة",
        "بقالة",
      ],
      es: [
        "comida",
        "almuerzo",
        "cena",
        "desayuno",
        "café",
        "restaurante",
        "comida",
        "snack",
        "comestibles",
      ],
      fr: [
        "nourriture",
        "déjeuner",
        "dîner",
        "petit-déjeuner",
        "café",
        "restaurant",
        "repas",
        "collation",
        "épicerie",
      ],
      de: [
        "essen",
        "mittagessen",
        "abendessen",
        "frühstück",
        "kaffee",
        "restaurant",
        "mahlzeit",
        "snack",
        "lebensmittel",
      ],
      ru: [
        "еда",
        "обед",
        "ужин",
        "завтрак",
        "кофе",
        "ресторан",
        "еда",
        "закуска",
        "продукты",
      ],
      zh: [
        "食物",
        "午餐",
        "晚餐",
        "早餐",
        "咖啡",
        "餐厅",
        "餐",
        "零食",
        "杂货",
      ],
      ja: [
        "食べ物",
        "昼食",
        "夕食",
        "朝食",
        "コーヒー",
        "レストラン",
        "食事",
        "スナック",
        "食料品",
      ],
      ko: [
        "음식",
        "점심",
        "저녁",
        "아침",
        "커피",
        "레스토랑",
        "식사",
        "간식",
        "식료품",
      ],
      hi: [
        "भोजन",
        "दोपहर का भोजन",
        "रात का भोजन",
        "नाश्ता",
        "कॉफी",
        "रेस्तरां",
        "भोजन",
        "नाश्ता",
        "किराना",
      ],
      tr: [
        "yemek",
        "öğle yemeği",
        "akşam yemeği",
        "kahvaltı",
        "kahve",
        "restoran",
        "yemek",
        "atıştırmalık",
        "market",
      ],
      nl: [
        "eten",
        "lunch",
        "diner",
        "ontbijt",
        "koffie",
        "restaurant",
        "maaltijd",
        "snack",
        "boodschappen",
      ],
      pl: [
        "jedzenie",
        "obiad",
        "kolacja",
        "śniadanie",
        "kawa",
        "restauracja",
        "posiłek",
        "przekąska",
        "artykuły spożywcze",
      ],
      sv: [
        "mat",
        "lunch",
        "middag",
        "frukost",
        "kaffe",
        "restaurang",
        "måltid",
        "snack",
        "livsmedel",
      ],
      da: [
        "mad",
        "frokost",
        "aftensmad",
        "morgenmad",
        "kaffe",
        "restaurant",
        "måltid",
        "snack",
        "dagligvarer",
      ],
      no: [
        "mat",
        "lunsj",
        "middag",
        "frokost",
        "kaffe",
        "restaurant",
        "måltid",
        "snack",
        "dagligvarer",
      ],
      fi: [
        "ruoka",
        "lounas",
        "illallinen",
        "aamiainen",
        "kahvi",
        "ravintola",
        "ateria",
        "naposteltava",
        "ruokakauppa",
      ],
      he: [
        "אוכל",
        "צהריים",
        "ערב",
        "בוקר",
        "קפה",
        "מסעדה",
        "ארוחה",
        "חטיף",
        "מזון",
      ],
      fa: [
        "غذا",
        "ناهار",
        "شام",
        "صبحانه",
        "قهوه",
        "رستوران",
        "وعده",
        "تنقلات",
        "مواد غذایی",
      ],
      ur: [
        "کھانا",
        "دوپہر کا کھانا",
        "رات کا کھانا",
        "ناشتہ",
        "کافی",
        "ریستوران",
        "کھانا",
        "ناشتہ",
        "کریانہ",
      ],
    },
    Transportation: {
      en: [
        "transport",
        "bus",
        "train",
        "taxi",
        "uber",
        "gas",
        "fuel",
        "parking",
        "metro",
        "subway",
      ],
      ar: [
        "مواصلات",
        "حافلة",
        "قطار",
        "تاكسي",
        "أوبر",
        "بنزين",
        "وقود",
        "موقف",
        "مترو",
      ],
      es: [
        "transporte",
        "autobús",
        "tren",
        "taxi",
        "uber",
        "gasolina",
        "combustible",
        "estacionamiento",
        "metro",
      ],
      fr: [
        "transport",
        "bus",
        "train",
        "taxi",
        "uber",
        "essence",
        "carburant",
        "parking",
        "métro",
      ],
      de: [
        "transport",
        "bus",
        "zug",
        "taxi",
        "uber",
        "benzin",
        "kraftstoff",
        "parkplatz",
        "u-bahn",
      ],
      ru: [
        "транспорт",
        "автобус",
        "поезд",
        "такси",
        "убер",
        "бензин",
        "топливо",
        "парковка",
        "метро",
      ],
      zh: [
        "交通",
        "公交车",
        "火车",
        "出租车",
        "优步",
        "汽油",
        "燃料",
        "停车",
        "地铁",
      ],
      ja: [
        "交通",
        "バス",
        "電車",
        "タクシー",
        "ウーバー",
        "ガソリン",
        "燃料",
        "駐車場",
        "地下鉄",
      ],
      ko: [
        "교통",
        "버스",
        "기차",
        "택시",
        "우버",
        "가스",
        "연료",
        "주차",
        "지하철",
      ],
      hi: [
        "परिवहन",
        "बस",
        "ट्रेन",
        "टैक्सी",
        "उबर",
        "पेट्रोल",
        "ईंधन",
        "पार्किंग",
        "मेट्रो",
      ],
      tr: [
        "ulaşım",
        "otobüs",
        "tren",
        "taksi",
        "uber",
        "benzin",
        "yakıt",
        "otopark",
        "metro",
      ],
      nl: [
        "vervoer",
        "bus",
        "trein",
        "taxi",
        "uber",
        "benzine",
        "brandstof",
        "parkeren",
        "metro",
      ],
      pl: [
        "transport",
        "autobus",
        "pociąg",
        "taksówka",
        "uber",
        "benzyna",
        "paliwo",
        "parking",
        "metro",
      ],
      sv: [
        "transport",
        "buss",
        "tåg",
        "taxi",
        "uber",
        "bensin",
        "bränsle",
        "parkering",
        "tunnelbana",
      ],
      da: [
        "transport",
        "bus",
        "tog",
        "taxi",
        "uber",
        "benzin",
        "brændstof",
        "parkering",
        "metro",
      ],
      no: [
        "transport",
        "buss",
        "tog",
        "taxi",
        "uber",
        "bensin",
        "drivstoff",
        "parkering",
        "t-bane",
      ],
      fi: [
        "liikenne",
        "bussi",
        "juna",
        "taksi",
        "uber",
        "bensiini",
        "polttoaine",
        "pysäköinti",
        "metro",
      ],
      he: [
        "תחבורה",
        "אוטובוס",
        "רכבת",
        "מונית",
        "אובר",
        "דלק",
        "דלק",
        "חניה",
        "רכבת תחתית",
      ],
      fa: [
        "حمل و نقل",
        "اتوبوس",
        "قطار",
        "تاکسی",
        "اوبر",
        "بنزین",
        "سوخت",
        "پارکینگ",
        "مترو",
      ],
      ur: [
        "نقل و حمل",
        "بس",
        "ٹرین",
        "ٹیکسی",
        "اوبر",
        "پیٹرول",
        "ایندھن",
        "پارکنگ",
        "مترو",
      ],
    },
    Entertainment: {
      en: [
        "movie",
        "cinema",
        "theater",
        "concert",
        "show",
        "game",
        "entertainment",
        "fun",
        "leisure",
      ],
      ar: [
        "فيلم",
        "سينما",
        "مسرح",
        "حفلة موسيقية",
        "عرض",
        "لعبة",
        "ترفيه",
        "مرح",
        "ترفيه",
      ],
      es: [
        "película",
        "cine",
        "teatro",
        "concierto",
        "espectáculo",
        "juego",
        "entretenimiento",
        "diversión",
        "ocio",
      ],
      fr: [
        "film",
        "cinéma",
        "théâtre",
        "concert",
        "spectacle",
        "jeu",
        "divertissement",
        "amusement",
        "loisir",
      ],
      de: [
        "film",
        "kino",
        "theater",
        "konzert",
        "show",
        "spiel",
        "unterhaltung",
        "spaß",
        "freizeit",
      ],
      ru: [
        "фильм",
        "кино",
        "театр",
        "концерт",
        "шоу",
        "игра",
        "развлечения",
        "веселье",
        "досуг",
      ],
      zh: [
        "电影",
        "电影院",
        "剧院",
        "音乐会",
        "表演",
        "游戏",
        "娱乐",
        "乐趣",
        "休闲",
      ],
      ja: [
        "映画",
        "映画館",
        "劇場",
        "コンサート",
        "ショー",
        "ゲーム",
        "エンターテイメント",
        "楽しみ",
        "レジャー",
      ],
      ko: [
        "영화",
        "영화관",
        "극장",
        "콘서트",
        "쇼",
        "게임",
        "엔터테인먼트",
        "재미",
        "여가",
      ],
      hi: [
        "फिल्म",
        "सिनेमा",
        "थिएटर",
        "कॉन्सर्ट",
        "शो",
        "खेल",
        "मनोरंजन",
        "मज़ा",
        "अवकाश",
      ],
      tr: [
        "film",
        "sinema",
        "tiyatro",
        "konser",
        "gösteri",
        "oyun",
        "eğlence",
        "eğlence",
        "boş zaman",
      ],
      nl: [
        "film",
        "bioscoop",
        "theater",
        "concert",
        "show",
        "spel",
        "entertainment",
        "plezier",
        "vrije tijd",
      ],
      pl: [
        "film",
        "kino",
        "teatr",
        "koncert",
        "show",
        "gra",
        "rozrywka",
        "zabawa",
        "wypoczynek",
      ],
      sv: [
        "film",
        "bio",
        "teater",
        "konsert",
        "show",
        "spel",
        "underhållning",
        "nöje",
        "fritid",
      ],
      da: [
        "film",
        "biograf",
        "teater",
        "koncert",
        "show",
        "spil",
        "underholdning",
        "sjov",
        "fritid",
      ],
      no: [
        "film",
        "kino",
        "teater",
        "konsert",
        "show",
        "spill",
        "underholdning",
        "moro",
        "fritid",
      ],
      fi: [
        "elokuva",
        "elokuvateatteri",
        "teatteri",
        "konsertti",
        "show",
        "peli",
        "viihde",
        "hauskaa",
        "vapaa-aika",
      ],
      he: [
        "סרט",
        "קולנוע",
        "תיאטרון",
        "קונצרט",
        "מופע",
        "משחק",
        "בידור",
        "כיף",
        "פנאי",
      ],
      fa: [
        "فیلم",
        "سینما",
        "تئاتر",
        "کنسرت",
        "نمایش",
        "بازی",
        "سرگرمی",
        "سرگرمی",
        "اوقات فراغت",
      ],
      ur: [
        "فلم",
        "سینما",
        "تھیٹر",
        "کنسرٹ",
        "شو",
        "گیم",
        "تفریح",
        "مزہ",
        "فرصت",
      ],
    },
  };

  let category: TransactionCategory = "Other";
  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    const langKeywords = keywords[languageCode] || keywords.en;
    if (
      langKeywords.some((keyword: string) => lowerMessage.includes(keyword))
    ) {
      category = cat as TransactionCategory;
      break;
    }
  }

  return {
    description,
    amount,
    category,
  };
}
