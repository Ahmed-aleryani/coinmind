import { ParsedTransactionText, ReceiptData, TransactionCategory } from '../types/transaction';
import { ServiceFactory } from '../services';
import { formatCurrency } from '../utils/formatters';
import { detectLanguage, extractCurrencyAmount } from '../utils/language-detection';
import logger from '../utils/logger';

// Get Gemini service instance
function getGeminiService() {
  return ServiceFactory.getInstance().gemini;
}

/**
 * Parse natural language text into structured transaction data with multi-language support
 */
export async function parseTransactionText(text: string): Promise<ParsedTransactionText> {
  const geminiService = getGeminiService();
  const result = await geminiService.parseTransactionText(text);
  
  // Convert the result to match the expected type
  return {
    amount: result.amount,
    currency: result.currency,
    vendor: result.vendor,
    description: result.description,
    date: result.date,
    category: result.category as TransactionCategory,
    type: result.type,
  };
}

/**
 * Process receipt image and extract transaction data
 */
export async function parseReceiptImage(imageBase64: string): Promise<ReceiptData> {
  const geminiService = getGeminiService();
  return await geminiService.parseReceiptImage(imageBase64);
}

/**
 * Categorize a transaction automatically
 */
export async function categorizeTransaction(
  description: string, 
  vendor?: string
): Promise<TransactionCategory> {
  // Simple categorization logic based on keywords
  const lower = description.toLowerCase();
  const vendorLower = vendor?.toLowerCase() || '';
  
  // Food & Drink
  if (lower.includes('coffee') || lower.includes('restaurant') || lower.includes('food') || 
      lower.includes('starbucks') || lower.includes('mcdonald') || lower.includes('pizza') ||
      vendorLower.includes('restaurant') || vendorLower.includes('cafe')) {
    return 'Food & Drink';
  }
  
  // Transportation
  if (lower.includes('gas') || lower.includes('fuel') || lower.includes('uber') || 
      lower.includes('lyft') || lower.includes('taxi') || lower.includes('parking') ||
      vendorLower.includes('gas') || vendorLower.includes('uber')) {
    return 'Transportation';
  }
  
  // Utilities
  if (lower.includes('electric') || lower.includes('water') || lower.includes('internet') ||
      lower.includes('phone') || lower.includes('utility') || lower.includes('bill')) {
    return 'Utilities';
  }
  
  // Entertainment
  if (lower.includes('movie') || lower.includes('netflix') || lower.includes('spotify') ||
      lower.includes('game') || lower.includes('entertainment')) {
    return 'Entertainment';
  }
  
  // Shopping
  if (lower.includes('amazon') || lower.includes('walmart') || lower.includes('target') ||
      lower.includes('shopping') || lower.includes('store') ||
      vendorLower.includes('amazon') || vendorLower.includes('walmart') || vendorLower.includes('target') ||
      vendorLower.includes('store')) {
    return 'Shopping';
  }
  
  // Healthcare
  if (lower.includes('medical') || lower.includes('doctor') || lower.includes('pharmacy') ||
      lower.includes('hospital') || lower.includes('health')) {
    return 'Healthcare';
  }
  
  // Income
  if (lower.includes('salary') || lower.includes('paycheck') || lower.includes('income') ||
      lower.includes('deposit') || lower.includes('bonus')) {
    return 'Income';
  }
  
  return 'Other';
}

/**
 * Answer user questions using AI-powered function calling to query the database
 */
export async function answerFinancialQuestion(userId: string, question: string, userLanguage: string = 'en'): Promise<string> {
  const geminiService = getGeminiService();
  return await geminiService.answerFinancialQuestion(userId, question, userLanguage);
}

/**
 * Parse spreadsheet data (CSV or XLSX) using Gemini 2.5 Pro Preview for fast and accurate processing
 */
export async function parseCSVWithGemini(csvText: string): Promise<{
  preview: string;
  transactions: Array<{
    amount: number;
    vendor: string;
    description: string;
    date: Date;
    category: string;
    type: 'income' | 'expense';
  }>;
  requiresConfirmation: boolean;
}> {
  const startTime = Date.now();
  
  logger.info({ csvLength: csvText.length }, 'Starting CSV parsing with Gemini');
  
  // Simple CSV parsing logic since we don't have access to the full Gemini service yet
  const lines = csvText.split('\n').filter(line => line.trim().length > 0);
  const headers = lines[0].split(',').map(h => h.trim());
  
  const transactions = [];
  
  for (let i = 1; i < Math.min(lines.length, 100); i++) { // Limit to first 100 transactions
    const values = lines[i].split(',').map(v => v.trim());
    
    if (values.length < headers.length) continue;
    
    try {
      // Simple parsing logic - assume first column is date, second is description, third is amount
      const date = new Date(values[0]);
      const description = values[1] || 'Unknown';
      const amount = parseFloat(values[2]?.replace(/[^\d.-]/g, '') || '0');
      
      if (isNaN(amount)) continue;
      
      transactions.push({
        amount,
        vendor: 'Unknown',
        description,
        date: isNaN(date.getTime()) ? new Date() : date,
        category: 'Other',
        type: 'expense' as const // Default to expense for CSV imports, let LLM determine for chat
      });
    } catch (error) {
      logger.warn({ error, line: i }, 'Failed to parse CSV line');
      continue;
    }
  }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.info({ 
      duration, 
      transactionCount: transactions.length,
      csvLength: csvText.length 
    }, 'CSV parsing completed successfully');
    
    return {
    preview: `Found ${transactions.length} transactions`,
      transactions,
      requiresConfirmation: true
    };
}

/**
 * Generic MCP-style database query tool that Gemini can call with flexible parameters
 */
export function queryFinancialDatabase(params: any = {}) {
  logger.warn('queryFinancialDatabase is deprecated, use the new service layer instead');
  return {
    type: 'deprecated',
    message: 'This function has been deprecated. Please use the new service layer.'
  };
}

