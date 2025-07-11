export interface Transaction {
  id: string;
  date: Date;
  amount: number;
  currency: string;
  vendor: string;
  description: string;
  category: TransactionCategory;
  type: TransactionType;
  receiptUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  // Multi-currency fields
  originalAmount?: number;
  originalCurrency?: string;
  convertedAmount?: number;
  convertedCurrency?: string;
  conversionRate?: number;
  conversionFee?: number;
}

export type TransactionCategory = 
  | 'Food & Drink'
  | 'Transportation'
  | 'Utilities'
  | 'Entertainment'
  | 'Shopping'
  | 'Healthcare'
  | 'Education'
  | 'Income'
  | 'Transfer'
  | 'Other';

export type TransactionType = 'income' | 'expense';

export interface TransactionInput {
  date?: Date;
  // Legacy fields for backward compatibility
  amount?: number;
  currency?: string;
  // New multi-currency fields (optional for backward compatibility)
  originalAmount?: number;
  originalCurrency?: string;
  convertedAmount?: number;
  convertedCurrency?: string;
  conversionRate?: number;
  conversionFee?: number;
  vendor?: string;
  description: string;
  category?: TransactionCategory;
  type?: TransactionType;
  receiptUrl?: string;
}

export interface ParsedTransactionText {
  amount?: number;
  currency?: string;
  vendor?: string;
  description?: string;
  date?: Date;
  category?: TransactionCategory;
  type?: TransactionType;
}

export interface UserSettings {
  id: string;
  defaultCurrency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CurrencyConversion {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  timestamp: Date;
}

export interface ReceiptData {
  date?: Date;
  vendor?: string;
  total?: number;
  currency?: string;
  items?: Array<{
    name: string;
    price: number;
    quantity?: number;
  }>;
}

export interface ReceiptLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  category: TransactionCategory;
}

export interface ReceiptSplit {
  person: string;
  amount: number;
}

export interface ProcessedReceipt {
  receiptId: string;
  merchant: string;
  date: string;
  paymentMethod: string;
  currency: string;
  total: number;
  tax: number;
  tip: number;
  lineItems: ReceiptLineItem[];
  splits: ReceiptSplit[];
  convertedTotal: number;
  exchangeRate: number;
  confidence: number;
  unclearFields: string[];
  detectedLanguage: string;
  userMessage: string;
}

export interface CSVTransaction {
  date: string;
  description: string;
  amount: string;
  currency?: string;
  [key: string]: string | undefined; // For additional CSV columns
}

export interface TransactionStats {
  totalIncome: number;
  totalExpenses: number;
  netAmount: number;
  transactionCount: number;
  averageTransaction: number;
  defaultCurrency: string;
  topCategories: Array<{
    category: TransactionCategory;
    amount: number;
    count: number;
  }>;
}

export interface MonthlyData {
  month: string;
  income: number;
  expenses: number;
  net: number;
  currency: string;
}

export interface CategoryData {
  category: TransactionCategory;
  amount: number;
  count: number;
  percentage: number;
} 