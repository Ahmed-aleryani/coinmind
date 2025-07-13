/**
 * Unified currency formatting utility
 * Consolidates all currency formatting logic from the codebase
 */

export interface CurrencyFormatOptions {
  locale?: string;
  showSign?: boolean;
  showCents?: boolean;
  currency?: string;
}

export interface CurrencyInfo {
  symbol: string;
  locale: string;
  currency: string;
}

export class CurrencyFormatter {
  private static readonly CURRENCY_SYMBOLS: Record<string, string> = {
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
    ILS: "₪", // Israeli Shekel
    IRR: "ریال", // Iranian Rial
    PKR: "₨", // Pakistani Rupee
  };

  private static readonly CURRENCY_LOCALES: Record<string, { locale: string; currency: string }> = {
    ar: { locale: 'ar-SA', currency: 'SAR' },
    en: { locale: 'en-US', currency: 'USD' },
    es: { locale: 'es-ES', currency: 'EUR' },
    fr: { locale: 'fr-FR', currency: 'EUR' },
    de: { locale: 'de-DE', currency: 'EUR' },
    it: { locale: 'it-IT', currency: 'EUR' },
    pt: { locale: 'pt-PT', currency: 'EUR' },
    ru: { locale: 'ru-RU', currency: 'RUB' },
    zh: { locale: 'zh-CN', currency: 'CNY' },
    ja: { locale: 'ja-JP', currency: 'JPY' },
    ko: { locale: 'ko-KR', currency: 'KRW' },
    hi: { locale: 'hi-IN', currency: 'INR' },
    tr: { locale: 'tr-TR', currency: 'TRY' },
    nl: { locale: 'nl-NL', currency: 'EUR' },
    pl: { locale: 'pl-PL', currency: 'PLN' },
    sv: { locale: 'sv-SE', currency: 'SEK' },
    da: { locale: 'da-DK', currency: 'DKK' },
    no: { locale: 'no-NO', currency: 'NOK' },
    fi: { locale: 'fi-FI', currency: 'EUR' },
    he: { locale: 'he-IL', currency: 'ILS' },
    fa: { locale: 'fa-IR', currency: 'IRR' },
    ur: { locale: 'ur-PK', currency: 'PKR' }
  };

  /**
   * Format currency amount with proper localization
   */
  static format(amount: number, currencyCode: string, options: CurrencyFormatOptions = {}): string {
    const {
      locale = 'en-US',
      showSign = false,
      showCents = true,
      currency = currencyCode
    } = options;

    try {
      const formatter = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: showCents ? 2 : 0,
        maximumFractionDigits: showCents ? 2 : 0,
      });

      const formatted = formatter.format(Math.abs(amount));
      
      if (showSign) {
        if (amount > 0) return `+${formatted}`;
        if (amount < 0) return `-${formatted}`;
      }
      
      return formatted;
    } catch (error) {
      // Fallback to USD if currency code is invalid
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: showCents ? 2 : 0,
        maximumFractionDigits: showCents ? 2 : 0,
      }).format(Math.abs(amount));
    }
  }

  /**
   * Format currency with symbol (for display purposes)
   */
  static formatWithSymbol(amount: number, currencyCode: string): string {
    const symbol = this.getSymbol(currencyCode);
    const formattedNumber = Math.abs(amount).toLocaleString('en-US', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
    return `${formattedNumber}${symbol}`;
  }

  /**
   * Get currency symbol by code
   */
  static getSymbol(currencyCode: string): string {
    return this.CURRENCY_SYMBOLS[currencyCode] || currencyCode;
  }

  /**
   * Format amount with color context for UI
   */
  static formatWithColor(amount: number, currencyCode: string): {
    formatted: string;
    color: 'green' | 'red' | 'gray';
  } {
    const formatted = this.format(amount, currencyCode, { showSign: true });
    
    if (amount > 0) {
      return { formatted, color: 'green' };
    } else if (amount < 0) {
      return { formatted, color: 'red' };
    } else {
      return { formatted, color: 'gray' };
    }
  }

  /**
   * Format transaction amount for display in lists
   */
  static formatTransactionAmount(amount: number, type: 'income' | 'expense', currencyCode: string): {
    formatted: string;
    className: string;
  } {
    const absAmount = Math.abs(amount);
    const formatted = this.format(absAmount, currencyCode);
    
    if (type === 'income') {
      return {
        formatted: `+${formatted}`,
        className: 'text-green-600 dark:text-green-400'
      };
    } else {
      return {
        formatted: `-${formatted}`,
        className: 'text-red-600 dark:text-red-400'
      };
    }
  }

  /**
   * Format currency based on language code
   */
  static formatByLanguage(amount: number, languageCode: string): string {
    const format = this.CURRENCY_LOCALES[languageCode] || this.CURRENCY_LOCALES.en;
    return this.format(amount, format.currency, { locale: format.locale });
  }

  /**
   * Get currency info for a language code
   */
  static getCurrencyInfo(languageCode: string): { locale: string; currency: string } {
    return this.CURRENCY_LOCALES[languageCode] || this.CURRENCY_LOCALES.en;
  }

  /**
   * Validate currency code
   */
  static isValidCurrencyCode(currencyCode: string): boolean {
    try {
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currencyCode,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get supported currencies
   */
  static getSupportedCurrencies(): string[] {
    return Object.keys(this.CURRENCY_SYMBOLS);
  }

  /**
   * Get all currency symbols
   */
  static getAllCurrencySymbols(): Record<string, string> {
    return { ...this.CURRENCY_SYMBOLS };
  }
} 