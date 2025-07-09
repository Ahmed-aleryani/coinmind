import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { transactionDb, initDatabase } from '@/lib/db/schema';
import { detectLanguage, formatCurrencyByLanguage } from '@/lib/utils/language-detection';
import { TransactionCategory } from '@/lib/types/transaction';
import { parseTransactionText } from '@/lib/api/gemini';
import logger from '@/lib/utils/logger';
import { userSettingsDb } from '@/lib/db/schema';
import { convertAmount } from '@/lib/utils/currency';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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
- "آپ کا بیلنس مثبت ہے! یہ بہت اچھا ہے۔ کیا آپ اپنے بجٹ کی منصوبہ بندی میں مدد چاہتے ہیں؟"`
};

// Helper function to format currency based on currency code
function formatCurrencyByCode(amount: number, currencyCode: string): string {
  const currencyFormats: Record<string, { locale: string; currency: string }> = {
    USD: { locale: 'en-US', currency: 'USD' },
    EUR: { locale: 'de-DE', currency: 'EUR' },
    SAR: { locale: 'ar-SA', currency: 'SAR' },
    GBP: { locale: 'en-GB', currency: 'GBP' },
    JPY: { locale: 'ja-JP', currency: 'JPY' },
    CNY: { locale: 'zh-CN', currency: 'CNY' },
    KRW: { locale: 'ko-KR', currency: 'KRW' },
    INR: { locale: 'hi-IN', currency: 'INR' },
    RUB: { locale: 'ru-RU', currency: 'RUB' },
    TRY: { locale: 'tr-TR', currency: 'TRY' },
    PLN: { locale: 'pl-PL', currency: 'PLN' },
    SEK: { locale: 'sv-SE', currency: 'SEK' },
    DKK: { locale: 'da-DK', currency: 'DKK' },
    NOK: { locale: 'no-NO', currency: 'NOK' },
    ILS: { locale: 'he-IL', currency: 'ILS' },
    IRR: { locale: 'fa-IR', currency: 'IRR' },
    PKR: { locale: 'ur-PK', currency: 'PKR' }
  };

  const format = currencyFormats[currencyCode] || currencyFormats.USD;
  
  try {
    return new Intl.NumberFormat(format.locale, {
      style: 'currency',
      currency: format.currency
    }).format(amount);
  } catch (error) {
    // Fallback to USD
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { message, language } = await request.json();
    
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Check if Gemini API key is configured
    if (!process.env.GEMINI_API_KEY) {
      logger.error('GEMINI_API_KEY not configured');
      return NextResponse.json({ 
        error: 'AI service not configured. Please set GEMINI_API_KEY environment variable.' 
      }, { status: 500 });
    }

    // Use provided language or detect it
    let detectedLanguage;
    if (language && typeof language === 'string') {
      // Use the language provided by frontend
      detectedLanguage = {
        code: language,
        name: language,
        isRTL: ['ar', 'he', 'fa', 'ur'].includes(language)
      };
      logger.info({ detectedLanguage: detectedLanguage.code }, 'Language provided by frontend');
    } else {
      // Fallback to server-side detection
      detectedLanguage = detectLanguage(message);
      logger.info({ detectedLanguage: detectedLanguage.code }, 'Language detected by server');
    }

    // Initialize database and get financial data
    try {
      initDatabase();
      const transactions = transactionDb.getAll();
      
      const totalBalance = transactions.reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
      const income = transactions
        .filter((t: any) => (t.amount || 0) > 0)
        .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
      const expenses = Math.abs(transactions
        .filter((t: any) => (t.amount || 0) < 0)
        .reduce((sum: number, t: any) => sum + (t.amount || 0), 0));

      // Format currency based on detected language
      const formattedBalance = formatCurrencyByLanguage(totalBalance, detectedLanguage.code);
      const formattedIncome = formatCurrencyByLanguage(income, detectedLanguage.code);
      const formattedExpenses = formatCurrencyByLanguage(expenses, detectedLanguage.code);

      // Check if the message contains transaction information using AI-powered parsing
      let responseText = '';
      let transactionAdded = false;
      let transactionInfo = null;

      try {
        // Use AI-powered transaction parsing with multi-language support
        const parsedTransaction = await parseTransactionText(message);
        
        if (parsedTransaction.amount !== undefined && parsedTransaction.description) {
          transactionInfo = {
            description: parsedTransaction.description,
            amount: parsedTransaction.amount,
            currency: parsedTransaction.currency,
            category: parsedTransaction.category || 'Other',
            type: parsedTransaction.type || (parsedTransaction.amount > 0 ? 'income' : 'expense')
          } as { description: string; amount: number; currency?: string; category: TransactionCategory; type: 'income' | 'expense' };
        }
      } catch (parseError) {
        logger.warn({ error: parseError instanceof Error ? parseError.message : parseError }, 'AI transaction parsing failed, falling back to keyword detection');
        // Fallback to keyword-based detection
        const fallbackInfo = extractTransactionFromMessage(message, detectedLanguage.code);
        if (fallbackInfo) {
          transactionInfo = {
            ...fallbackInfo,
            currency: undefined, // Fallback doesn't detect currency
            type: (fallbackInfo.amount > 0 ? 'income' : 'expense') as 'income' | 'expense'
          };
        }
      }

      if (transactionInfo) {
        // Fallback: detect Arabic currencies in the original message if currency is missing
        if (!transactionInfo.currency) {
          const currencyMap: { [key: string]: string } = {
            'ريال|ريالات|ر\.س': 'SAR',
            'درهم|درهما|د\.إ': 'AED',
            'دينار كويتي|د\.ك': 'KWD',
            'دينار بحريني|د\.ب': 'BHD',
            'دينار أردني|د\.أ': 'JOD',
            'جنيه|جنيهات|ج\.م': 'EGP',
            'ليرة|ليرات|ل\.ل': 'LBP',
            'دولار|دولار أمريكي': 'USD',
            'يورو': 'EUR',
            'درهم مغربي|د\.م': 'MAD',
            'دينار جزائري|د\.ج': 'DZD',
            'دينار تونسي|د\.ت': 'TND',
            'ريال قطري|ر\.ق': 'QAR'
          };
          for (const [pattern, code] of Object.entries(currencyMap)) {
            if (new RegExp(pattern, 'i').test(message)) {
              transactionInfo.currency = code;
              break;
            }
          }
        }
        // USD fallback: if message contains $ or USD, force currency to USD
        if ((/\$|\bUSD\b/i.test(message)) && transactionInfo.currency !== 'USD') {
          transactionInfo.currency = 'USD';
        }
        // Add the transaction to the database
        try {
          // Get user's default currency
          const userSettings = userSettingsDb.get() || { defaultCurrency: 'USD' };
          const defaultCurrency = userSettings.defaultCurrency || 'USD';

          // Extract currency from parsed transaction or use default
          const transactionCurrency = transactionInfo.currency || defaultCurrency;
          let finalAmount = transactionInfo.amount;
          let finalCurrency = transactionCurrency;
          let conversionRate = 1;

          // Convert to user's default currency if different
          if (transactionCurrency !== defaultCurrency) {
            try {
              console.log(`[CONVERT] amount: ${transactionInfo.amount}, from: ${transactionCurrency}, to: ${defaultCurrency}`);
              const converted = await convertAmount(transactionInfo.amount, transactionCurrency, defaultCurrency);
              console.log(`[CONVERT] result: ${converted}`);
              conversionRate = converted / transactionInfo.amount;
              finalAmount = converted;
              finalCurrency = defaultCurrency;
            } catch (conversionError) {
              logger.warn({ 
                error: conversionError instanceof Error ? conversionError.message : conversionError,
                fromCurrency: transactionCurrency,
                toCurrency: defaultCurrency 
              }, 'Currency conversion failed, using original amount');
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
            type: transactionInfo.type || (transactionInfo.amount > 0 ? 'income' : 'expense') as 'income' | 'expense',
            vendor: 'Chat Input'
          };
          
          transactionDb.create(newTransaction);
          transactionAdded = true;
          
          // Get updated financial data
          const updatedTransactions = transactionDb.getAll();
          const updatedBalance = updatedTransactions.reduce((sum: number, t: any) => sum + (t.convertedAmount || t.amount || 0), 0);
          const updatedFormattedBalance = formatCurrencyByCode(updatedBalance, defaultCurrency);
          
          // Create success message in the detected language
          const successMessages: Record<string, string> = {
            ar: `تم إضافة المعاملة بنجاح! ${transactionInfo.description} بقيمة ${formatCurrencyByCode(Math.abs(finalAmount), finalCurrency)}. رصيدك الجديد هو ${updatedFormattedBalance}.`,
            en: `Transaction added successfully! ${transactionInfo.description} for ${formatCurrencyByCode(Math.abs(finalAmount), finalCurrency)}. Your new balance is ${updatedFormattedBalance}.`,
            es: `¡Transacción agregada exitosamente! ${transactionInfo.description} por ${formatCurrencyByCode(Math.abs(finalAmount), finalCurrency)}. Tu nuevo saldo es ${updatedFormattedBalance}.`,
            fr: `Transaction ajoutée avec succès ! ${transactionInfo.description} pour ${formatCurrencyByCode(Math.abs(finalAmount), finalCurrency)}. Votre nouveau solde est ${updatedFormattedBalance}.`,
            de: `Transaktion erfolgreich hinzugefügt! ${transactionInfo.description} für ${formatCurrencyByCode(Math.abs(finalAmount), finalCurrency)}. Ihr neuer Kontostand ist ${updatedFormattedBalance}.`,
            ru: `Транзакция успешно добавлена! ${transactionInfo.description} на ${formatCurrencyByCode(Math.abs(finalAmount), finalCurrency)}. Ваш новый баланс ${updatedFormattedBalance}.`,
            zh: `交易添加成功！${transactionInfo.description} ${formatCurrencyByCode(Math.abs(finalAmount), finalCurrency)}。您的新余额是${updatedFormattedBalance}。`,
            ja: `取引が正常に追加されました！${transactionInfo.description} ${formatCurrencyByCode(Math.abs(finalAmount), finalCurrency)}。新しい残高は${updatedFormattedBalance}です。`,
            ko: `거래가 성공적으로 추가되었습니다! ${transactionInfo.description} ${formatCurrencyByCode(Math.abs(finalAmount), finalCurrency)}. 새로운 잔액은 ${updatedFormattedBalance}입니다.`,
            hi: `लेन-देन सफलतापूर्वक जोड़ा गया! ${transactionInfo.description} ${formatCurrencyByCode(Math.abs(finalAmount), finalCurrency)} के लिए। आपका नया शेष ${updatedFormattedBalance} है।`,
            tr: `İşlem başarıyla eklendi! ${transactionInfo.description} ${formatCurrencyByCode(Math.abs(finalAmount), finalCurrency)} için. Yeni bakiyeniz ${updatedFormattedBalance}.`,
            nl: `Transactie succesvol toegevoegd! ${transactionInfo.description} voor ${formatCurrencyByCode(Math.abs(finalAmount), finalCurrency)}. Je nieuwe saldo is ${updatedFormattedBalance}.`,
            pl: `Transakcja została pomyślnie dodana! ${transactionInfo.description} za ${formatCurrencyByCode(Math.abs(finalAmount), finalCurrency)}. Twoje nowe saldo to ${updatedFormattedBalance}.`,
            sv: `Transaktion tillagd framgångsrikt! ${transactionInfo.description} för ${formatCurrencyByCode(Math.abs(finalAmount), finalCurrency)}. Ditt nya saldo är ${updatedFormattedBalance}.`,
            da: `Transaktion tilføjet succesfuldt! ${transactionInfo.description} for ${formatCurrencyByCode(Math.abs(finalAmount), finalCurrency)}. Din nye saldo er ${updatedFormattedBalance}.`,
            no: `Transaksjon lagt til! ${transactionInfo.description} for ${formatCurrencyByCode(Math.abs(finalAmount), finalCurrency)}. Din nye saldo er ${updatedFormattedBalance}.`,
            fi: `Tapahtuma lisätty onnistuneesti! ${transactionInfo.description} ${formatCurrencyByCode(Math.abs(finalAmount), finalCurrency)} kohden. Uusi saldosi on ${updatedFormattedBalance}.`,
            he: `העסקה נוספה בהצלחה! ${transactionInfo.description} עבור ${formatCurrencyByCode(Math.abs(finalAmount), finalCurrency)}. היתרה החדשה שלך היא ${updatedFormattedBalance}.`,
            fa: `تراکنش با موفقیت اضافه شد! ${transactionInfo.description} برای ${formatCurrencyByCode(Math.abs(finalAmount), finalCurrency)}. موجودی جدید شما ${updatedFormattedBalance} است.`,
            ur: `لین دین کامیابی سے شامل کر دیا گیا! ${transactionInfo.description} ${formatCurrencyByCode(Math.abs(finalAmount), finalCurrency)} کے لیے۔ آپ کا نیا بیلنس ${updatedFormattedBalance} ہے۔`
          };
          
          responseText = successMessages[detectedLanguage.code] || successMessages.en;
          
        } catch (transactionError) {
          logger.error({ error: transactionError instanceof Error ? transactionError.message : transactionError }, 'Transaction addition error');
          
          const errorMessages: Record<string, string> = {
            ar: 'عذراً، حدث خطأ أثناء إضافة المعاملة. يرجى المحاولة مرة أخرى.',
            en: 'Sorry, there was an error adding the transaction. Please try again.',
            es: 'Lo siento, hubo un error al agregar la transacción. Por favor, inténtalo de nuevo.',
            fr: 'Désolé, une erreur s\'est produite lors de l\'ajout de la transaction. Veuillez réessayer.',
            de: 'Entschuldigung, beim Hinzufügen der Transaktion ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.',
            ru: 'Извините, произошла ошибка при добавлении транзакции. Пожалуйста, попробуйте еще раз.',
            zh: '抱歉，添加交易时出现错误。请重试。',
            ja: '申し訳ありませんが、取引の追加中にエラーが発生しました。もう一度お試しください。',
            ko: '죄송합니다. 거래를 추가하는 중 오류가 발생했습니다. 다시 시도해 주세요.',
            hi: 'क्षमा करें, लेन-देन जोड़ने में त्रुटि हुई। कृपया पुनः प्रयास करें।',
            tr: 'Üzgünüm, işlem eklenirken bir hata oluştu. Lütfen tekrar deneyin.',
            nl: 'Sorry, er is een fout opgetreden bij het toevoegen van de transactie. Probeer het opnieuw.',
            pl: 'Przepraszamy, wystąpił błąd podczas dodawania transakcji. Spróbuj ponownie.',
            sv: 'Tyvärr, det uppstod ett fel när transaktionen lades till. Försök igen.',
            da: 'Beklager, der opstod en fejl ved tilføjelse af transaktionen. Prøv igen.',
            no: 'Beklager, det oppstod en feil ved tilføyelse av transaksjonen. Prøv igjen.',
            fi: 'Pahoittelut, tapahtuman lisäämisessä tapahtui virhe. Yritä uudelleen.',
            he: 'מצטער, אירעה שגיאה בעת הוספת העסקה. אנא נסה שוב.',
            fa: 'متأسفانه، در هنگام افزودن تراکنش خطایی رخ داد. لطفاً دوباره تلاش کنید.',
            ur: 'معذرت، لین دین شامل کرنے میں غلطی ہوئی۔ براہ کرم دوبارہ کوشش کریں۔'
          };
          
          responseText = errorMessages[detectedLanguage.code] || errorMessages.en;
        }
      }

      // If no transaction was detected or added, use the regular AI response
      if (!transactionAdded) {
        // Get the appropriate system prompt for the detected language
        const systemPrompt = systemPrompts[detectedLanguage.code] || systemPrompts.en;
        
        const prompt = systemPrompt
          .replace('{balance}', formattedBalance)
          .replace('{income}', formattedIncome)
          .replace('{expenses}', formattedExpenses)
          .replace('{transactionCount}', transactions.length.toString()) + 
          `\n\nUser message: ${message}`;

        logger.debug({ promptLength: prompt.length, detectedLanguage: detectedLanguage.code }, 'Sending chat request to Gemini');

        const result = await model.generateContent(prompt);
        const response = await result.response;
        responseText = response.text();

        logger.info({ responseLength: responseText.length, detectedLanguage: detectedLanguage.code }, 'Chat response generated successfully');
      }

      return NextResponse.json({ 
        success: true,
        data: {
          message: responseText,
          detectedLanguage: detectedLanguage.code,
          isRTL: detectedLanguage.isRTL,
          transactionAdded: transactionAdded
        }
      });

    } catch (dbError) {
      logger.error({ error: dbError instanceof Error ? dbError.message : dbError }, 'Database error');
      
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
          isRTL: detectedLanguage.isRTL
        }
      });
    }

  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Chat API error');
    return NextResponse.json({ 
      success: false,
      error: 'Failed to process chat message. Please try again.' 
    }, { status: 500 });
  }
}

// Function to extract transaction information from user message
function extractTransactionFromMessage(message: string, languageCode: string): { description: string; amount: number; category: TransactionCategory } | null {
  const lowerMessage = message.toLowerCase();
  
  // Common transaction keywords in different languages
  const transactionKeywords: Record<string, string[]> = {
    en: ['spent', 'bought', 'paid', 'purchased', 'bought', 'expense', 'cost', 'price', 'paid', 'spent', 'bought', 'purchased'],
    ar: ['أنفقت', 'اشتريت', 'دفعت', 'اشتريت', 'مشتريات', 'مصاريف', 'تكلفة', 'سعر', 'دفع', 'إنفاق'],
    es: ['gasté', 'compré', 'pagué', 'adquirí', 'compra', 'gasto', 'costo', 'precio', 'pago'],
    fr: ['dépensé', 'acheté', 'payé', 'acquis', 'achat', 'dépense', 'coût', 'prix', 'paiement'],
    de: ['ausgegeben', 'gekauft', 'bezahlt', 'erworben', 'kauf', 'ausgabe', 'kosten', 'preis', 'zahlung'],
    ru: ['потратил', 'купил', 'заплатил', 'приобрел', 'покупка', 'расход', 'стоимость', 'цена', 'платеж'],
    zh: ['花了', '买了', '付了', '购买了', '购买', '支出', '费用', '价格', '付款'],
    ja: ['使った', '買った', '払った', '購入した', '購入', '支出', '費用', '価格', '支払い'],
    ko: ['썼다', '샀다', '냈다', '구입했다', '구매', '지출', '비용', '가격', '결제'],
    hi: ['खर्च किया', 'खरीदा', 'भुगतान किया', 'खरीदा', 'खरीदारी', 'खर्च', 'लागत', 'कीमत', 'भुगतान'],
    tr: ['harcadım', 'aldım', 'ödedim', 'satın aldım', 'alışveriş', 'harcama', 'maliyet', 'fiyat', 'ödeme'],
    nl: ['uitgegeven', 'gekocht', 'betaald', 'aangeschaft', 'aankoop', 'uitgave', 'kosten', 'prijs', 'betaling'],
    pl: ['wydałem', 'kupiłem', 'zapłaciłem', 'nabyłem', 'zakup', 'wydatek', 'koszt', 'cena', 'płatność'],
    sv: ['spenderade', 'köpte', 'betalade', 'förvärvade', 'köp', 'utgift', 'kostnad', 'pris', 'betalning'],
    da: ['brugte', 'købte', 'betalte', 'anskaffede', 'køb', 'udgift', 'omkostning', 'pris', 'betaling'],
    no: ['brukte', 'kjøpte', 'betalte', 'anskaffet', 'kjøp', 'utgift', 'kostnad', 'pris', 'betaling'],
    fi: ['käytin', 'ostin', 'maksin', 'hankin', 'osto', 'meno', 'kustannus', 'hinta', 'maksu'],
    he: ['הוצאתי', 'קניתי', 'שילמתי', 'רכשתי', 'קנייה', 'הוצאה', 'עלות', 'מחיר', 'תשלום'],
    fa: ['خرج کردم', 'خریدم', 'پرداختم', 'خریداری کردم', 'خرید', 'خرج', 'هزینه', 'قیمت', 'پرداخت'],
    ur: ['خرچ کیا', 'خریدا', 'ادائیگی کی', 'خریداری کی', 'خریداری', 'خرچ', 'لاگت', 'قیمت', 'ادائیگی']
  };
  
  const keywords = transactionKeywords[languageCode] || transactionKeywords.en;
  
  // Check if message contains transaction keywords
  const hasTransactionKeyword = keywords.some((keyword: string) => lowerMessage.includes(keyword));
  
  if (!hasTransactionKeyword) {
    return null;
  }
  
  // Extract amount using currency patterns
  const currencyPatterns: Record<string, RegExp[]> = {
    en: [/\$([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*dollars?/i],
    ar: [/ر\.س\s*([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*ريال/],
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
    ur: [/₨([0-9,]+\.?[0-9]*)/, /([0-9,]+\.?[0-9]*)\s*روپے/]
  };
  
  const patterns = currencyPatterns[languageCode] || currencyPatterns.en;
  
  let amount = 0;
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      const amountStr = match[1].replace(/,/g, '');
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
      const amountStr = numberMatch[1].replace(/,/g, '');
      amount = parseFloat(amountStr);
    }
  }
  
  if (amount === 0) {
    return null;
  }
  
  // Determine if it's income or expense based on keywords
  const incomeKeywords: Record<string, string[]> = {
    en: ['earned', 'received', 'income', 'salary', 'payment', 'deposit'],
    ar: ['كسبت', 'استلمت', 'دخل', 'راتب', 'دفع', 'إيداع'],
    es: ['gané', 'recibí', 'ingreso', 'salario', 'pago', 'depósito'],
    fr: ['gagné', 'reçu', 'revenu', 'salaire', 'paiement', 'dépôt'],
    de: ['verdient', 'erhalten', 'einkommen', 'gehalt', 'zahlung', 'einzahlung'],
    ru: ['заработал', 'получил', 'доход', 'зарплата', 'платеж', 'депозит'],
    zh: ['赚了', '收到了', '收入', '工资', '付款', '存款'],
    ja: ['稼いだ', '受け取った', '収入', '給料', '支払い', '預金'],
    ko: ['벌었다', '받았다', '수입', '급여', '지불', '예금'],
    hi: ['कमाया', 'प्राप्त किया', 'आय', 'वेतन', 'भुगतान', 'जमा'],
    tr: ['kazandım', 'aldım', 'gelir', 'maaş', 'ödeme', 'mevduat'],
    nl: ['verdiend', 'ontvangen', 'inkomen', 'salaris', 'betaling', 'storting'],
    pl: ['zarobiłem', 'otrzymałem', 'dochód', 'pensja', 'płatność', 'wpłata'],
    sv: ['tjänade', 'fick', 'inkomst', 'lön', 'betalning', 'insättning'],
    da: ['tjente', 'modtog', 'indkomst', 'løn', 'betaling', 'indskud'],
    no: ['tjente', 'mottok', 'inntekt', 'lønn', 'betaling', 'innskudd'],
    fi: ['ansaitin', 'sain', 'tulot', 'palkka', 'maksu', 'talletus'],
    he: ['הרווחתי', 'קיבלתי', 'הכנסה', 'משכורת', 'תשלום', 'הפקדה'],
    fa: ['کسب کردم', 'دریافت کردم', 'درآمد', 'حقوق', 'پرداخت', 'سپرده'],
    ur: ['کمایا', 'حاصل کیا', 'آمدنی', 'تنخواہ', 'ادائیگی', 'جمع']
  };
  
  const incomeKeys = incomeKeywords[languageCode] || incomeKeywords.en;
  const isIncome = incomeKeys.some((keyword: string) => lowerMessage.includes(keyword));
  
  // Make amount negative for expenses (default behavior)
  if (!isIncome) {
    amount = -Math.abs(amount);
  }
  
  // Extract description (remove amount and common words)
  let description = message;
  
  // Remove amount patterns
  patterns.forEach((pattern: RegExp) => {
    description = description.replace(pattern, '');
  });
  
  // Remove common transaction words
  const commonWords: Record<string, string[]> = {
    en: ['for', 'on', 'at', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'to', 'of', 'with', 'by'],
    ar: ['في', 'على', 'إلى', 'من', 'مع', 'ب', 'ل', 'عن', 'حول', 'خلال'],
    es: ['para', 'en', 'a', 'de', 'con', 'por', 'sin', 'sobre', 'entre', 'hacia'],
    fr: ['pour', 'en', 'à', 'de', 'avec', 'par', 'sans', 'sur', 'entre', 'vers'],
    de: ['für', 'in', 'an', 'von', 'mit', 'durch', 'ohne', 'auf', 'zwischen', 'zu'],
    ru: ['для', 'в', 'на', 'от', 'с', 'через', 'без', 'над', 'между', 'к'],
    zh: ['为', '在', '到', '的', '和', '或', '但', '在', '向', '与'],
    ja: ['の', 'に', 'で', 'を', 'と', 'や', 'が', 'は', 'も', 'から'],
    ko: ['을', '를', '에', '에서', '로', '와', '과', '이', '가', '의'],
    hi: ['के', 'को', 'से', 'में', 'पर', 'और', 'या', 'लेकिन', 'तक', 'द्वारा'],
    tr: ['için', 'de', 'da', 'ile', 'den', 'dan', 've', 'veya', 'ama', 'kadar'],
    nl: ['voor', 'in', 'op', 'van', 'met', 'door', 'zonder', 'over', 'tussen', 'naar'],
    pl: ['dla', 'w', 'na', 'od', 'z', 'przez', 'bez', 'nad', 'między', 'do'],
    sv: ['för', 'i', 'på', 'av', 'med', 'genom', 'utan', 'över', 'mellan', 'till'],
    da: ['for', 'i', 'på', 'af', 'med', 'gennem', 'uden', 'over', 'mellem', 'til'],
    no: ['for', 'i', 'på', 'av', 'med', 'gjennom', 'uten', 'over', 'mellom', 'til'],
    fi: ['varten', 'ssa', 'lla', 'sta', 'lla', 'kautta', 'ilman', 'lla', 'välissä', 'kohti'],
    he: ['עבור', 'ב', 'על', 'מ', 'עם', 'דרך', 'בלי', 'מעל', 'בין', 'אל'],
    fa: ['برای', 'در', 'روی', 'از', 'با', 'از طریق', 'بدون', 'روی', 'بین', 'به'],
    ur: ['کے لیے', 'میں', 'پر', 'سے', 'کے ساتھ', 'کے ذریعے', 'بغیر', 'اوپر', 'درمیان', 'کی طرف']
  };
  
  const wordsToRemove = commonWords[languageCode] || commonWords.en;
  wordsToRemove.forEach((word: string) => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    description = description.replace(regex, '');
  });
  
  // Clean up description
  description = description.replace(/\s+/g, ' ').trim();
  
  // If description is too short, use a generic one
  if (description.length < 3) {
    const genericDescriptions: Record<string, string> = {
      en: 'Transaction',
      ar: 'معاملة',
      es: 'Transacción',
      fr: 'Transaction',
      de: 'Transaktion',
      ru: 'Транзакция',
      zh: '交易',
      ja: '取引',
      ko: '거래',
      hi: 'लेन-देन',
      tr: 'İşlem',
      nl: 'Transactie',
      pl: 'Transakcja',
      sv: 'Transaktion',
      da: 'Transaktion',
      no: 'Transaksjon',
      fi: 'Tapahtuma',
      he: 'עסקה',
      fa: 'تراکنش',
      ur: 'لین دین'
    };
    description = genericDescriptions[languageCode] || genericDescriptions.en;
  }
  
  // Determine category based on keywords
  const categoryKeywords: Record<string, Record<string, string[]>> = {
    'Food & Drink': {
      en: ['food', 'lunch', 'dinner', 'breakfast', 'coffee', 'restaurant', 'meal', 'snack', 'groceries'],
      ar: ['طعام', 'غداء', 'عشاء', 'إفطار', 'قهوة', 'مطعم', 'وجبة', 'وجبة خفيفة', 'بقالة'],
      es: ['comida', 'almuerzo', 'cena', 'desayuno', 'café', 'restaurante', 'comida', 'snack', 'comestibles'],
      fr: ['nourriture', 'déjeuner', 'dîner', 'petit-déjeuner', 'café', 'restaurant', 'repas', 'collation', 'épicerie'],
      de: ['essen', 'mittagessen', 'abendessen', 'frühstück', 'kaffee', 'restaurant', 'mahlzeit', 'snack', 'lebensmittel'],
      ru: ['еда', 'обед', 'ужин', 'завтрак', 'кофе', 'ресторан', 'еда', 'закуска', 'продукты'],
      zh: ['食物', '午餐', '晚餐', '早餐', '咖啡', '餐厅', '餐', '零食', '杂货'],
      ja: ['食べ物', '昼食', '夕食', '朝食', 'コーヒー', 'レストラン', '食事', 'スナック', '食料品'],
      ko: ['음식', '점심', '저녁', '아침', '커피', '레스토랑', '식사', '간식', '식료품'],
      hi: ['भोजन', 'दोपहर का भोजन', 'रात का भोजन', 'नाश्ता', 'कॉफी', 'रेस्तरां', 'भोजन', 'नाश्ता', 'किराना'],
      tr: ['yemek', 'öğle yemeği', 'akşam yemeği', 'kahvaltı', 'kahve', 'restoran', 'yemek', 'atıştırmalık', 'market'],
      nl: ['eten', 'lunch', 'diner', 'ontbijt', 'koffie', 'restaurant', 'maaltijd', 'snack', 'boodschappen'],
      pl: ['jedzenie', 'obiad', 'kolacja', 'śniadanie', 'kawa', 'restauracja', 'posiłek', 'przekąska', 'artykuły spożywcze'],
      sv: ['mat', 'lunch', 'middag', 'frukost', 'kaffe', 'restaurang', 'måltid', 'snack', 'livsmedel'],
      da: ['mad', 'frokost', 'aftensmad', 'morgenmad', 'kaffe', 'restaurant', 'måltid', 'snack', 'dagligvarer'],
      no: ['mat', 'lunsj', 'middag', 'frokost', 'kaffe', 'restaurant', 'måltid', 'snack', 'dagligvarer'],
      fi: ['ruoka', 'lounas', 'illallinen', 'aamiainen', 'kahvi', 'ravintola', 'ateria', 'naposteltava', 'ruokakauppa'],
      he: ['אוכל', 'צהריים', 'ערב', 'בוקר', 'קפה', 'מסעדה', 'ארוחה', 'חטיף', 'מזון'],
      fa: ['غذا', 'ناهار', 'شام', 'صبحانه', 'قهوه', 'رستوران', 'وعده', 'تنقلات', 'مواد غذایی'],
      ur: ['کھانا', 'دوپہر کا کھانا', 'رات کا کھانا', 'ناشتہ', 'کافی', 'ریستوران', 'کھانا', 'ناشتہ', 'کریانہ']
    },
    'Transportation': {
      en: ['transport', 'bus', 'train', 'taxi', 'uber', 'gas', 'fuel', 'parking', 'metro', 'subway'],
      ar: ['مواصلات', 'حافلة', 'قطار', 'تاكسي', 'أوبر', 'بنزين', 'وقود', 'موقف', 'مترو'],
      es: ['transporte', 'autobús', 'tren', 'taxi', 'uber', 'gasolina', 'combustible', 'estacionamiento', 'metro'],
      fr: ['transport', 'bus', 'train', 'taxi', 'uber', 'essence', 'carburant', 'parking', 'métro'],
      de: ['transport', 'bus', 'zug', 'taxi', 'uber', 'benzin', 'kraftstoff', 'parkplatz', 'u-bahn'],
      ru: ['транспорт', 'автобус', 'поезд', 'такси', 'убер', 'бензин', 'топливо', 'парковка', 'метро'],
      zh: ['交通', '公交车', '火车', '出租车', '优步', '汽油', '燃料', '停车', '地铁'],
      ja: ['交通', 'バス', '電車', 'タクシー', 'ウーバー', 'ガソリン', '燃料', '駐車場', '地下鉄'],
      ko: ['교통', '버스', '기차', '택시', '우버', '가스', '연료', '주차', '지하철'],
      hi: ['परिवहन', 'बस', 'ट्रेन', 'टैक्सी', 'उबर', 'पेट्रोल', 'ईंधन', 'पार्किंग', 'मेट्रो'],
      tr: ['ulaşım', 'otobüs', 'tren', 'taksi', 'uber', 'benzin', 'yakıt', 'otopark', 'metro'],
      nl: ['vervoer', 'bus', 'trein', 'taxi', 'uber', 'benzine', 'brandstof', 'parkeren', 'metro'],
      pl: ['transport', 'autobus', 'pociąg', 'taksówka', 'uber', 'benzyna', 'paliwo', 'parking', 'metro'],
      sv: ['transport', 'buss', 'tåg', 'taxi', 'uber', 'bensin', 'bränsle', 'parkering', 'tunnelbana'],
      da: ['transport', 'bus', 'tog', 'taxi', 'uber', 'benzin', 'brændstof', 'parkering', 'metro'],
      no: ['transport', 'buss', 'tog', 'taxi', 'uber', 'bensin', 'drivstoff', 'parkering', 't-bane'],
      fi: ['liikenne', 'bussi', 'juna', 'taksi', 'uber', 'bensiini', 'polttoaine', 'pysäköinti', 'metro'],
      he: ['תחבורה', 'אוטובוס', 'רכבת', 'מונית', 'אובר', 'דלק', 'דלק', 'חניה', 'רכבת תחתית'],
      fa: ['حمل و نقل', 'اتوبوس', 'قطار', 'تاکسی', 'اوبر', 'بنزین', 'سوخت', 'پارکینگ', 'مترو'],
      ur: ['نقل و حمل', 'بس', 'ٹرین', 'ٹیکسی', 'اوبر', 'پیٹرول', 'ایندھن', 'پارکنگ', 'مترو']
    },
    'Entertainment': {
      en: ['movie', 'cinema', 'theater', 'concert', 'show', 'game', 'entertainment', 'fun', 'leisure'],
      ar: ['فيلم', 'سينما', 'مسرح', 'حفلة موسيقية', 'عرض', 'لعبة', 'ترفيه', 'مرح', 'ترفيه'],
      es: ['película', 'cine', 'teatro', 'concierto', 'espectáculo', 'juego', 'entretenimiento', 'diversión', 'ocio'],
      fr: ['film', 'cinéma', 'théâtre', 'concert', 'spectacle', 'jeu', 'divertissement', 'amusement', 'loisir'],
      de: ['film', 'kino', 'theater', 'konzert', 'show', 'spiel', 'unterhaltung', 'spaß', 'freizeit'],
      ru: ['фильм', 'кино', 'театр', 'концерт', 'шоу', 'игра', 'развлечения', 'веселье', 'досуг'],
      zh: ['电影', '电影院', '剧院', '音乐会', '表演', '游戏', '娱乐', '乐趣', '休闲'],
      ja: ['映画', '映画館', '劇場', 'コンサート', 'ショー', 'ゲーム', 'エンターテイメント', '楽しみ', 'レジャー'],
      ko: ['영화', '영화관', '극장', '콘서트', '쇼', '게임', '엔터테인먼트', '재미', '여가'],
      hi: ['फिल्म', 'सिनेमा', 'थिएटर', 'कॉन्सर्ट', 'शो', 'खेल', 'मनोरंजन', 'मज़ा', 'अवकाश'],
      tr: ['film', 'sinema', 'tiyatro', 'konser', 'gösteri', 'oyun', 'eğlence', 'eğlence', 'boş zaman'],
      nl: ['film', 'bioscoop', 'theater', 'concert', 'show', 'spel', 'entertainment', 'plezier', 'vrije tijd'],
      pl: ['film', 'kino', 'teatr', 'koncert', 'show', 'gra', 'rozrywka', 'zabawa', 'wypoczynek'],
      sv: ['film', 'bio', 'teater', 'konsert', 'show', 'spel', 'underhållning', 'nöje', 'fritid'],
      da: ['film', 'biograf', 'teater', 'koncert', 'show', 'spil', 'underholdning', 'sjov', 'fritid'],
      no: ['film', 'kino', 'teater', 'konsert', 'show', 'spill', 'underholdning', 'moro', 'fritid'],
      fi: ['elokuva', 'elokuvateatteri', 'teatteri', 'konsertti', 'show', 'peli', 'viihde', 'hauskaa', 'vapaa-aika'],
      he: ['סרט', 'קולנוע', 'תיאטרון', 'קונצרט', 'מופע', 'משחק', 'בידור', 'כיף', 'פנאי'],
      fa: ['فیلم', 'سینما', 'تئاتر', 'کنسرت', 'نمایش', 'بازی', 'سرگرمی', 'سرگرمی', 'اوقات فراغت'],
      ur: ['فلم', 'سینما', 'تھیٹر', 'کنسرٹ', 'شو', 'گیم', 'تفریح', 'مزہ', 'فرصت']
    }
  };
  
  let category: TransactionCategory = 'Other';
  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    const langKeywords = keywords[languageCode] || keywords.en;
    if (langKeywords.some((keyword: string) => lowerMessage.includes(keyword))) {
      category = cat as TransactionCategory;
      break;
    }
  }
  
  return {
    description,
    amount,
    category
  };
} 