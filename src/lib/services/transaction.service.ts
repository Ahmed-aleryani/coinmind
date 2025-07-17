import { TransactionRepository, ProfileRepository, CategoryRepository, CurrencyRepository } from '../domain/repositories';
import { Transaction, NewTransaction, Category } from '../db/schema';
import { getExchangeRate } from '../utils/currency';
import { parseTransactionText } from '../api/gemini';
import logger from '../utils/logger';

export interface TransactionInput {
  amount: number;
  currency?: string;
  vendor?: string;
  description: string;
  category?: string;
  type?: 'income' | 'expense';
  date?: Date;
  receiptUrl?: string;
  
  // Multi-currency fields
  originalAmount?: number;
  originalCurrency?: string;
  convertedAmount?: number;
  convertedCurrency?: string;
  conversionRate?: number;
  conversionFee?: number;
}

export interface EnrichedTransaction {
  id: string;
  date: Date;
  amount: number;
  currency: string;
  vendor: string;
  description: string;
  category: string;
  type: 'income' | 'expense';
  // Multi-currency fields
  originalAmount?: number;
  originalCurrency?: string;
  convertedAmount?: number;
  convertedCurrency?: string;
  conversionRate?: number;
  conversionFee?: number;
}

export class TransactionService {
  constructor(
    private transactionRepo: TransactionRepository,
    private profileRepo: ProfileRepository,
    private categoryRepo: CategoryRepository,
    private currencyRepo: CurrencyRepository
  ) {}

  async createTransaction(userId: string, input: TransactionInput): Promise<EnrichedTransaction> {
    try {
      // Ensure user profile exists
      const profile = await this.profileRepo.ensureExists(userId);
      const defaultCurrency = profile.defaultCurrency;

      // Handle currency detection from description
      if (!input.currency && input.description) {
        if (/ريال|ريالات|ر\.س|SAR/i.test(input.description)) {
          input.currency = 'SAR';
        }
      }

      // Calculate multi-currency amounts
      const {
        originalAmount,
        originalCurrency,
        convertedAmount,
        convertedCurrency,
        conversionRate,
        conversionFee
      } = await this.calculateAmounts(input, defaultCurrency);

      // Map AI category to existing categories
      const mappedCategory = this.mapAiCategoryToDefault(input.category || 'Other');
      
    
     // Determine transaction type - trust the LLM's decision, default to expense if not provided
     const transactionType = input.type || 'expense';

      // Find or create category
      const category = await this.findOrCreateCategory(
        userId,
        mappedCategory,
        transactionType
      );

      // For PostgreSQL: store absolute amounts and use type to indicate income/expense
      const absoluteAmount = Math.abs(convertedAmount);

      // Create transaction
      const newTransaction: NewTransaction = {
        ownerId: userId,
        categoryId: category.categoryId,
        currencyCode: convertedCurrency, // Store the converted currency (user's default)
        originalCurrency: originalCurrency, // Store the original currency
        originalAmount: originalAmount.toString(), // Store the original amount
        amount: absoluteAmount.toString(), // Store absolute amount
        conversionRate: conversionRate.toString(),
        convertedAmount: absoluteAmount.toString(), // Store absolute amount
        transactionDate: (input.date || new Date()).toISOString().split('T')[0],
        description: input.description,
        vendor: input.vendor || 'Unknown', // Add vendor field
        type: transactionType, // Add the type field
      };

      const transaction = await this.transactionRepo.create(newTransaction);
      
      // Return enriched transaction with category name
      return await this.enrichTransaction(transaction);
    } catch (error) {
      logger.error({ error, userId, input }, 'Failed to create transaction');
      throw new Error('Failed to create transaction');
    }
  }

  async parseAndCreateTransaction(userId: string, text: string): Promise<EnrichedTransaction> {
    try {
      const parsed = await parseTransactionText(text);
      
      const input: TransactionInput = {
        amount: parsed.amount || 0,
        currency: parsed.currency,
        vendor: parsed.vendor,
        description: parsed.description || text,
        category: parsed.category,
        type: parsed.type,
        date: parsed.date,
      };

      return await this.createTransaction(userId, input);
    } catch (error) {
      logger.error({ error, userId, text }, 'Failed to parse and create transaction');
      throw new Error('Failed to parse transaction');
    }
  }

  async getTransactions(userId: string, limit: number = 50, offset: number = 0): Promise<EnrichedTransaction[]> {
    try {
      const transactions = await this.transactionRepo.findByUserId(userId, limit, offset);
      
      // Enrich transactions with category names
      const enrichedTransactions = await Promise.all(
        transactions.map(transaction => this.enrichTransaction(transaction))
      );
      
      return enrichedTransactions;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get transactions');
      throw new Error('Failed to get transactions');
    }
  }

  async getTransaction(userId: string, transactionId: number): Promise<EnrichedTransaction | null> {
    try {
      const transaction = await this.transactionRepo.findById(transactionId);
      if (!transaction || transaction.ownerId !== userId) {
        return null;
      }
      return await this.enrichTransaction(transaction);
    } catch (error) {
      logger.error({ error, userId, transactionId }, 'Failed to get transaction');
      throw new Error('Failed to get transaction');
    }
  }

