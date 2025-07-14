import { Transaction, NewTransaction, Profile, NewProfile, Category, NewCategory, Currency } from '../db/schema';

// Transaction-related interfaces
export interface TransactionRepository {
  create(transaction: NewTransaction): Promise<Transaction>;
  findById(id: number): Promise<Transaction | null>;
  findByUserId(userId: string, limit?: number, offset?: number): Promise<Transaction[]>;
  update(id: number, updates: Partial<NewTransaction>): Promise<Transaction | null>;
  delete(id: number): Promise<boolean>;
  findByDateRange(userId: string, startDate: Date, endDate: Date): Promise<Transaction[]>;
  search(userId: string, query: string, limit?: number): Promise<Transaction[]>;
  getStats(userId: string, startDate?: Date, endDate?: Date): Promise<TransactionStats>;
}

export interface TransactionStats {
  totalIncome: number;
  totalExpenses: number;
  netAmount: number;
  transactionCount: number;
  averageTransaction: number;
  defaultCurrency: string;
  topCategories: Array<{ category: string; amount: number; count: number }>;
}

// Profile-related interfaces
export interface ProfileRepository {
  create(profile: NewProfile): Promise<Profile>;
  findById(id: string): Promise<Profile | null>;
  update(id: string, updates: Partial<NewProfile>): Promise<Profile | null>;
  delete(id: string): Promise<boolean>;
  ensureExists(id: string, defaultCurrency?: string): Promise<Profile>;
}

// Category-related interfaces
export interface CategoryRepository {
  create(category: NewCategory): Promise<Category>;
  findById(id: number): Promise<Category | null>;
  findByUserId(userId: string): Promise<Category[]>;
  findDefaults(): Promise<Category[]>;
  update(id: number, updates: Partial<NewCategory>): Promise<Category | null>;
  delete(id: number): Promise<boolean>;
  findByName(userId: string, name: string, type: 'income' | 'expense'): Promise<Category | null>;
}

// Currency-related interfaces
export interface CurrencyRepository {
  create(currency: Currency): Promise<Currency>;
  findAll(): Promise<Currency[]>;
  findByCode(code: string): Promise<Currency | null>;
  update(code: string, updates: Partial<Currency>): Promise<Currency | null>;
  delete(code: string): Promise<boolean>;
  ensureDefaultCurrencies(): Promise<void>;
}

// Chat-related interfaces (to be implemented later if needed)
export interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  transactionId?: number;
  metadata?: any;
}

export interface ChatRepository {
  createSession(userId: string): Promise<string>;
  addMessage(sessionId: string, message: Omit<ChatMessage, 'id'>): Promise<string>;
  getMessages(sessionId: string): Promise<ChatMessage[]>;
}

// Aggregated repository interface
export interface Repositories {
  transactions: TransactionRepository;
  profiles: ProfileRepository;
  categories: CategoryRepository;
  currencies: CurrencyRepository;
  chat?: ChatRepository;
} 