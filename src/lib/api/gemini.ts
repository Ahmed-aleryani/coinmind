import { GoogleGenerativeAI } from '@google/generative-ai';
import { ParsedTransactionText, ReceiptData, TransactionCategory } from '../types/transaction';
import { transactionDb, initDatabase } from '../db/schema';
import { formatCurrency } from '../utils/formatters';
import { detectLanguage, formatCurrencyByLanguage, extractCurrencyAmount } from '../utils/language-detection';
import logger from '../utils/logger';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
const proModel = genAI.getGenerativeModel({ model: 'gemini-2.5-pro-preview-06-05' }); // Use latest preview for better performance

// Transaction categories for consistent categorization
const CATEGORIES: TransactionCategory[] = [
  'Food & Drink',
  'Transportation',
  'Utilities',
  'Entertainment',
  'Shopping',
  'Healthcare',
  'Education',
  'Income',
  'Transfer',
  'Other'
];

/**
 * Parse natural language text into structured transaction data with multi-language support
 */
export async function parseTransactionText(text: string): Promise<ParsedTransactionText> {
  const startTime = Date.now();
  
  logger.info({ text: text.substring(0, 100) }, 'Starting transaction text parsing');
  
  // Detect the language of the input text
  const detectedLanguage = detectLanguage(text);
  const todayDate = new Date().toISOString();
  const yesterdayDate = new Date(Date.now() - 24*60*60*1000).toISOString();
  
  // Create language-specific prompts
  const languagePrompts: Record<string, string> = {
    ar: `
      قم بتحليل هذا النص المالي وتحويله إلى بيانات منظمة:
      "${text}"
      
      تاريخ اليوم هو: ${todayDate}
      
      قم بتحليل الرسالة بعناية واستخرج:
      1. المبلغ (مع الإشارة الصحيحة: موجب للدخل/الأرباح، سالب للمصروفات)
      2. العملة (ريال، دولار، يورو، إلخ - استخدم "SAR" للريال السعودي)
      3. البائع/المصدر (من أين حصلت على المال أو دفعته)
      4. الوصف (ما كان المعاملة من أجله)
      5. التاريخ (استخدم تاريخ اليوم دائماً ما لم يذكر المستخدم تاريخاً مختلفاً)
      6. الفئة (اختر الأنسب)
      
      أعد فقط كائن JSON بهذه الحقول (استخدم null للبيانات المفقودة):
      {
        "amount": number (موجب للدخل، سالب للمصروفات),
        "currency": string (رمز العملة مثل "SAR", "USD", "EUR"),
        "vendor": string,
        "description": string,
        "date": string (تنسيق ISO، استخدم تاريخ اليوم دائماً ما لم يحدد خلاف ذلك),
        "category": string (واحدة من: ${CATEGORIES.join(', ')})
      }
      
      قواعد التاريخ المهمة:
      - استخدم تاريخ اليوم (${todayDate}) دائماً ما لم يذكر المستخدم تاريخاً مختلفاً
      - استخدم تاريخاً مختلفاً فقط إذا قال المستخدم شيئاً مثل "أمس"، "الأسبوع الماضي"، "الاثنين"، "15 يناير"، إلخ
      - العبارات مثل "ربحت"، "اشتريت"، "حصلت" بدون مؤشرات زمنية يجب أن تستخدم تاريخ اليوم
      
      قواعد أخرى:
      - للدخل/الأرباح (ربح، حصل، استلم، راتب، مكافأة، استرداد، باع): استخدم مبالغ موجبة
      - للمصروفات (اشترى، أنفق، دفع، اشترى): استخدم مبالغ سالبة
      - استخرج البائع من السياق (مثل "من حدث Cursor Tallinn" → "حدث Cursor Tallinn")
      - كن ذكياً في التصنيف (الجوائز/الأرباح = الدخل، مشتريات الطعام = الطعام والشراب، إلخ)
      - اكتب الوصف باللغة العربية دائماً (مثل "دفع فاتورة الكهرباء"، "شراء طعام"، "راتب الشهر")
      - اكتشف العملة من النص (ريال = SAR، دولار = USD، يورو = EUR، إلخ)
    `,
    en: `
      Parse this natural language transaction description into structured data:
      "${text}"
      
      Today's date is: ${todayDate}
      
      Analyze the message carefully and extract:
      1. Amount (with correct sign: positive for income/earnings, negative for expenses)
      2. Currency (dollar, euro, pound, etc. - use "USD" for dollar, "EUR" for euro)
      3. Vendor/source (who you received money from or paid money to)
      4. Description (what the transaction was for)
      5. Date (ALWAYS use today's date unless user explicitly mentions a different date)
      6. Category (choose the most appropriate one)
      
      Return ONLY a JSON object with these fields (use null for missing data):
      {
        "amount": number (positive for income, negative for expenses),
        "currency": string (currency code like "USD", "EUR", "GBP"),
        "vendor": string,
        "description": string,
        "date": string (ISO format, ALWAYS use today's date unless explicitly specified),
        "category": string (one of: ${CATEGORIES.join(', ')})
      }
      
      IMPORTANT DATE RULES:
      - ALWAYS use today's date (${todayDate}) unless the user explicitly mentions a different date
      - Only use a different date if the user says something like "yesterday", "last week", "on Monday", "January 15th", etc.
      - Phrases like "I won", "I bought", "I received" without time indicators should use TODAY'S date
      
      OTHER RULES:
      - For income/earnings (won, earned, received, got paid, salary, bonus, refund, sold): use POSITIVE amounts
      - For expenses (bought, spent, paid, purchased): use NEGATIVE amounts
      - Extract vendor from context (e.g., "from Cursor Tallinn event" → "Cursor Tallinn event")
      - Be smart about categorization (prizes/winnings = Income, food purchases = Food & Drink, etc.)
      - Write the description in English (e.g., "electricity bill payment", "food purchase", "monthly salary")
      - Detect currency from text (dollar = USD, euro = EUR, pound = GBP, etc.)
    `,
    es: `
      Analiza esta descripción de transacción en lenguaje natural y conviértela en datos estructurados:
      "${text}"
      
      La fecha de hoy es: ${todayDate}
      
      Analiza el mensaje cuidadosamente y extrae:
      1. Cantidad (con el signo correcto: positivo para ingresos/ganancias, negativo para gastos)
      2. Moneda (dólar, euro, libra, etc. - usa "USD" para dólar, "EUR" para euro)
      3. Vendedor/fuente (de quién recibiste dinero o a quién pagaste)
      4. Descripción (para qué era la transacción)
      5. Fecha (SIEMPRE usa la fecha de hoy a menos que el usuario mencione explícitamente una fecha diferente)
      6. Categoría (elige la más apropiada)
      
      Devuelve SOLO un objeto JSON con estos campos (usa null para datos faltantes):
      {
        "amount": number (positivo para ingresos, negativo para gastos),
        "currency": string (código de moneda como "USD", "EUR", "GBP"),
        "vendor": string,
        "description": string,
        "date": string (formato ISO, SIEMPRE usa la fecha de hoy a menos que se especifique explícitamente),
        "category": string (una de: ${CATEGORIES.join(', ')})
      }
      
      REGLAS IMPORTANTES:
      - Escribe la descripción en español (ej: "pago de factura de electricidad", "compra de comida", "salario mensual")
      - Detecta la moneda del texto (dólar = USD, euro = EUR, libra = GBP, etc.)
    `,
    fr: `
      Analysez cette description de transaction en langage naturel et convertissez-la en données structurées:
      "${text}"
      
      La date d'aujourd'hui est: ${todayDate}
      
      Analysez le message attentivement et extrayez:
      1. Montant (avec le bon signe: positif pour les revenus/gains, négatif pour les dépenses)
      2. Devise (dollar, euro, livre, etc. - utilisez "USD" pour dollar, "EUR" pour euro)
      3. Vendeur/source (de qui vous avez reçu de l'argent ou à qui vous avez payé)
      4. Description (à quoi servait la transaction)
      5. Date (UTILISEZ TOUJOURS la date d'aujourd'hui sauf si l'utilisateur mentionne explicitement une date différente)
      6. Catégorie (choisissez la plus appropriée)
      
      Retournez SEULEMENT un objet JSON avec ces champs (utilisez null pour les données manquantes):
      {
        "amount": number (positif pour les revenus, négatif pour les dépenses),
        "currency": string (code de devise comme "USD", "EUR", "GBP"),
        "vendor": string,
        "description": string,
        "date": string (format ISO, UTILISEZ TOUJOURS la date d'aujourd'hui sauf spécification explicite),
        "category": string (une de: ${CATEGORIES.join(', ')})
      }
      
      RÈGLES IMPORTANTES:
      - Écrivez la description en français (ex: "paiement de facture d'électricité", "achat de nourriture", "salaire mensuel")
      - Détectez la devise du texte (dollar = USD, euro = EUR, livre = GBP, etc.)
    `,
    de: `
      Analysieren Sie diese natürliche Transaktionsbeschreibung und konvertieren Sie sie in strukturierte Daten:
      "${text}"
      
      Das heutige Datum ist: ${todayDate}
      
      Analysieren Sie die Nachricht sorgfältig und extrahieren Sie:
      1. Betrag (mit korrektem Vorzeichen: positiv für Einkommen/Gewinne, negativ für Ausgaben)
      2. Währung (Dollar, Euro, Pfund, etc. - verwenden Sie "USD" für Dollar, "EUR" für Euro)
      3. Verkäufer/Quelle (von wem Sie Geld erhalten oder an wen Sie gezahlt haben)
      4. Beschreibung (wofür die Transaktion war)
      5. Datum (VERWENDEN SIE IMMER das heutige Datum, es sei denn, der Benutzer erwähnt explizit ein anderes Datum)
      6. Kategorie (wählen Sie die am besten geeignete)
      
      Geben Sie NUR ein JSON-Objekt mit diesen Feldern zurück (verwenden Sie null für fehlende Daten):
      {
        "amount": number (positiv für Einkommen, negativ für Ausgaben),
        "currency": string (Währungscode wie "USD", "EUR", "GBP"),
        "vendor": string,
        "description": string,
        "date": string (ISO-Format, VERWENDEN SIE IMMER das heutige Datum, es sei denn explizit angegeben),
        "category": string (eine von: ${CATEGORIES.join(', ')})
      }
      
      WICHTIGE REGELN:
      - Schreiben Sie die Beschreibung auf Deutsch (z.B. "Stromrechnung bezahlt", "Lebensmittel gekauft", "Monatsgehalt")
      - Erkennen Sie die Währung aus dem Text (Dollar = USD, Euro = EUR, Pfund = GBP, etc.)
    `,
    ru: `
      Проанализируйте это описание транзакции на естественном языке и преобразуйте его в структурированные данные:
      "${text}"
      
      Сегодняшняя дата: ${todayDate}
      
      Внимательно проанализируйте сообщение и извлеките:
      1. Сумму (с правильным знаком: положительная для дохода/заработка, отрицательная для расходов)
      2. Валюту (доллар, евро, рубль, etc. - используйте "USD" для доллара, "EUR" для евро, "RUB" для рубля)
      3. Продавца/источник (от кого вы получили деньги или кому заплатили)
      4. Описание (для чего была транзакция)
      5. Дату (ВСЕГДА используйте сегодняшнюю дату, если пользователь не указал другую дату)
      6. Категорию (выберите наиболее подходящую)
      
      Верните ТОЛЬКО JSON объект с этими полями (используйте null для отсутствующих данных):
      {
        "amount": number (положительное для дохода, отрицательное для расходов),
        "currency": string (код валюты как "USD", "EUR", "RUB"),
        "vendor": string,
        "description": string,
        "date": string (формат ISO, ВСЕГДА используйте сегодняшнюю дату, если не указано иное),
        "category": string (одна из: ${CATEGORIES.join(', ')})
      }
      
      ВАЖНЫЕ ПРАВИЛА:
      - Пишите описание на русском языке (например: "оплата счета за электричество", "покупка продуктов", "месячная зарплата")
      - Определите валюту из текста (доллар = USD, евро = EUR, рубль = RUB, etc.)
    `,
    zh: `
      解析这个自然语言交易描述并转换为结构化数据：
      "${text}"
      
      今天的日期是：${todayDate}
      
      仔细分析消息并提取：
      1. 金额（带正确符号：收入/收益为正，支出为负）
      2. 货币（美元，欧元，人民币，etc. - 使用 "USD" 表示美元，"EUR" 表示欧元，"CNY" 表示人民币）
      3. 供应商/来源（您从谁那里收到钱或向谁付款）
      4. 描述（交易的目的）
      5. 日期（除非用户明确提到不同日期，否则始终使用今天的日期）
      6. 类别（选择最合适的）
      
      仅返回包含这些字段的JSON对象（对缺失数据使用null）：
      {
        "amount": number (收入为正，支出为负),
        "currency": string (货币代码如 "USD", "EUR", "CNY"),
        "vendor": string,
        "description": string,
        "date": string (ISO格式，除非明确指定，否则始终使用今天的日期),
        "category": string (其中之一: ${CATEGORIES.join(', ')})
      }
      
      重要规则：
      - 用中文写描述（例如："电费账单支付"，"食品购买"，"月薪"）
      - 从文本中检测货币（美元 = USD，欧元 = EUR，人民币 = CNY，etc.）
    `,
    ja: `
      この自然言語の取引説明を構造化データに解析します：
      "${text}"
      
      今日の日付は：${todayDate}
      
      メッセージを注意深く分析し、以下を抽出してください：
      1. 金額（正しい符号付き：収入/収益は正、支出は負）
      2. 通貨（ドル、ユーロ、円、etc. - "USD" でドル、"EUR" でユーロ、"JPY" で円を表す）
      3. ベンダー/ソース（お金を受け取った相手または支払った相手）
      4. 説明（取引の目的）
      5. 日付（ユーザーが明示的に異なる日付を言及しない限り、常に今日の日付を使用）
      6. カテゴリ（最も適切なものを選択）
      
      これらのフィールドを持つJSONオブジェクトのみを返してください（欠損データにはnullを使用）：
      {
        "amount": number (収入は正、支出は負),
        "currency": string (通貨コードとして "USD", "EUR", "JPY"),
        "vendor": string,
        "description": string,
        "date": string (ISO形式、明示的に指定されない限り常に今日の日付を使用),
        "category": string (以下の中から一つ: ${CATEGORIES.join(', ')})
      }
      
      重要なルール：
      - 説明を日本語で書いてください（例：「電気代の支払い」、「食料品の購入」、「月給」）
      - テキストから通貨を検出してください（ドル = USD、ユーロ = EUR、円 = JPY、etc.）
    `,
    ko: `
      이 자연어 거래 설명을 구조화된 데이터로 파싱합니다:
      "${text}"
      
      오늘 날짜는: ${todayDate}
      
      메시지를 주의 깊게 분석하고 다음을 추출하세요:
      1. 금액 (올바른 부호 포함: 수입/수익은 양수, 지출은 음수)
      2. 통화 (달러, 유로, 원, etc. - "USD"로 달러, "EUR"로 유로, "KRW"로 원을 나타냄)
      3. 공급업체/소스 (돈을 받은 사람 또는 지불한 사람)
      4. 설명 (거래의 목적)
      5. 날짜 (사용자가 명시적으로 다른 날짜를 언급하지 않는 한 항상 오늘 날짜 사용)
      6. 카테고리 (가장 적절한 것 선택)
      
      이러한 필드가 있는 JSON 객체만 반환하세요 (누락된 데이터에는 null 사용):
      {
        "amount": number (수입은 양수, 지출은 음수),
        "currency": string (통화 코드로 "USD", "EUR", "KRW"),
        "vendor": string,
        "description": string,
        "date": string (ISO 형식, 명시적으로 지정되지 않는 한 항상 오늘 날짜 사용),
        "category": string (다음 중 하나: ${CATEGORIES.join(', ')})
      }
      
      중요한 규칙:
      - 설명을 한국어로 작성하세요 (예: "전기 요금 지불", "식료품 구매", "월급")
      - 텍스트에서 통화를 감지하세요 (달러 = USD, 유로 = EUR, 원 = KRW, etc.)
    `,
    hi: `
      इस प्राकृतिक भाषा लेन-देन विवरण को संरचित डेटा में पार्स करें:
      "${text}"
      
      आज की तारीख है: ${todayDate}
      
      संदेश का सावधानीपूर्वक विश्लेषण करें और निम्नलिखित निकालें:
      1. राशि (सही संकेत के साथ: आय/कमाई के लिए सकारात्मक, खर्च के लिए नकारात्मक)
      2. मुद्रा (डॉलर, यूरो, रुपया, etc. - "USD" डॉलर के लिए, "EUR" यूरो के लिए, "INR" रुपया के लिए)
      3. विक्रेता/स्रोत (जिससे आपको पैसा मिला या जिसे आपने भुगतान किया)
      4. विवरण (लेन-देन किस लिए था)
      5. तारीख (हमेशा आज की तारीख का उपयोग करें जब तक कि उपयोगकर्ता स्पष्ट रूप से अलग तारीख न बताए)
      6. श्रेणी (सबसे उपयुक्त चुनें)
      
      केवल इन फ़ील्ड्स के साथ JSON ऑब्जेक्ट लौटाएं (गायब डेटा के लिए null का उपयोग करें):
      {
        "amount": number (आय के लिए सकारात्मक, खर्च के लिए नकारात्मक),
        "currency": string (मुद्रा कोड जैसे "USD", "EUR", "INR"),
        "vendor": string,
        "description": string,
        "date": string (ISO प्रारूप, स्पष्ट रूप से निर्दिष्ट न होने तक हमेशा आज की तारीख का उपयोग करें),
        "category": string (इनमें से एक: ${CATEGORIES.join(', ')})
      }
      
      महत्वपूर्ण नियम:
      - विवरण हिंदी में लिखें (उदाहरण: "बिजली बिल भुगतान", "खाद्य खरीदारी", "मासिक वेतन")
      - टेक्स्ट से मुद्रा का पता लगाएं (डॉलर = USD, यूरो = EUR, रुपया = INR, etc.)
    `,
    tr: `
      Bu doğal dil işlem açıklamasını yapılandırılmış verilere ayrıştırın:
      "${text}"
      
      Bugünün tarihi: ${todayDate}
      
      Mesajı dikkatlice analiz edin ve şunları çıkarın:
      1. Miktar (doğru işaretle: gelir/kazanç için pozitif, gider için negatif)
      2. Para birimi (dolar, euro, lira, etc. - "USD" dolar için, "EUR" euro için, "TRY" lira için)
      3. Satıcı/kaynak (kimden para aldığınız veya kime ödeme yaptığınız)
      4. Açıklama (işlemin ne için olduğu)
      5. Tarih (kullanıcı açıkça farklı bir tarih belirtmediği sürece her zaman bugünün tarihini kullanın)
      6. Kategori (en uygun olanı seçin)
      
      Sadece bu alanlarla JSON nesnesi döndürün (eksik veriler için null kullanın):
      {
        "amount": number (gelir için pozitif, gider için negatif),
        "currency": string (para birimi kodu gibi "USD", "EUR", "TRY"),
        "vendor": string,
        "description": string,
        "date": string (ISO formatı, açıkça belirtilmediği sürece her zaman bugünün tarihini kullanın),
        "category": string (bunlardan biri: ${CATEGORIES.join(', ')})
      }
      
      ÖNEMLİ KURALLAR:
      - Açıklamayı Türkçe yazın (örnek: "elektrik faturası ödemesi", "gıda alışverişi", "aylık maaş")
      - Metinden para birimini tespit edin (dolar = USD, euro = EUR, lira = TRY, etc.)
    `
  };

  // Get the appropriate prompt for the detected language, fallback to English
  const prompt = languagePrompts[detectedLanguage.code] || languagePrompts.en;

  try {
    logger.debug({ promptLength: prompt.length, detectedLanguage: detectedLanguage.code }, 'Sending request to Gemini model');
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    logger.debug({ responseLength: text.length }, 'Received response from Gemini model');
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error({ response: text }, 'No valid JSON found in Gemini response');
      throw new Error('No valid JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Arabic expense keyword correction
    let amount = parsed.amount ? Number(parsed.amount) : undefined;
    let type: 'income' | 'expense' | undefined = undefined;
    if (detectedLanguage.code === 'ar' && typeof amount === 'number' && amount > 0) {
      const expenseKeywords = [
        'دفعت', 'أنفقت', 'سددت', 'صرف', 'شراء', 'اشترى', 'دفعة', 'فاتورة', 'تكلفة', 'رسوم', 'مصاريف', 'مدفوعات', 'سحب', 'خصم'
      ];
      const lowerText = text.replace(/[\u064B-\u0652]/g, '').toLowerCase(); // Remove Arabic diacritics
      if (expenseKeywords.some(word => lowerText.includes(word))) {
        amount = -Math.abs(amount);
        type = 'expense';
      }
    }
    
    const result_data = {
      amount: typeof amount === 'number' ? amount : undefined,
      vendor: parsed.vendor || undefined,
      description: parsed.description || undefined,
      date: parsed.date ? new Date(parsed.date) : undefined,
      category: parsed.category || undefined,
      type: type // will be undefined unless we force expense above
    };
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.info({ 
      duration, 
      hasAmount: result_data.amount !== undefined,
      category: result_data.category,
      vendor: result_data.vendor,
      detectedLanguage: detectedLanguage.code
    }, 'Transaction text parsing completed successfully');
    
    return result_data;
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.error({ 
      error: error instanceof Error ? error.message : error,
      duration,
      text: text.substring(0, 100),
      detectedLanguage: detectedLanguage.code
    }, 'Failed to parse transaction text');
    
    throw new Error('Failed to parse transaction text');
  }
}

/**
 * Process receipt image and extract transaction data
 */
export async function parseReceiptImage(imageBase64: string): Promise<ReceiptData> {
  const startTime = Date.now();
  
  logger.info({ imageSize: imageBase64.length }, 'Starting receipt image parsing');
  
  const prompt = `
    Analyze this receipt image and extract transaction information.
    
    Return ONLY a JSON object with these fields (use null for missing data):
    {
      "date": string (ISO format),
      "vendor": string,
      "total": number,
      "items": [
        {
          "name": string,
          "price": number,
          "quantity": number
        }
      ]
    }
    
    Be accurate with the total amount and individual item prices.
  `;

  try {
    logger.debug({ promptLength: prompt.length }, 'Sending receipt image to Gemini model');
    
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBase64,
          mimeType: 'image/jpeg'
        }
      }
    ]);

    const response = await result.response;
    const text = response.text();
    
    logger.debug({ responseLength: text.length }, 'Received receipt parsing response');
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error({ response: text }, 'No valid JSON found in receipt parsing response');
      throw new Error('No valid JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    const result_data = {
      date: parsed.date ? new Date(parsed.date) : undefined,
      vendor: parsed.vendor || undefined,
      total: parsed.total ? Number(parsed.total) : undefined,
      items: parsed.items || []
    };
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.info({ 
      duration, 
      vendor: result_data.vendor,
      total: result_data.total,
      itemCount: result_data.items.length 
    }, 'Receipt image parsing completed successfully');
    
    return result_data;
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.error({ 
      error: error instanceof Error ? error.message : error,
      duration 
    }, 'Failed to parse receipt image');
    
    throw new Error('Failed to parse receipt image');
  }
}

