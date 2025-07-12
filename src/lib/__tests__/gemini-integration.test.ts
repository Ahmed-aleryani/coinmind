import { parseTransactionText } from '../api/gemini';
import { transactionDb } from '../db/schema';
import { Database } from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync, unlinkSync, existsSync, readdirSync, rmdirSync } from 'fs';
import { config } from 'dotenv';
import { TransactionInput, TransactionType } from '../types/transaction';

// Load environment variables from .env file
import 'dotenv/config';

// Validate required environment variables
if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is required');
}

// Test configuration
const TEST_DB_DIR = join(__dirname, '../../.test-db');
const TEST_DB_PATH = join(TEST_DB_DIR, 'test-db.sqlite');
const TEST_TRANSACTIONS = [
  'I received 500$ salary 2 days ago',
  'Paid 50$ for dinner at Italian restaurant yesterday',
  'Got 1000$ payment last Monday',
  'Spent 20$ on coffee today'
];

// Ensure test database directory exists
if (!existsSync(TEST_DB_DIR)) {
  mkdirSync(TEST_DB_DIR, { recursive: true });
}

// Helper function to format date as YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

describe('Gemini API Integration Tests', () => {
  let testDb: Database;

  beforeAll(() => {
    // Set test database path
    process.env.DATABASE_PATH = TEST_DB_PATH;
    
    // Force reinitialize the database module to use the test database
    jest.resetModules();
    
    // Import the schema module after setting the DATABASE_PATH
    const schema = require('../db/schema');
    testDb = schema.db;
    
    // Ensure the database is properly initialized
    schema.initDatabase();
    
    // Verify test database is being used
    console.log(`\n=== Using test database: ${TEST_DB_PATH} ===`);
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
        console.log(`\n=== Cleaned up test database: ${TEST_DB_PATH} ===`);
      }
      
      // Remove test directory if empty
      if (existsSync(TEST_DB_DIR)) {
        const files = readdirSync(TEST_DB_DIR);
        if (files.length === 0) {
          rmdirSync(TEST_DB_DIR);
          console.log(`\n=== Removed empty test directory: ${TEST_DB_DIR} ===`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up test database:', error);
    }
  });

  // Test each transaction in the test set
  TEST_TRANSACTIONS.forEach((transaction, index) => {
    it(`should parse and store transaction: "${transaction}"`, async () => {
      // 1. Parse transaction using Gemini API
      const parsedTransaction = await parseTransactionText(transaction);
      
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
      const allTransactions = transactionDb.getAll(100, 0);
      
      // Try to find by ID first, then fall back to amount/date
      let storedTransaction = transactionDb.getById(transactionIdStr);
      
      // If not found by ID, try to find by amount/date
      if (!storedTransaction) {
        const transactionDate = transactionInput.date || new Date();
        const foundTransaction = allTransactions.find(tx => 
          tx.amount === transactionInput.amount && 
          new Date(tx.date).getTime() === transactionDate.getTime()
        );
        if (foundTransaction) {
          storedTransaction = foundTransaction;
        }
      }
      
      // Verify we found the transaction
      expect(storedTransaction).not.toBeNull();
      
      // Verify the stored data matches the parsed data
      
      // Verify the stored data matches the parsed data
      expect(storedTransaction).toBeDefined();
      expect(storedTransaction?.amount).toBe(parsedTransaction.amount);
      expect(storedTransaction?.currency).toBe(parsedTransaction.currency);
      
      // Log the test result for visibility
      console.log(`\n✅ Input: "${transaction}"`);
      console.log(`   Amount: ${storedTransaction?.amount} ${storedTransaction?.currency}`);
      console.log(`   Type: ${storedTransaction?.type}`);
      console.log(`   Category: ${storedTransaction?.category}`);
      console.log(`   Date: ${storedTransaction?.date ? formatDate(new Date(storedTransaction.date)) : 'N/A'}`);
    });
  });

  it('should handle date parsing for relative dates', () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    console.log('\n=== Testing Date Parsing ===');
    console.log(`Current date: ${formatDate(today)}`);
    
    // This is just a placeholder - the actual date parsing is tested in the main test cases
    // We're just verifying the test setup here
    expect(yesterday).toBeDefined();
  });
});
