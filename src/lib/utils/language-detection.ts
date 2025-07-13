import { CurrencyFormatter } from './currency-formatter';

export interface LanguageInfo {
  code: string;
  name: string;
  isRTL: boolean;
  direction: 'ltr' | 'rtl';
}

export const SUPPORTED_LANGUAGES: Record<string, LanguageInfo> = {
  ar: { code: 'ar', name: 'العربية', isRTL: true, direction: 'rtl' },
  en: { code: 'en', name: 'English', isRTL: false, direction: 'ltr' },
  es: { code: 'es', name: 'Español', isRTL: false, direction: 'ltr' },
  fr: { code: 'fr', name: 'Français', isRTL: false, direction: 'ltr' },
  de: { code: 'de', name: 'Deutsch', isRTL: false, direction: 'ltr' },
  it: { code: 'it', name: 'Italiano', isRTL: false, direction: 'ltr' },
  pt: { code: 'pt', name: 'Português', isRTL: false, direction: 'ltr' },
  ru: { code: 'ru', name: 'Русский', isRTL: false, direction: 'ltr' },
  zh: { code: 'zh', name: '中文', isRTL: false, direction: 'ltr' },
  ja: { code: 'ja', name: '日本語', isRTL: false, direction: 'ltr' },
  ko: { code: 'ko', name: '한국어', isRTL: false, direction: 'ltr' },
  hi: { code: 'hi', name: 'हिन्दी', isRTL: false, direction: 'ltr' },
  tr: { code: 'tr', name: 'Türkçe', isRTL: false, direction: 'ltr' },
  nl: { code: 'nl', name: 'Nederlands', isRTL: false, direction: 'ltr' },
  pl: { code: 'pl', name: 'Polski', isRTL: false, direction: 'ltr' },
  sv: { code: 'sv', name: 'Svenska', isRTL: false, direction: 'ltr' },
  da: { code: 'da', name: 'Dansk', isRTL: false, direction: 'ltr' },
  no: { code: 'no', name: 'Norsk', isRTL: false, direction: 'ltr' },
  fi: { code: 'fi', name: 'Suomi', isRTL: false, direction: 'ltr' },
  he: { code: 'he', name: 'עברית', isRTL: true, direction: 'rtl' },
  fa: { code: 'fa', name: 'فارسی', isRTL: true, direction: 'rtl' },
  ur: { code: 'ur', name: 'اردو', isRTL: true, direction: 'rtl' }
};

/**
 * Detect the language of the given text
 */
export function detectLanguage(text: string): LanguageInfo {
  if (!text || text.trim().length === 0) {
    return SUPPORTED_LANGUAGES.en; // Default to English
  }

  try {
    // const detectedCode = franc(text, { minLength: 3 });
    
    // Check if detected language is supported
    // if (detectedCode && detectedCode !== 'und' && SUPPORTED_LANGUAGES[detectedCode]) {
    //   return SUPPORTED_LANGUAGES[detectedCode];
    // }

    // Fallback: check for Arabic script
    if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)) {
      return SUPPORTED_LANGUAGES.ar;
    }

    // Fallback: check for Hebrew script
    if (/[\u0590-\u05FF]/.test(text)) {
      return SUPPORTED_LANGUAGES.he;
    }

    // Fallback: check for Persian/Farsi script
    if (/[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text) && /[\u0640-\u064A]/.test(text)) {
      return SUPPORTED_LANGUAGES.fa;
    }

    // Default to English
    return SUPPORTED_LANGUAGES.en;
  } catch (error) {
    console.warn('Language detection failed:', error);
    return SUPPORTED_LANGUAGES.en;
  }
}

/**
 * Check if text contains RTL characters
 */
export function isRTLText(text: string): boolean {
  const language = detectLanguage(text);
  return language.isRTL;
}

/**
 * Get text direction for a given language
 */
export function getTextDirection(languageCode: string): 'ltr' | 'rtl' {
  const language = SUPPORTED_LANGUAGES[languageCode];
  return language ? language.direction : 'ltr';
}

/**
 * Get all supported languages
 */
export function getSupportedLanguages(): LanguageInfo[] {
  return Object.values(SUPPORTED_LANGUAGES);
}

// formatCurrencyByLanguage function removed - use CurrencyFormatter.formatByLanguage() directly

/**
 * Extract currency amount from text in any language
 */
export function extractCurrencyAmount(text: string): { amount: number | null; currency: string } {
  // Common currency patterns
  const patterns = [
    // USD: $123.45, $1,234.56
    /\$([0-9,]+\.?[0-9]*)/,
    // EUR: €123.45, €1,234.56
    /€([0-9,]+\.?[0-9]*)/,
    // SAR: ر.س 123.45, ر.س 1,234.56
    /ر\.س\s*([0-9,]+\.?[0-9]*)/,
    // Generic numbers with currency symbols
    /([0-9,]+\.?[0-9]*)\s*(دولار|ريال|يورو|جنيه|دينار|درهم)/,
    // Numbers followed by currency words
    /([0-9,]+\.?[0-9]*)\s*(dollar|euro|pound|riyal|dirham|dinar)/i,
    // Just numbers (fallback)
    /([0-9,]+\.?[0-9]*)/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amountStr = match[1].replace(/,/g, '');
      const amount = parseFloat(amountStr);
      if (!isNaN(amount)) {
        // Determine currency based on pattern or language
        const language = detectLanguage(text);
        const currencyInfo = CurrencyFormatter.getCurrencyInfo(language.code);
        
        return {
          amount,
          currency: currencyInfo.currency
        };
      }
    }
  }

  return { amount: null, currency: 'USD' };
} 