/**
 * Categorize a transaction automatically
 */
export async function categorizeTransaction(
  description: string, 
  vendor?: string
): Promise<TransactionCategory> {
  const prompt = `
    Categorize this transaction into one of these categories:
    ${CATEGORIES.join(', ')}
    
    Transaction details:
    Description: "${description}"
    Vendor: "${vendor || 'Unknown'}"
    
    Return ONLY the category name, nothing else.
    
    Examples:
    - "Coffee" from "Starbucks" → Food & Drink
    - "Gas" from "Shell" → Transportation
    - "Electric bill" → Utilities
    - "Salary" → Income
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const category = response.text().trim();
    
    // Validate category
    if (CATEGORIES.includes(category as TransactionCategory)) {
      return category as TransactionCategory;
    }
    
    return 'Other';
  } catch (error) {
    console.error('Error categorizing transaction:', error);
    return 'Other';
  }
}

/**
 * Answer questions about transactions and spending using the generic database query tool
 */
export async function queryTransactions(
  question: string,
  transactionData: Record<string, unknown>[]
): Promise<string> {
  const startTime = Date.now();
  
  logger.info({ 
    question: question.substring(0, 100),
    dataCount: transactionData.length 
  }, 'Starting transaction query processing');
  
  // Parse the question to determine what kind of query to make
  const queryParams = parseQuestionToQueryParams(question);
  
  logger.debug({ queryParams }, 'Parsed query parameters');
  
  // Get the data using our generic query function
  const analysisResult = queryFinancialDatabase(queryParams);
  
  logger.debug({ 
    analysisType: analysisResult.type,
    hasData: !!analysisResult 
  }, 'Database analysis completed');
  
  // Format the result into a conversational response
  const prompt = `
    Based on this financial analysis, answer the user's question: "${question}"
    
    Analysis Result:
    ${JSON.stringify(analysisResult, null, 2)}
    
    Provide a helpful, conversational response. Include specific numbers and insights.
    Use the data from the analysis result to give accurate information.
    Format currency amounts nicely (e.g., $1,234.56).
    
    Examples:
    - "How much did I spend this month?" → "You spent $1,234 this month across 15 transactions."
    - "What's my biggest expense category?" → "Your biggest expense is Food & Drink at $456 (35% of total spending)."
  `;

  try {
    logger.debug({ promptLength: prompt.length }, 'Sending query response generation to Gemini');
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.info({ 
      duration,
      responseLength: responseText.length,
      question: question.substring(0, 100)
    }, 'Transaction query processing completed');
    
    return responseText;
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.error({ 
      error: error instanceof Error ? error.message : error,
      duration,
      question: question.substring(0, 100)
    }, 'Transaction query processing failed');
    
    return 'I apologize, but I encountered an error while analyzing your transactions. Please try again.';
  }
}

/**
 * Parse a natural language question into query parameters
 */
function parseQuestionToQueryParams(question: string): DatabaseQueryParams {
  const lowerQuestion = question.toLowerCase();
  const params: DatabaseQueryParams = {};
  
  // Determine analysis type
  if (lowerQuestion.includes('spend') || lowerQuestion.includes('spent')) {
    params.analysisType = 'spending';
    params.transactionType = 'expense';
  } else if (lowerQuestion.includes('income') || lowerQuestion.includes('earned') || lowerQuestion.includes('made')) {
    params.analysisType = 'income';
    params.transactionType = 'income';
  } else if (lowerQuestion.includes('categor')) {
    params.analysisType = 'categories';
  } else if (lowerQuestion.includes('vendor') || lowerQuestion.includes('where') || lowerQuestion.includes('who')) {
    params.analysisType = 'vendors';
  } else if (lowerQuestion.includes('pattern') || lowerQuestion.includes('trend')) {
    params.analysisType = 'patterns';
  } else if (lowerQuestion.includes('transaction') || lowerQuestion.includes('list')) {
    params.analysisType = 'transactions';
  } else {
    params.analysisType = 'summary';
  }
  
  // Parse time periods
  if (lowerQuestion.includes('today')) {
    params.specificDate = new Date().toISOString().split('T')[0];
  } else if (lowerQuestion.includes('yesterday')) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    params.specificDate = yesterday.toISOString().split('T')[0];
  } else if (lowerQuestion.includes('last week')) {
    params.weeksBack = 1;
  } else if (lowerQuestion.includes('this week')) {
    params.daysBack = 7;
  } else if (lowerQuestion.includes('last month')) {
    params.monthsBack = 1;
  } else if (lowerQuestion.includes('this month')) {
    const now = new Date();
    params.startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    params.endDate = now.toISOString();
  } else if (lowerQuestion.includes('last 30 days') || lowerQuestion.includes('past 30 days')) {
    params.daysBack = 30;
  } else if (lowerQuestion.includes('last 7 days') || lowerQuestion.includes('past 7 days')) {
    params.daysBack = 7;
  }
  
  // Parse specific categories
  const categories = ['food', 'transport', 'utilities', 'entertainment', 'shopping', 'healthcare', 'education'];
  for (const category of categories) {
    if (lowerQuestion.includes(category)) {
      params.category = category;
      break;
    }
  }
  
  // Parse grouping
  if (lowerQuestion.includes('by day') || lowerQuestion.includes('daily')) {
    params.groupBy = 'date';
  } else if (lowerQuestion.includes('by week') || lowerQuestion.includes('weekly')) {
    params.groupBy = 'weekday';
  } else if (lowerQuestion.includes('by month') || lowerQuestion.includes('monthly')) {
    params.groupBy = 'month';
  }
  
  return params;
}

/**
 * Generate suggestions for financial improvements
 */
export async function generateFinancialSuggestions(
  stats: {
    totalIncome: number;
    totalExpenses: number;
    topCategories: Array<{ category: string; amount: number }>;
  }
): Promise<string[]> {
  const prompt = `
    Based on these financial statistics, provide 3-5 actionable suggestions for improvement:
    
    Monthly Income: $${stats.totalIncome}
    Monthly Expenses: $${stats.totalExpenses}
    Top Spending Categories: ${stats.topCategories.map(c => `${c.category}: $${c.amount}`).join(', ')}
    
    Return suggestions as a JSON array of strings.
    Focus on practical, actionable advice.
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return ['Consider tracking your expenses more closely to identify saving opportunities.'];
    }

    const suggestions = JSON.parse(jsonMatch[0]);
    return Array.isArray(suggestions) ? suggestions : [];
  } catch (error) {
    console.error('Error generating suggestions:', error);
    return ['Consider tracking your expenses more closely to identify saving opportunities.'];
  }
}

