import { eq, and, gte, lte, desc, like, sql, count } from 'drizzle-orm';
import { Database } from '../db/db';
import { transactions, categories, profiles, Transaction, NewTransaction } from '../db/schema';
import { TransactionRepository, TransactionStats } from '../domain/repositories';
import logger from '../utils/logger';

export class DrizzleTransactionRepository implements TransactionRepository {
  constructor(private db: Database) {}

  async create(transaction: NewTransaction): Promise<Transaction> {
    try {
      const [result] = await this.db
        .insert(transactions)
        .values(transaction)
        .returning();

      logger.info({ transactionId: result.transactionId }, 'Transaction created successfully');
      return result;
    } catch (error) {
      logger.error({ error, transaction }, 'Failed to create transaction');
      throw new Error('Failed to create transaction');
    }
  }

  async findById(id: number): Promise<Transaction | null> {
    try {
      const [result] = await this.db
        .select()
        .from(transactions)
        .where(eq(transactions.transactionId, id))
        .limit(1);

      return result || null;
    } catch (error) {
      logger.error({ error, id }, 'Failed to find transaction by ID');
      return null;
    }
  }

  async findByUserId(userId: string, limit = 100, offset = 0): Promise<Transaction[]> {
    try {
      const results = await this.db
        .select()
        .from(transactions)
        .where(eq(transactions.ownerId, userId))
        .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
        .limit(limit)
        .offset(offset);

      return results;
    } catch (error) {
      logger.error({ error, userId, limit, offset }, 'Failed to find transactions by user ID');
      return [];
    }
  }

  async update(id: number, updates: Partial<NewTransaction>): Promise<Transaction | null> {
    try {
      const [result] = await this.db
        .update(transactions)
        .set(updates)
        .where(eq(transactions.transactionId, id))
        .returning();

      if (result) {
        logger.info({ transactionId: id }, 'Transaction updated successfully');
      }

      return result || null;
    } catch (error) {
      logger.error({ error, id, updates }, 'Failed to update transaction');
      throw new Error('Failed to update transaction');
    }
  }

  async delete(id: number): Promise<boolean> {
    try {
      const result = await this.db
        .delete(transactions)
        .where(eq(transactions.transactionId, id))
        .returning();

      const success = result.length > 0;
      if (success) {
        logger.info({ transactionId: id }, 'Transaction deleted successfully');
      }

      return success;
    } catch (error) {
      logger.error({ error, id }, 'Failed to delete transaction');
      return false;
    }
  }

  async findByDateRange(userId: string, startDate: Date, endDate: Date): Promise<Transaction[]> {
    try {
      const results = await this.db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.ownerId, userId),
            gte(transactions.transactionDate, startDate.toISOString().split('T')[0]),
            lte(transactions.transactionDate, endDate.toISOString().split('T')[0])
          )
        )
        .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt));

      return results;
    } catch (error) {
      logger.error({ error, userId, startDate, endDate }, 'Failed to find transactions by date range');
      return [];
    }
  }

  async search(userId: string, query: string, limit = 50): Promise<Transaction[]> {
    try {
      const searchTerm = `%${query}%`;
      const results = await this.db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.ownerId, userId),
            like(transactions.description, searchTerm)
          )
        )
        .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
        .limit(limit);

      return results;
    } catch (error) {
      logger.error({ error, userId, query, limit }, 'Failed to search transactions');
      return [];
    }
  }

  async getStats(userId: string, startDate?: Date, endDate?: Date): Promise<TransactionStats> {
    try {
      // Get user's default currency
      const [userProfile] = await this.db
        .select()
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1);

      const defaultCurrency = userProfile?.defaultCurrency || 'USD';

      // Build date filter condition
      const dateConditions = [eq(transactions.ownerId, userId)];
      if (startDate) {
        dateConditions.push(gte(transactions.transactionDate, startDate.toISOString().split('T')[0]));
      }
      if (endDate) {
        dateConditions.push(lte(transactions.transactionDate, endDate.toISOString().split('T')[0]));
      }

      // Get all transactions for the period
      const allTransactions = await this.db
        .select({
          amount: transactions.convertedAmount,
          categoryName: categories.name,
          transactionType: categories.type,
        })
        .from(transactions)
        .innerJoin(categories, eq(transactions.categoryId, categories.categoryId))
        .where(and(...dateConditions));

      // Calculate stats
      let totalIncome = 0;
      let totalExpenses = 0;
      let transactionCount = 0;
      const categoryStats: Record<string, { amount: number; count: number }> = {};

      for (const transaction of allTransactions) {
        const amount = Number(transaction.amount);
        transactionCount++;

        if (transaction.transactionType === 'income') {
          totalIncome += amount;
        } else {
          totalExpenses += amount;
        }

        // Track category stats
        const categoryName = transaction.categoryName;
        if (!categoryStats[categoryName]) {
          categoryStats[categoryName] = { amount: 0, count: 0 };
        }
        categoryStats[categoryName].amount += amount;
        categoryStats[categoryName].count++;
      }

      const topCategories = Object.entries(categoryStats)
        .map(([category, stats]) => ({ category, amount: stats.amount, count: stats.count }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);

      return {
        totalIncome,
        totalExpenses,
        netAmount: totalIncome - totalExpenses,
        transactionCount,
        averageTransaction: transactionCount > 0 ? (totalIncome + totalExpenses) / transactionCount : 0,
        defaultCurrency,
        topCategories,
      };
    } catch (error) {
      logger.error({ error, userId, startDate, endDate }, 'Failed to get transaction stats');
      throw new Error('Failed to get transaction stats');
    }
  }
} 