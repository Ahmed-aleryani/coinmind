import { transactionDb, userSettingsDb, initDatabase } from './schema.sqlite';
import logger from '../utils/logger';

interface MigrationResult {
  success: boolean;
  migratedCount: number;
  errorCount: number;
  errors: string[];
  rollbackData?: any[];
}

/**
 * Migration script to convert existing transactions to multi-currency format
 */
export async function migrateToMultiCurrency(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    migratedCount: 0,
    errorCount: 0,
    errors: []
  };

  try {
    logger.info('Starting multi-currency migration...');
    initDatabase();

    // Get all existing transactions
    const existingTransactions = transactionDb.getAll();
    logger.info({ count: existingTransactions.length }, 'Found existing transactions');

    // Backup original data for rollback
    const rollbackData = existingTransactions.map(t => ({ ...t }));

    // Get user's default currency
    const userSettings = userSettingsDb.get() || { defaultCurrency: 'USD' };
    const defaultCurrency = userSettings.defaultCurrency || 'USD';

    let migratedCount = 0;
    let errorCount = 0;

    for (const transaction of existingTransactions) {
      try {
        // Skip if already migrated
        if (transaction.originalAmount !== undefined && transaction.convertedAmount !== undefined) {
          logger.debug({ id: transaction.id }, 'Transaction already migrated, skipping');
          continue;
        }

        // Convert legacy transaction to new format
        const migratedTransaction = {
          ...transaction,
          // Set original values (legacy data)
          originalAmount: transaction.amount,
          originalCurrency: transaction.currency || defaultCurrency,
          // Set converted values (same as original for existing data)
          convertedAmount: transaction.amount,
          convertedCurrency: defaultCurrency,
          // Set conversion details
          conversionRate: 1,
          conversionFee: 0
        };

        // Update the transaction in the database
        transactionDb.update(transaction.id, migratedTransaction);
        migratedCount++;

        logger.debug({ 
          id: transaction.id, 
          originalAmount: migratedTransaction.originalAmount,
          convertedAmount: migratedTransaction.convertedAmount 
        }, 'Transaction migrated successfully');

      } catch (error) {
        errorCount++;
        const errorMsg = `Failed to migrate transaction ${transaction.id}: ${error instanceof Error ? error.message : error}`;
        result.errors.push(errorMsg);
        logger.error({ id: transaction.id, error }, 'Migration error for transaction');
      }
    }

    result.success = errorCount === 0;
    result.migratedCount = migratedCount;
    result.errorCount = errorCount;
    result.rollbackData = rollbackData;

    logger.info({ 
      migratedCount, 
      errorCount, 
      success: result.success 
    }, 'Migration completed');

    return result;

  } catch (error) {
    const errorMsg = `Migration failed: ${error instanceof Error ? error.message : error}`;
    result.errors.push(errorMsg);
    logger.error({ error }, 'Migration failed');
    return result;
  }
}

/**
 * Rollback migration to original format
 */
export async function rollbackMigration(rollbackData: any[]): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    migratedCount: 0,
    errorCount: 0,
    errors: []
  };

  try {
    logger.info('Starting migration rollback...');
    initDatabase();

    let rollbackCount = 0;
    let errorCount = 0;

    for (const originalTransaction of rollbackData) {
      try {
        // Restore original transaction data
        const restoredTransaction = {
          id: originalTransaction.id,
          date: originalTransaction.date,
          amount: originalTransaction.amount,
          currency: originalTransaction.currency,
          vendor: originalTransaction.vendor,
          description: originalTransaction.description,
          category: originalTransaction.category,
          type: originalTransaction.type,
          receiptUrl: originalTransaction.receiptUrl,
          createdAt: originalTransaction.createdAt,
          updatedAt: new Date()
        };

        transactionDb.update(originalTransaction.id, restoredTransaction);
        rollbackCount++;

        logger.debug({ id: originalTransaction.id }, 'Transaction rolled back successfully');

      } catch (error) {
        errorCount++;
        const errorMsg = `Failed to rollback transaction ${originalTransaction.id}: ${error instanceof Error ? error.message : error}`;
        result.errors.push(errorMsg);
        logger.error({ id: originalTransaction.id, error }, 'Rollback error for transaction');
      }
    }

    result.success = errorCount === 0;
    result.migratedCount = rollbackCount;
    result.errorCount = errorCount;

    logger.info({ 
      rollbackCount, 
      errorCount, 
      success: result.success 
    }, 'Rollback completed');

    return result;

  } catch (error) {
    const errorMsg = `Rollback failed: ${error instanceof Error ? error.message : error}`;
    result.errors.push(errorMsg);
    logger.error({ error }, 'Rollback failed');
    return result;
  }
}

/**
 * Check migration status
 */
export function getMigrationStatus(): {
  needsMigration: boolean;
  totalTransactions: number;
  migratedTransactions: number;
  legacyTransactions: number;
} {
  try {
    initDatabase();
    const transactions = transactionDb.getAll();
    
    const migratedTransactions = transactions.filter(t => 
      t.originalAmount !== undefined && t.convertedAmount !== undefined
    ).length;
    
    const legacyTransactions = transactions.filter(t => 
      t.originalAmount === undefined || t.convertedAmount === undefined
    ).length;

    return {
      needsMigration: legacyTransactions > 0,
      totalTransactions: transactions.length,
      migratedTransactions,
      legacyTransactions
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get migration status');
    return {
      needsMigration: false,
      totalTransactions: 0,
      migratedTransactions: 0,
      legacyTransactions: 0
    };
  }
} 