/**
 * Use Gemini to detect user intent from the message
 */
export async function detectIntent(message: string): Promise<'create' | 'query' | 'help'> {
  const startTime = Date.now();
  
  logger.info({ message: message.substring(0, 100) }, 'Starting intent detection');
  
  const prompt = `
    Analyze this user message and determine the intent. Return ONLY one word:
    
    - "create" if the user is describing a financial transaction (spending money, earning money, making a purchase, receiving payment, etc.)
    - "query" if the user is asking questions about their finances or requesting analysis (how much spent, show expenses, financial summaries, etc.)
    - "help" if the user needs general assistance or the message doesn't fit the above categories
    
    User message: "${message}"
    
    Return only: create, query, or help
  `;

  try {
    logger.debug({ promptLength: prompt.length }, 'Sending intent detection request to Gemini');
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const intent = response.text().trim().toLowerCase();
    
    if (['create', 'query', 'help'].includes(intent)) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      logger.info({ intent, duration }, 'Intent detection completed successfully');
      
      return intent as 'create' | 'query' | 'help';
    }
    
    logger.warn({ intent, message: message.substring(0, 100) }, 'Unclear intent response, using fallback');
    
    // Fallback to help if response is unclear
    return 'help';
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.error({ 
      error: error instanceof Error ? error.message : error,
      duration 
    }, 'Intent detection failed, using keyword fallback');
    
    // Fallback to simple keyword detection
    const lowerMessage = message.toLowerCase();
    let fallbackIntent: 'create' | 'query' | 'help' = 'help';
    
    if (lowerMessage.includes('$') || lowerMessage.includes('spent') || lowerMessage.includes('bought') || lowerMessage.includes('earned') || lowerMessage.includes('won')) {
      fallbackIntent = 'create';
    } else if (lowerMessage.includes('show') || lowerMessage.includes('how much') || lowerMessage.includes('total')) {
      fallbackIntent = 'query';
    }
    
    logger.info({ fallbackIntent }, 'Using keyword-based intent detection');
    
    return fallbackIntent;
  }
}

