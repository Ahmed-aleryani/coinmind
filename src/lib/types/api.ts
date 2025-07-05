export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface GeminiRequest {
  text?: string;
  image?: string; // Base64 encoded image
  type: 'parse_transaction' | 'parse_receipt' | 'categorize' | 'query';
}

export interface GeminiResponse {
  result: {
    amount?: number;
    vendor?: string;
    description?: string;
    date?: string;
    category?: string;
    items?: Array<{
      name: string;
      price: number;
      quantity?: number;
    }>;
    total?: number;
    confidence?: number;
  };
  error?: string;
}

export interface UploadResponse {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
}

export interface CSVPreview {
  headers: string[];
  rows: string[][];
  totalRows: number;
  columnMapping?: {
    date?: string;
    description?: string;
    amount?: string;
  };
}

export interface ImportProgress {
  processed: number;
  total: number;
  errors: number;
  skipped: number;
  currentItem?: string;
  isComplete?: boolean;
}

export interface StatsResponse {
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalIncome: number;
    totalExpenses: number;
    netAmount: number;
    transactionCount: number;
  };
  monthlyData: Array<{
    month: string;
    income: number;
    expenses: number;
    net: number;
  }>;
  categoryData: Array<{
    category: string;
    amount: number;
    count: number;
    percentage: number;
  }>;
} 