  async updateTransaction(userId: string, transactionId: number, updates: Partial<TransactionInput>): Promise<EnrichedTransaction | null> {
    try {
      // Verify ownership
      const existingTransaction = await this.transactionRepo.findById(transactionId);
      if (!existingTransaction || existingTransaction.ownerId !== userId) {
        return null;
      }

      // Handle category updates
      if (updates.category) {
        const mappedCategory = this.mapAiCategoryToDefault(updates.category);
        const category = await this.findOrCreateCategory(
          userId,
          mappedCategory,
          updates.type || 'expense'
        );
        updates.category = undefined; // Remove from updates as we'll use categoryId
        (updates as any).categoryId = category.categoryId;
      }

      // Handle currency conversion if needed
      if (updates.amount || updates.currency) {
        const profile = await this.profileRepo.findById(userId);
        const defaultCurrency = profile?.defaultCurrency || 'USD';
        
        const calculatedAmounts = await this.calculateAmounts(
          { ...updates, amount: updates.amount || Number(existingTransaction.amount), description: updates.description || existingTransaction.description || '' },
          defaultCurrency
        );

        // Store absolute amount for PostgreSQL
        const absoluteAmount = Math.abs(calculatedAmounts.convertedAmount);
        (updates as any).amount = absoluteAmount.toString();
        (updates as any).conversionRate = calculatedAmounts.conversionRate.toString();
        (updates as any).convertedAmount = calculatedAmounts.convertedAmount.toString();
      }

      // Handle vendor updates
      if (updates.vendor) {
        (updates as any).vendor = updates.vendor;
      }

      // Handle date updates
      if (updates.date) {
        (updates as any).transactionDate = updates.date.toISOString().split('T')[0];
        updates.date = undefined;
      }

      const updatedTransaction = await this.transactionRepo.update(transactionId, updates as any);
      
      if (!updatedTransaction) {
        return null;
      }
      
      return await this.enrichTransaction(updatedTransaction);
    } catch (error) {
      logger.error({ error, userId, transactionId, updates }, 'Failed to update transaction');
      throw new Error('Failed to update transaction');
    }
  }

  async deleteTransaction(userId: string, transactionId: number): Promise<boolean> {
    try {
      const transaction = await this.transactionRepo.findById(transactionId);
      if (!transaction || transaction.ownerId !== userId) {
        return false;
      }

      return await this.transactionRepo.delete(transactionId);
    } catch (error) {
      logger.error({ error, userId, transactionId }, 'Failed to delete transaction');
      throw new Error('Failed to delete transaction');
    }
  }

  async searchTransactions(userId: string, query: string, limit: number = 50): Promise<EnrichedTransaction[]> {
    try {
      const transactions = await this.transactionRepo.search(userId, query, limit);
      
      // Enrich transactions with category names
      const enrichedTransactions = await Promise.all(
        transactions.map(transaction => this.enrichTransaction(transaction))
      );
      
      return enrichedTransactions;
    } catch (error) {
      logger.error({ error, userId, query }, 'Failed to search transactions');
      throw new Error('Failed to search transactions');
    }
  }

  async getTransactionStats(userId: string, startDate?: Date, endDate?: Date) {
    try {
      await this.profileRepo.ensureExists(userId);
      return await this.transactionRepo.getStats(userId, startDate, endDate);
    } catch (error) {
      logger.error({ error, userId, startDate, endDate }, 'Failed to get transaction stats');
      throw new Error('Failed to get transaction stats');
    }
  }

  private async calculateAmounts(input: TransactionInput, defaultCurrency: string) {
    let originalAmount = input.amount || 0;
    let originalCurrency = input.currency || defaultCurrency;
    let convertedAmount = originalAmount;
    let convertedCurrency = defaultCurrency;
    let conversionRate = 1;
    let conversionFee = 0;

    // Handle multi-currency conversion
    if (input.originalAmount !== undefined && input.convertedAmount !== undefined) {
      // New multi-currency format
      originalAmount = input.originalAmount;
      originalCurrency = input.originalCurrency || defaultCurrency;
      convertedAmount = input.convertedAmount;
      convertedCurrency = input.convertedCurrency || defaultCurrency;
      conversionRate = input.conversionRate || 1;
      conversionFee = input.conversionFee || 0;
    } else if (originalCurrency !== defaultCurrency) {
      // Legacy format - convert to default currency
      try {
        logger.info({ originalAmount, originalCurrency, defaultCurrency }, 'Converting currency');
        conversionRate = await getExchangeRate(originalCurrency, defaultCurrency);
        convertedAmount = Math.abs(originalAmount) * conversionRate;
        convertedCurrency = defaultCurrency;
        logger.info({ convertedAmount, conversionRate }, 'Currency conversion completed');
      } catch (error) {
        logger.error({ error }, 'Currency conversion failed');
        // Keep original values if conversion fails
        convertedAmount = Math.abs(originalAmount);
        convertedCurrency = originalCurrency;
        conversionRate = 1;
      }
    }

    return {
      originalAmount,
      originalCurrency,
      convertedAmount,
      convertedCurrency,
      conversionRate,
      conversionFee
    };
  }

