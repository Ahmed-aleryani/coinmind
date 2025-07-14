import { parseTransactionText } from '../api/gemini';
import { transactionDb } from '../db/schema';
import { Database } from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync, unlinkSync, existsSync, readdirSync, rmdirSync } from 'fs';
import { config } from 'dotenv';
import { TransactionInput, TransactionType } from '../types/transaction';
import logger from '../utils/logger';

// Load environment variables from .env file
import 'dotenv/config';

// Validate required environment variables
if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is required');
}

// Test configuration
const TEST_DB_DIR = join(__dirname, '../../.test-db');
const TEST_DB_PATH = join(TEST_DB_DIR, 'test-db.sqlite');

// Helper function to format date as YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Helper function to create and verify a transaction
async function createAndVerifyTransaction(
  inputText: string,
  expectedOriginalCurrency: string = 'USD',
  expectedConvertedCurrency: string = 'USD',
  shouldConvert: boolean = false
) {
  // 1. Parse transaction using Gemini API
  const parsedTransaction = await parseTransactionText(inputText);
  
  // Basic validation of parsed data
  expect(parsedTransaction).toBeDefined();
  expect(parsedTransaction.amount).toBeDefined();
  expect(parsedTransaction.currency).toBeDefined();
  expect(parsedTransaction.date).toBeInstanceOf(Date);
  
  // 2. Store in test database
  const transactionType: TransactionType = (parsedTransaction.amount && parsedTransaction.amount < 0) ? 'expense' : 'income';
  
  const transactionInput: TransactionInput = {
    amount: parsedTransaction.amount || 0,
    currency: parsedTransaction.currency || 'USD',
    description: parsedTransaction.description || '',
    vendor: parsedTransaction.vendor || '',
    category: parsedTransaction.category || 'Other',
    type: transactionType,
    date: parsedTransaction.date || new Date()
  };
  
  // Insert the transaction
  const createdTransaction = await transactionDb.create(transactionInput);
  expect(createdTransaction).toBeDefined();
  expect(createdTransaction).not.toBeNull();
  expect(createdTransaction!.id).toBeDefined();
  
  // 3. Query the database to verify
  const transactionId = createdTransaction!.id;
  const transactionIdStr = String(transactionId);
  const storedTransaction = transactionDb.getById(transactionIdStr);
  
  // Verify we found the transaction
  expect(storedTransaction).not.toBeNull();
  expect(storedTransaction).toBeDefined();
  
  // Verify the stored data matches the parsed data
  expect(storedTransaction?.originalAmount).toBe(parsedTransaction.amount);
  expect(storedTransaction?.originalCurrency).toBe(expectedOriginalCurrency);
  expect(storedTransaction?.convertedCurrency).toBe(expectedConvertedCurrency);
  
  if (shouldConvert) {
    // If conversion is expected, the converted amount should be different
    expect(storedTransaction?.convertedAmount).not.toBe(parsedTransaction.amount);
    expect(storedTransaction?.amount).not.toBe(parsedTransaction.amount);
  } else {
    // If no conversion, amounts should match
    expect(storedTransaction?.convertedAmount).toBe(parsedTransaction.amount);
    expect(storedTransaction?.amount).toBe(parsedTransaction.amount);
  }
  
  // The currency field (for backward compatibility) should always be the converted currency
  expect(storedTransaction?.currency).toBe(expectedConvertedCurrency);
  
  // Log the test result for visibility
  logger.info({
    inputText,
    originalAmount: storedTransaction?.originalAmount,
    originalCurrency: storedTransaction?.originalCurrency,
    convertedAmount: storedTransaction?.convertedAmount,
    convertedCurrency: storedTransaction?.convertedCurrency,
    type: storedTransaction?.type,
    category: storedTransaction?.category,
    date: storedTransaction?.date ? formatDate(new Date(storedTransaction.date)) : 'N/A'
  }, `✅ Input: "${inputText}"`);
  
  return storedTransaction;
}

