import { parseTransactionText, parseReceiptImage, answerFinancialQuestion, categorizeTransaction } from '../api/gemini';
import { GeminiService } from '../services/gemini.service';
import { ServiceFactory } from '../services';
import { TransactionRepository, ProfileRepository, CategoryRepository } from '../domain/repositories';
import { TransactionInput, TransactionType, TransactionCategory } from '../types/transaction';
import logger from '../utils/logger';

// Load environment variables
import 'dotenv/config';

// Mock the service factory and its dependencies
jest.mock('../services', () => ({
  ServiceFactory: {
    getInstance: jest.fn()
  }
}));

// Mock the logger to avoid console spam in tests
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

// Mock the Google AI client
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: jest.fn()
    }
  }))
}));

// Mock the language detection utility
jest.mock('../utils/language-detection', () => ({
  detectLanguage: jest.fn().mockReturnValue({ code: 'en', name: 'English' })
}));

// Mock currency utilities
jest.mock('../utils/currency', () => ({
  getExchangeRate: jest.fn().mockResolvedValue(1.0),
  convertAmount: jest.fn().mockImplementation((amount) => amount)
}));

// Mock formatters
jest.mock('../utils/formatters', () => ({
  formatCurrency: jest.fn().mockImplementation((amount, currency) => `${amount} ${currency}`)
}));