/**
 * Parse CSV data using Gemini 2.5 Pro Preview for fast and accurate processing
 */
export async function parseCSVWithGemini(csvText: string): Promise<{
  preview: string;
  transactions: Array<{
    amount: number;
    vendor: string;
    description: string;
    date: Date;
    category: string;
    type: 'income' | 'expense';
  }>;
  requiresConfirmation: boolean;
}> {
  const startTime = Date.now();
  
  logger.info({ csvLength: csvText.length }, 'Starting CSV parsing with Gemini');
  
  const prompt = `Parse this CSV data into transactions. Return JSON only:

${csvText}

Convert each row to this format:
{
  "preview": "Found X transactions",
  "transactions": [
    {
      "amount": number (negative for expenses, positive for income),
      "vendor": "string",
      "description": "string",
      "date": "ISO date string",
      "category": "string (${CATEGORIES.join('|')})",
      "type": "income" | "expense"
    }
  ],
  "requiresConfirmation": true
}

Rules:
- Negative amounts = expenses, Positive = income
- Parse dates to ISO format
- Choose best category from: ${CATEGORIES.join(', ')}
- Extract vendor from description if no vendor column
- Skip header row`;

  try {
    // Use Pro Preview for faster processing, fallback to Flash if needed
    let result;
    let modelUsed = 'pro';
    
    try {
      logger.debug({ promptLength: prompt.length }, 'Attempting CSV parsing with Pro model');
      result = await proModel.generateContent(prompt);
    } catch (proError) {
      logger.warn({ error: proError instanceof Error ? proError.message : proError }, 'Pro Preview unavailable, using Flash model');
      modelUsed = 'flash';
      result = await model.generateContent(prompt);
    }
    
    const text = result.response.text();
    
    logger.debug({ responseLength: text.length, modelUsed }, 'Received CSV parsing response');
    
    // Extract JSON from response (handles markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error({ response: text.substring(0, 500) }, 'No valid JSON found in CSV parsing response');
      throw new Error('No valid JSON found in response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Process transactions with simple validation
    const transactions = (parsed.transactions || []).map((t: any) => ({
      amount: Number(t.amount) || 0,
      vendor: t.vendor || 'Unknown',
      description: t.description || '',
      date: new Date(t.date) || new Date(),
      category: t.category || 'Other',
      type: t.type || (Number(t.amount) >= 0 ? 'income' : 'expense')
    }));
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.info({ 
      duration, 
      transactionCount: transactions.length,
      modelUsed,
      csvLength: csvText.length 
    }, 'CSV parsing completed successfully');
    
    return {
      preview: parsed.preview || `Found ${transactions.length} transactions`,
      transactions,
      requiresConfirmation: true
    };
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.error({ 
      error: error instanceof Error ? error.message : error,
      duration,
      csvLength: csvText.length 
    }, 'CSV parsing failed');
    
    throw new Error('Failed to parse CSV. Please check your file format.');
  }
}

/**
 * Generic MCP-style database query tool that Gemini can call with flexible parameters
 */

interface DatabaseQueryParams {
  // Time parameters
  startDate?: string;      // ISO date string
  endDate?: string;        // ISO date string
  daysBack?: number;       // How many days back from today
  weeksBack?: number;      // How many weeks back from today
  monthsBack?: number;     // How many months back from today
  
  // Filter parameters
  category?: string;       // Transaction category to filter by
  vendor?: string;         // Vendor to filter by
  minAmount?: number;      // Minimum transaction amount
  maxAmount?: number;      // Maximum transaction amount
  transactionType?: 'income' | 'expense' | 'both'; // Type of transactions
  
  // Query type parameters
  analysisType?: 'summary' | 'spending' | 'income' | 'categories' | 'vendors' | 'patterns' | 'transactions';
  groupBy?: 'date' | 'category' | 'vendor' | 'weekday' | 'month';
  limit?: number;          // Maximum number of results to return
  
  // Specific date queries
  specificDate?: string;   // Query for a specific date (YYYY-MM-DD)
}

export function queryFinancialDatabase(params: DatabaseQueryParams = {}) {
  initDatabase();
  
  // Calculate date range
  const dateRange = calculateDateRange(params);
  
  // Get base transactions
  let transactions = dateRange.start && dateRange.end 
    ? transactionDb.getByDateRange(dateRange.start, dateRange.end)
    : transactionDb.getAll(1000);
  
  // Apply filters
  transactions = applyFilters(transactions, params);
  
  // Perform analysis based on type
  const analysisType = params.analysisType || 'summary';
  const result = performAnalysis(transactions, analysisType, params, dateRange);
  
  return result;
}

function calculateDateRange(params: DatabaseQueryParams) {
  const now = new Date();
  let start: Date | undefined;
  let end: Date | undefined;
  
  // Handle specific date
  if (params.specificDate) {
    const date = new Date(params.specificDate);
    start = new Date(date.setHours(0, 0, 0, 0));
    end = new Date(date.setHours(23, 59, 59, 999));
    return { start, end, description: `on ${start.toLocaleDateString()}` };
  }
  
  // Handle explicit date range
  if (params.startDate) {
    start = new Date(params.startDate);
  }
  if (params.endDate) {
    end = new Date(params.endDate);
  }
  
  // Handle duration-based queries
  if (params.daysBack) {
    start = new Date(now.getTime() - params.daysBack * 24 * 60 * 60 * 1000);
    end = now;
  } else if (params.weeksBack) {
    start = new Date(now.getTime() - params.weeksBack * 7 * 24 * 60 * 60 * 1000);
    end = now;
  } else if (params.monthsBack) {
    start = new Date(now.getFullYear(), now.getMonth() - params.monthsBack, now.getDate());
    end = now;
  }
  
  // Default to current month if no date specified
  if (!start && !end) {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = now;
  }
  
  const description = start && end 
    ? `from ${start.toLocaleDateString()} to ${end.toLocaleDateString()}`
    : 'in the analyzed period';
  
  return { start, end, description };
}

function applyFilters(transactions: any[], params: DatabaseQueryParams) {
  let filtered = transactions;
  
  // Filter by transaction type
  if (params.transactionType && params.transactionType !== 'both') {
    filtered = filtered.filter(t => t.type === params.transactionType);
  }
  
  // Filter by category
  if (params.category) {
    filtered = filtered.filter(t => 
      t.category.toLowerCase().includes(params.category!.toLowerCase())
    );
  }
  
  // Filter by vendor
  if (params.vendor) {
    filtered = filtered.filter(t => 
      t.vendor.toLowerCase().includes(params.vendor!.toLowerCase())
    );
  }
  
  // Filter by amount range
  if (params.minAmount !== undefined) {
    filtered = filtered.filter(t => Math.abs(t.amount) >= params.minAmount!);
  }
  if (params.maxAmount !== undefined) {
    filtered = filtered.filter(t => Math.abs(t.amount) <= params.maxAmount!);
  }
  
  return filtered;
}

function performAnalysis(transactions: any[], analysisType: string, params: DatabaseQueryParams, dateRange: any) {
  const expenses = transactions.filter(t => t.type === 'expense');
  const income = transactions.filter(t => t.type === 'income');
  
  switch (analysisType) {
    case 'spending':
      return analyzeSpending(expenses, dateRange, params);
    
    case 'income':
      return analyzeIncome(income, dateRange, params);
    
    case 'categories':
      return analyzeCategories(transactions, dateRange, params);
    
    case 'vendors':
      return analyzeVendors(transactions, dateRange, params);
    
    case 'patterns':
      return analyzePatterns(transactions, dateRange, params);
    
    case 'transactions':
      return listTransactions(transactions, dateRange, params);
    
    default: // 'summary'
      return analyzeSummary(transactions, dateRange, params);
  }
}

function analyzeSpending(expenses: any[], dateRange: any, params: DatabaseQueryParams) {
  const totalSpent = expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  
  return {
    type: 'spending_analysis',
    summary: `Total spending: ${formatCurrency(totalSpent)} ${dateRange.description}`,
    totalSpent,
    transactionCount: expenses.length,
    averageTransaction: expenses.length > 0 ? totalSpent / expenses.length : 0,
    period: dateRange.description,
    categoryBreakdown: getCategoryBreakdown(expenses),
    topTransactions: expenses
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, params.limit || 5)
      .map(formatTransaction)
  };
}

