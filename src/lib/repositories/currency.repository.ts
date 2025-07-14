import { eq } from 'drizzle-orm';
import { Database } from '../db/db';
import { currencies, Currency } from '../db/schema';
import { CurrencyRepository } from '../domain/repositories';
import logger from '../utils/logger';

export class DrizzleCurrencyRepository implements CurrencyRepository {
  constructor(private db: Database) {}

  async create(currency: Currency): Promise<Currency> {
    try {
      const [result] = await this.db
        .insert(currencies)
        .values(currency)
        .returning();

      logger.info({ currencyCode: result.currencyCode }, 'Currency created successfully');
      return result;
    } catch (error) {
      logger.error({ error, currency }, 'Failed to create currency');
      throw new Error('Failed to create currency');
    }
  }

  async findAll(): Promise<Currency[]> {
    try {
      const results = await this.db
        .select()
        .from(currencies)
        .orderBy(currencies.currencyCode);

      return results;
    } catch (error) {
      logger.error({ error }, 'Failed to find all currencies');
      return [];
    }
  }

  async findByCode(code: string): Promise<Currency | null> {
    try {
      const [result] = await this.db
        .select()
        .from(currencies)
        .where(eq(currencies.currencyCode, code))
        .limit(1);

      return result || null;
    } catch (error) {
      logger.error({ error, code }, 'Failed to find currency by code');
      return null;
    }
  }

  async update(code: string, updates: Partial<Currency>): Promise<Currency | null> {
    try {
      const [result] = await this.db
        .update(currencies)
        .set(updates)
        .where(eq(currencies.currencyCode, code))
        .returning();

      if (result) {
        logger.info({ currencyCode: code }, 'Currency updated successfully');
      }

      return result || null;
    } catch (error) {
      logger.error({ error, code, updates }, 'Failed to update currency');
      throw new Error('Failed to update currency');
    }
  }

  async delete(code: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(currencies)
        .where(eq(currencies.currencyCode, code))
        .returning();

      const success = result.length > 0;
      if (success) {
        logger.info({ currencyCode: code }, 'Currency deleted successfully');
      }

      return success;
    } catch (error) {
      logger.error({ error, code }, 'Failed to delete currency');
      return false;
    }
  }

  async ensureDefaultCurrencies(): Promise<void> {
    try {
      const defaultCurrencies = [
        { currencyCode: 'USD', currencyName: 'US Dollar', symbol: '$', decimalPlaces: 2 },
        { currencyCode: 'EUR', currencyName: 'Euro', symbol: '€', decimalPlaces: 2 },
        { currencyCode: 'GBP', currencyName: 'British Pound', symbol: '£', decimalPlaces: 2 },
        { currencyCode: 'JPY', currencyName: 'Japanese Yen', symbol: '¥', decimalPlaces: 0 },
        { currencyCode: 'CAD', currencyName: 'Canadian Dollar', symbol: 'C$', decimalPlaces: 2 },
        { currencyCode: 'AUD', currencyName: 'Australian Dollar', symbol: 'A$', decimalPlaces: 2 },
        { currencyCode: 'CHF', currencyName: 'Swiss Franc', symbol: 'CHF', decimalPlaces: 2 },
        { currencyCode: 'CNY', currencyName: 'Chinese Yuan', symbol: '¥', decimalPlaces: 2 },
        { currencyCode: 'SAR', currencyName: 'Saudi Riyal', symbol: 'ر.س', decimalPlaces: 2 },
        { currencyCode: 'AED', currencyName: 'UAE Dirham', symbol: 'د.إ', decimalPlaces: 2 },
      ];

      for (const currency of defaultCurrencies) {
        try {
          // Check if currency already exists
          const existing = await this.findByCode(currency.currencyCode);
          if (!existing) {
            await this.create(currency);
            logger.info({ currencyCode: currency.currencyCode }, 'Default currency created');
          }
        } catch (error) {
          // If currency already exists, that's fine
          logger.debug({ currencyCode: currency.currencyCode }, 'Currency may already exist');
        }
      }

      logger.info('Default currencies ensured');
    } catch (error) {
      logger.error({ error }, 'Failed to ensure default currencies');
      throw new Error('Failed to ensure default currencies');
    }
  }
} 