export interface ExportTranslations {
  summary: string;
  totalTransactions: string;
  totalIncome: string;
  totalExpenses: string;
  netAmount: string;
  currencyBreakdown: string;
  transactions: string;
  categorySummary: string;
  currencySummary: string;
  date: string;
  category: string;
  description: string;
  vendor: string;
  originalAmount: string;
  convertedAmount: string;
  type: string;
  income: string;
  expense: string;
}

export const translations: Record<string, ExportTranslations> = {
  en: {
    summary: 'Summary',
    totalTransactions: 'Total Transactions',
    totalIncome: 'Total Income',
    totalExpenses: 'Total Expenses',
    netAmount: 'Net Amount',
    currencyBreakdown: 'Currency Breakdown',
    transactions: 'Transactions',
    categorySummary: 'Category Summary',
    currencySummary: 'Currency Summary',
    date: 'Date',
    category: 'Category',
    description: 'Description',
    vendor: 'Vendor',
    originalAmount: 'Original Amount',
    convertedAmount: 'Converted Amount',
    type: 'Type',
    income: 'income',
    expense: 'expense'
  },
  ar: {
    summary: 'الملخص',
    totalTransactions: 'إجمالي المعاملات',
    totalIncome: 'إجمالي الدخل',
    totalExpenses: 'إجمالي المصروفات',
    netAmount: 'صافي المبلغ',
    currencyBreakdown: 'تفصيل العملات',
    transactions: 'المعاملات',
    categorySummary: 'ملخص الفئات',
    currencySummary: 'ملخص العملات',
    date: 'التاريخ',
    category: 'الفئة',
    description: 'الوصف',
    vendor: 'البائع',
    originalAmount: 'المبلغ الأصلي',
    convertedAmount: 'المبلغ المحول',
    type: 'النوع',
    income: 'دخل',
    expense: 'مصروف'
  }
};

export function detectLanguage(text: string): string {
  // Simple Arabic detection
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  if (arabicRegex.test(text)) {
    return 'ar';
  }
  return 'en';
}

export function getTranslation(language: string = 'en'): ExportTranslations {
  return translations[language] || translations.en;
} 