function analyzeIncome(income: any[], dateRange: any, params: DatabaseQueryParams) {
  const totalIncome = income.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  
  return {
    type: 'income_analysis',
    summary: `Total income: ${formatCurrency(totalIncome)} ${dateRange.description}`,
    totalIncome,
    transactionCount: income.length,
    averageTransaction: income.length > 0 ? totalIncome / income.length : 0,
    period: dateRange.description,
    categoryBreakdown: getCategoryBreakdown(income),
    transactions: income.slice(0, params.limit || 10).map(formatTransaction)
  };
}

function analyzeCategories(transactions: any[], dateRange: any, params: DatabaseQueryParams) {
  const categoryBreakdown = getCategoryBreakdown(transactions);
  
  return {
    type: 'category_analysis',
    summary: `Spending breakdown by category ${dateRange.description}`,
    categoryBreakdown,
    topCategory: categoryBreakdown[0] || null,
    period: dateRange.description,
    totalAmount: transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0)
  };
}

function analyzeVendors(transactions: any[], dateRange: any, params: DatabaseQueryParams) {
  const vendorBreakdown = transactions.reduce((acc, t) => {
    const vendor = t.vendor || 'Unknown';
    if (!acc[vendor]) {
      acc[vendor] = { count: 0, total: 0 };
    }
    acc[vendor].count++;
    acc[vendor].total += Math.abs(t.amount);
    return acc;
  }, {} as Record<string, { count: number; total: number }>);
  
  const vendorArray = Object.entries(vendorBreakdown)
    .map(([vendor, data]) => ({
      vendor,
      count: (data as { count: number; total: number }).count,
      total: (data as { count: number; total: number }).total,
      average: (data as { count: number; total: number }).total / (data as { count: number; total: number }).count
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, params.limit || 10);
  
  return {
    type: 'vendor_analysis',
    summary: `Top vendors ${dateRange.description}`,
    vendorBreakdown: vendorArray,
    topVendor: vendorArray[0] || null,
    period: dateRange.description,
    totalVendors: Object.keys(vendorBreakdown).length
  };
}

function analyzePatterns(transactions: any[], dateRange: any, params: DatabaseQueryParams) {
  // Group by date, weekday, or month based on groupBy parameter
  const groupBy = params.groupBy || 'date';
  const grouped: Record<string, number> = {};
  
  transactions.forEach(t => {
    let key: string;
    const date = new Date(t.date);
    
    switch (groupBy) {
      case 'weekday':
        key = date.toLocaleDateString('en-US', { weekday: 'long' });
        break;
      case 'month':
        key = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        break;
      default: // 'date'
        key = date.toDateString();
    }
    
    if (!grouped[key]) grouped[key] = 0;
    grouped[key] += Math.abs(t.amount);
  });
  
  const patterns = Object.entries(grouped)
    .map(([key, amount]) => ({ period: key, amount }))
    .sort((a, b) => b.amount - a.amount);
  
  return {
    type: 'pattern_analysis',
    summary: `Spending patterns by ${groupBy} ${dateRange.description}`,
    patterns,
    period: dateRange.description,
    groupBy,
    totalAmount: transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0)
  };
}

function listTransactions(transactions: any[], dateRange: any, params: DatabaseQueryParams) {
  const sortedTransactions = transactions
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, params.limit || 20);
  
  return {
    type: 'transaction_list',
    summary: `${sortedTransactions.length} transactions ${dateRange.description}`,
    transactions: sortedTransactions.map(formatTransaction),
    period: dateRange.description,
    totalCount: transactions.length
  };
}