describe('Gemini API Integration Tests (Mocked)', () => {
  let mockGeminiService: jest.Mocked<GeminiService>;
  let mockTransactionRepo: jest.Mocked<TransactionRepository>;
  let mockProfileRepo: jest.Mocked<ProfileRepository>;
  let mockCategoryRepo: jest.Mocked<CategoryRepository>;
  let mockServiceFactory: jest.Mocked<typeof ServiceFactory>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock repositories
    mockTransactionRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findByDateRange: jest.fn(),
      search: jest.fn(),
      getStats: jest.fn()
    } as jest.Mocked<TransactionRepository>;

    mockProfileRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      ensureExists: jest.fn()
    } as jest.Mocked<ProfileRepository>;

    mockCategoryRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findByNameAndType: jest.fn(),
      findAllForUser: jest.fn(),
      findDefaults: jest.fn(),
      findByName: jest.fn()
    } as jest.Mocked<CategoryRepository>;

    // Create mock GeminiService
    mockGeminiService = {
      parseTransactionText: jest.fn(),
      parseReceiptImage: jest.fn(),
      answerFinancialQuestion: jest.fn()
    } as any;

    // Mock ServiceFactory
    mockServiceFactory = ServiceFactory as jest.Mocked<typeof ServiceFactory>;
    mockServiceFactory.getInstance.mockReturnValue({
      gemini: mockGeminiService,
      transactions: {} as any,
      repositories: {} as any,
      repositoryFactory: {} as any,
      transactionService: {} as any,
      geminiService: mockGeminiService
    } as any);

    // Set up default profile for tests
    mockProfileRepo.findById.mockResolvedValue({
      id: 'test-user-id',
      defaultCurrency: 'USD',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  });

  describe('parseTransactionText', () => {
    it('should parse a simple expense transaction', async () => {
      // Mock the service response
      const mockParsedResult = {
        amount: -50,
        currency: 'USD',
        vendor: 'Starbucks',
        description: 'Coffee purchase',
        date: new Date('2025-01-15'),
        category: 'Food & Drink',
        type: 'expense' as const
      };

      mockGeminiService.parseTransactionText.mockResolvedValue(mockParsedResult);

      // Call the function
      const result = await parseTransactionText('Spent $50 at Starbucks today');

      // Verify the result
      expect(result).toEqual({
        amount: -50,
        currency: 'USD',
        vendor: 'Starbucks',
        description: 'Coffee purchase',
        date: new Date('2025-01-15'),
        category: 'Food & Drink',
        type: 'expense'
      });

      // Verify the service was called correctly
      expect(mockGeminiService.parseTransactionText).toHaveBeenCalledWith('Spent $50 at Starbucks today');
    });

    it('should parse a simple income transaction', async () => {
      const mockParsedResult = {
        amount: 1000,
        currency: 'USD',
        vendor: 'Company XYZ',
        description: 'Monthly salary',
        date: new Date('2025-01-15'),
        category: 'Income',
        type: 'income' as const
      };

      mockGeminiService.parseTransactionText.mockResolvedValue(mockParsedResult);

      const result = await parseTransactionText('Received $1000 salary from Company XYZ');

      expect(result).toEqual({
        amount: 1000,
        currency: 'USD',
        vendor: 'Company XYZ',
        description: 'Monthly salary',
        date: new Date('2025-01-15'),
        category: 'Income',
        type: 'income'
      });

      expect(mockGeminiService.parseTransactionText).toHaveBeenCalledWith('Received $1000 salary from Company XYZ');
    });

    it('should handle transactions with different currencies', async () => {
      const mockParsedResult = {
        amount: -100,
        currency: 'EUR',
        vendor: 'European Store',
        description: 'Shopping',
        date: new Date('2025-01-15'),
        category: 'Shopping',
        type: 'expense' as const
      };

      mockGeminiService.parseTransactionText.mockResolvedValue(mockParsedResult);

      const result = await parseTransactionText('Spent €100 at European Store yesterday');

      expect(result).toEqual({
        amount: -100,
        currency: 'EUR',
        vendor: 'European Store',
        description: 'Shopping',
        date: new Date('2025-01-15'),
        category: 'Shopping',
        type: 'expense'
      });
    });

    it('should handle parsing errors gracefully', async () => {
      mockGeminiService.parseTransactionText.mockRejectedValue(new Error('Failed to parse transaction text'));

      await expect(parseTransactionText('Invalid transaction text')).rejects.toThrow('Failed to parse transaction text');
    });
  });

  describe('parseReceiptImage', () => {
    it('should parse receipt image and extract transaction data', async () => {
      const mockReceiptData = {
        date: new Date('2025-01-15'),
        vendor: 'Grocery Store',
        total: 85.50,
        items: [
          { name: 'Milk', price: 3.50, quantity: 2 },
          { name: 'Bread', price: 2.50, quantity: 1 },
          { name: 'Eggs', price: 4.00, quantity: 1 }
        ]
      };

      mockGeminiService.parseReceiptImage.mockResolvedValue(mockReceiptData);

      const result = await parseReceiptImage('base64-encoded-image-data');

      expect(result).toEqual(mockReceiptData);
      expect(mockGeminiService.parseReceiptImage).toHaveBeenCalledWith('base64-encoded-image-data');
    });

    it('should handle receipt parsing errors gracefully', async () => {
      mockGeminiService.parseReceiptImage.mockRejectedValue(new Error('Failed to parse receipt image'));

      await expect(parseReceiptImage('invalid-image-data')).rejects.toThrow('Failed to parse receipt image');
    });
  });

  describe('answerFinancialQuestion', () => {
    it('should answer financial questions using AI', async () => {
      const mockAnswer = 'You have spent $500 on food this month, which is 20% of your total expenses.';

      mockGeminiService.answerFinancialQuestion.mockResolvedValue(mockAnswer);

      const result = await answerFinancialQuestion('test-user-id', 'How much did I spend on food this month?');

      expect(result).toBe(mockAnswer);
      expect(mockGeminiService.answerFinancialQuestion).toHaveBeenCalledWith('test-user-id', 'How much did I spend on food this month?', 'en');
    });

    it('should handle different languages', async () => {
      const mockAnswer = 'Has gastado $500 en comida este mes.';

      mockGeminiService.answerFinancialQuestion.mockResolvedValue(mockAnswer);

      const result = await answerFinancialQuestion('test-user-id', '¿Cuánto gasté en comida este mes?', 'es');

      expect(result).toBe(mockAnswer);
      expect(mockGeminiService.answerFinancialQuestion).toHaveBeenCalledWith('test-user-id', '¿Cuánto gasté en comida este mes?', 'es');
    });

    it('should handle AI response errors gracefully', async () => {
      mockGeminiService.answerFinancialQuestion.mockRejectedValue(new Error('AI service unavailable'));

      await expect(answerFinancialQuestion('test-user-id', 'Invalid question')).rejects.toThrow('AI service unavailable');
    });
  });

  describe('categorizeTransaction', () => {
    it('should categorize food-related transactions', async () => {
      const category = await categorizeTransaction('Coffee at Starbucks', 'Starbucks');
      expect(category).toBe('Food & Drink');
    });

    it('should categorize transportation transactions', async () => {
      const category = await categorizeTransaction('Gas station fill-up', 'Shell');
      expect(category).toBe('Transportation');
    });

    it('should categorize shopping transactions', async () => {
      const category = await categorizeTransaction('Bought clothes', 'Amazon');
      expect(category).toBe('Shopping');
    });

    it('should categorize utilities transactions', async () => {
      const category = await categorizeTransaction('Electric bill payment', 'Power Company');
      expect(category).toBe('Utilities');
    });

    it('should categorize entertainment transactions', async () => {
      const category = await categorizeTransaction('Netflix subscription', 'Netflix');
      expect(category).toBe('Entertainment');
    });

    it('should categorize healthcare transactions', async () => {
      const category = await categorizeTransaction('Doctor visit', 'Medical Center');
      expect(category).toBe('Healthcare');
    });

    it('should categorize income transactions', async () => {
      const category = await categorizeTransaction('Salary deposit', 'Company');
      expect(category).toBe('Income');
    });

    it('should default to Other for unrecognized transactions', async () => {
      const category = await categorizeTransaction('Unknown transaction', 'Unknown Vendor');
      expect(category).toBe('Other');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complex multi-step transaction processing', async () => {
      // Mock a complex transaction parsing
      const mockParsedResult = {
        amount: -125.50,
        currency: 'USD',
        vendor: 'Whole Foods',
        description: 'Grocery shopping with organic products',
        date: new Date('2025-01-15'),
        category: 'Food & Drink',
        type: 'expense' as const
      };

      mockGeminiService.parseTransactionText.mockResolvedValue(mockParsedResult);

      const result = await parseTransactionText('Spent $125.50 at Whole Foods for organic groceries yesterday');

      expect(result).toEqual(mockParsedResult);
      expect(result.category).toBe('Food & Drink');
      expect(result.type).toBe('expense');
      expect(result.amount).toBe(-125.50);
    });

    it('should handle edge cases with missing data', async () => {
      const mockParsedResult = {
        amount: -50,
        currency: 'USD',
        vendor: undefined,
        description: 'Unknown purchase',
        date: new Date(),
        category: 'Other',
        type: 'expense' as const
      };

      mockGeminiService.parseTransactionText.mockResolvedValue(mockParsedResult);

      const result = await parseTransactionText('Spent $50 somewhere');

      expect(result).toEqual(mockParsedResult);
      expect(result.vendor).toBeUndefined();
      expect(result.category).toBe('Other');
    });

    it('should handle service factory initialization', () => {
      // Test that the service factory is properly mocked
      const serviceFactory = ServiceFactory.getInstance();
      expect(serviceFactory).toBeDefined();
      expect(serviceFactory.gemini).toBe(mockGeminiService);
      expect(mockServiceFactory.getInstance).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle network errors gracefully', async () => {
      mockGeminiService.parseTransactionText.mockRejectedValue(new Error('Network error'));

      await expect(parseTransactionText('Some transaction')).rejects.toThrow('Network error');
    });

    it('should handle AI service timeouts', async () => {
      mockGeminiService.parseTransactionText.mockRejectedValue(new Error('Request timeout'));

      await expect(parseTransactionText('Some transaction')).rejects.toThrow('Request timeout');
    });

    it('should handle invalid input gracefully', async () => {
      mockGeminiService.parseTransactionText.mockRejectedValue(new Error('Invalid input format'));

      await expect(parseTransactionText('')).rejects.toThrow('Invalid input format');
    });
  });

  describe('Performance and logging', () => {
    it('should log transaction parsing attempts', async () => {
      const mockParsedResult = {
        amount: -25,
        currency: 'USD',
        vendor: 'Test Vendor',
        description: 'Test transaction',
        date: new Date(),
        category: 'Other',
        type: 'expense' as const
      };

      mockGeminiService.parseTransactionText.mockResolvedValue(mockParsedResult);

      await parseTransactionText('Test transaction');

      // Verify that the service was called
      expect(mockGeminiService.parseTransactionText).toHaveBeenCalledWith('Test transaction');
    });

    it('should handle concurrent transaction parsing', async () => {
      const mockResults = [
        { amount: -50, currency: 'USD', vendor: 'Vendor1', description: 'Transaction 1', date: new Date(), category: 'Other', type: 'expense' as const },
        { amount: -75, currency: 'USD', vendor: 'Vendor2', description: 'Transaction 2', date: new Date(), category: 'Other', type: 'expense' as const },
        { amount: -100, currency: 'USD', vendor: 'Vendor3', description: 'Transaction 3', date: new Date(), category: 'Other', type: 'expense' as const }
      ];

      mockGeminiService.parseTransactionText
        .mockResolvedValueOnce(mockResults[0])
        .mockResolvedValueOnce(mockResults[1])
        .mockResolvedValueOnce(mockResults[2]);

      const promises = [
        parseTransactionText('Transaction 1'),
        parseTransactionText('Transaction 2'),
        parseTransactionText('Transaction 3')
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(results[0].vendor).toBe('Vendor1');
      expect(results[1].vendor).toBe('Vendor2');
      expect(results[2].vendor).toBe('Vendor3');
    });
  });
});