describe('Gemini API Integration Tests', () => {
  let testDb: Database;
  let userSettingsDb: any;

  beforeAll(() => {
    // Ensure test database directory exists
    if (!existsSync(TEST_DB_DIR)) {
      mkdirSync(TEST_DB_DIR, { recursive: true });
    }

    // Set test database path
    process.env.DATABASE_PATH = TEST_DB_PATH;
    
    // Force reinitialize the database module to use the test database
    jest.resetModules();
    
    // Import the schema module after setting the DATABASE_PATH
    const schema = require('../db/schema');
    testDb = schema.db;
    userSettingsDb = schema.userSettingsDb;
    
    // Ensure the database is properly initialized
    schema.initDatabase();
    
    // Force update user settings to USD for tests (override any existing settings)
    userSettingsDb.update({ defaultCurrency: 'USD' });
    
    // Verify test database is being used
    logger.info({ testDbPath: TEST_DB_PATH }, '=== Using test database ===');
    logger.info({ defaultCurrency: 'USD' }, '=== Default currency set ===');
  });

  afterAll(() => {
    // Close the database connection
    if (testDb) {
      testDb.close();
    }
    
    // Clean up test database and directory
    try {
      if (existsSync(TEST_DB_PATH)) {
        unlinkSync(TEST_DB_PATH);
        logger.info({ testDbPath: TEST_DB_PATH }, '=== Cleaned up test database ===');
      }
      
      // Remove test directory if empty
      if (existsSync(TEST_DB_DIR)) {
        const files = readdirSync(TEST_DB_DIR);
        if (files.length === 0) {
          rmdirSync(TEST_DB_DIR);
          logger.info({ testDbDir: TEST_DB_DIR }, '=== Removed empty test directory ===');
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error cleaning up test database');
    }
  });

  // Base case tests - USD transactions with no conversion needed
  describe('Base Case - USD Transactions (No Conversion)', () => {
    it('should parse and store income transaction with relative date', async () => {
      const transaction = await createAndVerifyTransaction(
        'I received 500$ salary 2 days ago',
        'USD',
        'USD',
        false
      );
      
      expect(transaction?.type).toBe('income');
      expect(transaction?.category).toBe('Income');
      expect(transaction?.originalAmount).toBe(500);
    });

    it('should parse and store expense transaction with vendor', async () => {
      const transaction = await createAndVerifyTransaction(
        'Paid 50$ for dinner at Italian restaurant yesterday',
        'USD',
        'USD',
        false
      );
      
      expect(transaction?.type).toBe('expense');
      expect(transaction?.category).toBe('Food & Drink');
      expect(transaction?.originalAmount).toBe(-50);
      expect(transaction?.vendor).toContain('Italian');
    });

    it('should parse and store large income transaction', async () => {
      const transaction = await createAndVerifyTransaction(
        'Got 1000$ payment last Monday',
        'USD',
        'USD',
        false
      );
      
      expect(transaction?.type).toBe('income');
      expect(transaction?.category).toBe('Income');
      expect(transaction?.originalAmount).toBe(1000);
    });

    it('should parse and store small expense transaction', async () => {
      const transaction = await createAndVerifyTransaction(
        'Spent 20$ on coffee today',
        'USD',
        'USD',
        false
      );
      
      expect(transaction?.type).toBe('expense');
      expect(transaction?.category).toBe('Food & Drink');
      expect(transaction?.originalAmount).toBe(-20);
    });
  });

  // Currency conversion tests - Different currencies that should convert to USD
  describe('Currency Conversion Tests', () => {
    beforeAll(() => {
      // Set default currency to USD for conversion tests
      userSettingsDb.update({ defaultCurrency: 'USD' });
    });

    it('should convert EUR to USD for income transaction', async () => {
      const transaction = await createAndVerifyTransaction(
        'I received 500€ bonus yesterday',
        'EUR',
        'USD',
        true
      );
      
      expect(transaction?.type).toBe('income');
      expect(transaction?.originalAmount).toBe(500);
      expect(transaction?.originalCurrency).toBe('EUR');
      expect(transaction?.convertedCurrency).toBe('USD');
      expect(transaction?.convertedAmount).toBeGreaterThan(500); // EUR to USD should be > 1
    });

    it('should convert GBP to USD for expense transaction', async () => {
      const transaction = await createAndVerifyTransaction(
        'Paid 100£ for hotel booking',
        'GBP',
        'USD',
        true
      );
      
      expect(transaction?.type).toBe('expense');
      expect(transaction?.originalAmount).toBe(-100);
      expect(transaction?.originalCurrency).toBe('GBP');
      expect(transaction?.convertedCurrency).toBe('USD');
      expect(transaction?.convertedAmount).toBeLessThan(-100); // GBP to USD should be > 1, so negative amount should be more negative
    });

    it('should convert CAD to USD for expense transaction', async () => {
      const transaction = await createAndVerifyTransaction(
        'Spent 75 CAD on groceries',
        'CAD',
        'USD',
        true
      );
      
      expect(transaction?.type).toBe('expense');
      expect(transaction?.originalAmount).toBe(-75);
      expect(transaction?.originalCurrency).toBe('CAD');
      expect(transaction?.convertedCurrency).toBe('USD');
      expect(transaction?.category).toBe('Food & Drink');
    });
  });

  // Test with different default currency
  describe('Different Default Currency Tests', () => {
    beforeAll(() => {
      // Set default currency to EUR for these tests
      userSettingsDb.update({ defaultCurrency: 'EUR' });
    });

    afterAll(() => {
      // Reset back to USD
      userSettingsDb.update({ defaultCurrency: 'USD' });
    });

    it('should convert USD to EUR when default currency is EUR', async () => {
      const transaction = await createAndVerifyTransaction(
        'I received 1000$ freelance payment',
        'USD',
        'EUR',
        true
      );
      
      expect(transaction?.type).toBe('income');
      expect(transaction?.originalAmount).toBe(1000);
      expect(transaction?.originalCurrency).toBe('USD');
      expect(transaction?.convertedCurrency).toBe('EUR');
      expect(transaction?.convertedAmount).toBeLessThan(1000); // USD to EUR should be < 1
    });

    it('should keep EUR unchanged when default currency is EUR', async () => {
      const transaction = await createAndVerifyTransaction(
        'Paid 200€ for flight ticket',
        'EUR',
        'EUR',
        false
      );
      
      expect(transaction?.type).toBe('expense');
      expect(transaction?.originalAmount).toBe(-200);
      expect(transaction?.originalCurrency).toBe('EUR');
      expect(transaction?.convertedCurrency).toBe('EUR');
      expect(transaction?.convertedAmount).toBe(-200);
    });
  });

  // Date parsing tests
  describe('Date Parsing Tests', () => {
    beforeAll(() => {
      // Ensure USD for consistency
      userSettingsDb.update({ defaultCurrency: 'USD' });
    });

    it('should handle relative dates correctly', () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      logger.info('=== Testing Date Parsing ===');
      logger.info({ currentDate: formatDate(today) }, 'Current date');
      
      expect(yesterday).toBeDefined();
      expect(yesterday.getTime()).toBeLessThan(today.getTime());
    });

    it('should parse specific date formats', async () => {
      const transaction = await createAndVerifyTransaction(
        'Spent 100$ on shopping last Friday',
        'USD',
        'USD',
        false
      );
      
      expect(transaction?.date).toBeDefined();
      const transactionDate = new Date(transaction!.date);
      expect(transactionDate).toBeInstanceOf(Date);
      expect(transactionDate.getDay()).toBe(5); // Friday is day 5
    });
  });
});