function analyzeSummary(transactions: any[], dateRange: any, params: DatabaseQueryParams) {
  const expenses = transactions.filter(t => t.type === 'expense');
  const income = transactions.filter(t => t.type === 'income');
  
  const totalSpent = expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const totalIncome = income.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const netAmount = totalIncome - totalSpent;
  
  return {
    type: 'financial_summary',
    summary: `Financial overview ${dateRange.description}`,
    totalSpent,
    totalIncome,
    netAmount,
    expenseCount: expenses.length,
    incomeCount: income.length,
    categoryBreakdown: getCategoryBreakdown(expenses),
    period: dateRange.description
  };
}

function formatTransaction(t: any) {
  return {
    description: t.description,
    vendor: t.vendor,
    amount: Math.abs(t.amount),
    date: new Date(t.date).toLocaleDateString(),
    category: t.category,
    type: t.type
  };
}

// Helper function for category breakdown
function getCategoryBreakdown(transactions: any[]) {
  const categoryTotals = transactions.reduce((acc, t) => {
    const category = t.category;
    if (!acc[category]) acc[category] = 0;
    acc[category] += Math.abs(t.amount);
    return acc;
  }, {} as Record<string, number>);
  
  return Object.entries(categoryTotals)
    .map(([category, amount]) => ({ category, amount: amount as number }))
    .sort((a, b) => (b.amount as number) - (a.amount as number));
} 