export interface Transaction {
  id: string;
  date: Date;
  amount: number;
  vendor: string;
  description: string;
  category: TransactionCategory;
  type: TransactionType;
  receiptUrl?: string;
  createdAt: Date;
  updatedAt: Date;
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
  amount: number;
  vendor?: string;
  description: string;
  category?: TransactionCategory;
  type?: TransactionType;
  receiptUrl?: string;
}

export interface ParsedTransactionText {
  amount?: number;
  vendor?: string;
  description?: string;
  date?: Date;
  category?: TransactionCategory;
}

export interface ReceiptData {
  date?: Date;
  vendor?: string;
  total?: number;
  items?: Array<{
    name: string;
    price: number;
    quantity?: number;
  }>;
}

export interface CSVTransaction {
  date: string;
  description: string;
  amount: string;
  [key: string]: string; // For additional CSV columns
}

export interface TransactionStats {
  totalIncome: number;
  totalExpenses: number;
  netAmount: number;
  transactionCount: number;
  averageTransaction: number;
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
}

export interface CategoryData {
  category: TransactionCategory;
  amount: number;
  count: number;
  percentage: number;
} 