  private mapAiCategoryToDefault(aiCategory: string): string {
    // Mapping from AI-generated categories to default categories
    const categoryMap: Record<string, string> = {
      'Food & Drink': 'Food & Dining',
      'Food & Beverages': 'Food & Dining',
      'Food': 'Food & Dining',
      'Groceries': 'Food & Dining',
      'Dining': 'Food & Dining',
      'Restaurant': 'Food & Dining',
      'Bills & Utilities': 'Bills & Utilities',
      'Utilities': 'Bills & Utilities',
      'Bills': 'Bills & Utilities',
      'Transport': 'Transportation',
      'Travel': 'Travel',
      'Medical': 'Healthcare',
      'Health': 'Healthcare',
      'Shopping': 'Shopping',
      'Entertainment': 'Entertainment',
      'Education': 'Education',
      'Other': 'Other Expenses',
      'Expenses': 'Other Expenses',
      'Income': 'Other Income',
      'Salary': 'Salary',
      'Business': 'Business',
      'Investment': 'Investment',
      'Gift': 'Gift',
    };

    return categoryMap[aiCategory] || aiCategory;
  }

  private async findOrCreateCategory(userId: string, categoryName: string, type: 'income' | 'expense'): Promise<Category> {
    try {
      // First try to find existing user-specific category (case-insensitive)
      const existingCategories = await this.categoryRepo.findByUserId(userId);
      const existingCategory = existingCategories.find(cat => 
        cat.name.toLowerCase() === categoryName.toLowerCase() && 
        cat.type === type
      );
      
      if (existingCategory) {
        logger.debug({ categoryId: existingCategory.categoryId, name: categoryName, type }, 'Found existing user category');
        return existingCategory;
      }

      // If no user-specific category found, check global default categories
      const globalDefaults = await this.categoryRepo.findDefaults();
      const globalCategory = globalDefaults.find(cat => 
        cat.name.toLowerCase() === categoryName.toLowerCase() && 
        cat.type === type
      );
      
      if (globalCategory) {
        logger.debug({ categoryId: globalCategory.categoryId, name: categoryName, type }, 'Found global default category');
        return globalCategory;
      }

      // If no global category found, create a new user-specific category
      const newCategory = await this.categoryRepo.create({
        ownerId: userId,
        name: categoryName,
        type,
        isDefault: false,
        parentCategoryId: null,
        createdAt: new Date(),
      });

      logger.info({ categoryId: newCategory.categoryId, name: categoryName, type }, 'Created new user-specific category');
      return newCategory;
    } catch (error) {
      logger.error({ error, userId, categoryName, type }, 'Failed to find or create category');
      throw new Error('Failed to find or create category');
    }
  }

  private async enrichTransaction(transaction: Transaction): Promise<EnrichedTransaction> {
    try {
      // Get category name
      const category = await this.categoryRepo.findById(transaction.categoryId);
      
      // Parse the stored amounts
      const storedAmount = Number(transaction.amount);
      const storedConvertedAmount = Number(transaction.convertedAmount);
      const storedOriginalAmount = Number(transaction.originalAmount || transaction.amount);
      const conversionRate = Number(transaction.conversionRate);
      
      // Use the stored original currency if available, otherwise use the main currency
      const originalCurrency = transaction.originalCurrency || transaction.currencyCode;
      const convertedCurrency = transaction.currencyCode;
      
      // Use the stored original amount if available, otherwise use the main amount
      const originalAmount = storedOriginalAmount;
      
      // Return enriched transaction with category name and properly formatted data
      return {
        id: transaction.transactionId.toString(),
        date: new Date(transaction.transactionDate),
        amount: storedAmount, // Show the converted amount as the main amount
        currency: convertedCurrency, // Show the converted currency as the main currency
        vendor: transaction.vendor || 'Unknown',
        description: transaction.description || '',
        category: category?.name || 'Unknown',
        type: transaction.type as 'income' | 'expense',
        // Multi-currency fields
        originalAmount: originalAmount,
        originalCurrency: originalCurrency,
        convertedAmount: storedConvertedAmount,
        convertedCurrency: convertedCurrency,
        conversionRate: conversionRate,
        conversionFee: 0, // Default to 0 for now
      };
    } catch (error) {
      logger.error({ error, transactionId: transaction.transactionId }, 'Failed to enrich transaction');
      // Return a fallback enriched transaction if enrichment fails
      return {
        id: transaction.transactionId.toString(),
        date: new Date(transaction.transactionDate),
        amount: Number(transaction.amount),
        currency: transaction.currencyCode,
        vendor: transaction.vendor || 'Unknown',
        description: transaction.description || '',
        category: 'Unknown',
        type: transaction.type as 'income' | 'expense',
        originalAmount: Number(transaction.originalAmount || transaction.amount),
        originalCurrency: transaction.originalCurrency || transaction.currencyCode,
        convertedAmount: Number(transaction.convertedAmount),
        convertedCurrency: transaction.currencyCode,
        conversionRate: Number(transaction.conversionRate),
        conversionFee: 0,
      };
    }
  }
} 