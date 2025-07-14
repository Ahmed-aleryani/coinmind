import { GoogleGenAI } from '@google/genai';
import { TransactionRepository, ProfileRepository, CategoryRepository } from '../domain/repositories';
import { TransactionStats } from '../domain/repositories';
import { detectLanguage } from '../utils/language-detection';
import { formatCurrency } from '../utils/formatters';
import { getExchangeRate } from '../utils/currency';
import logger from '../utils/logger';

// Transaction categories for consistent categorization
const CATEGORIES = [
  'Food & Dining',
  'Shopping',
  'Transportation',
  'Entertainment',
  'Bills & Utilities',
  'Healthcare',
  'Education',
  'Travel',
  'Other Expenses',
  'Salary',
  'Business',
  'Investment',
  'Gift',
  'Other Income'
];

export interface ParsedTransactionText {
  amount?: number;
  currency?: string;
  vendor?: string;
  description?: string;
  date?: Date;
  category?: string;
  type?: 'income' | 'expense';
}

export interface ReceiptData {
  date?: Date;
  vendor?: string;
  total?: number;
  items?: Array<{
    name: string;
    price: number;
    quantity: number;
  }>;
}

export class GeminiService {
  private aiClient: GoogleGenAI;
  private readonly MODEL_NAMES = {
    FLASH: 'gemini-2.5-flash',
    PRO: 'gemini-2.5-pro-preview-06-05'
  };

  constructor(
    private transactionRepo: TransactionRepository,
    private profileRepo: ProfileRepository,
    private categoryRepo: CategoryRepository,
    apiKey: string
  ) {
    this.aiClient = new GoogleGenAI({ apiKey });
  }

  async parseTransactionText(text: string): Promise<ParsedTransactionText> {
    const startTime = Date.now();
    
    logger.info({ text: text.substring(0, 100) }, 'Starting transaction text parsing');
    
    const detectedLanguage = detectLanguage(text);
    const todayDate = new Date().toISOString();
    
    const prompt = `Parse this natural language transaction description into structured data:
"${text}"

Today's date is: ${todayDate}

IMPORTANT: Respond in the same language as the user's input.

Analyze the message carefully and extract:
1. Amount (ALWAYS use ABSOLUTE VALUES - no negative numbers)
2. Currency (dollar, euro, pound, etc. - use standard currency codes like "USD", "EUR", "GBP")
3. Vendor/source (who the user received money from or paid money to)
4. Description (what the transaction was for, in the user's language)
5. Date (convert ALL dates to ISO format YYYY-MM-DD, including relative dates like 'yesterday', '2 days ago', 'last Monday')
6. Category (choose the most appropriate one from the list)
7. Type (income or expense based on context)

Return ONLY a JSON object with these fields (use null for missing data):
{
  "amount": number (ALWAYS positive - absolute value),
  "currency": string (3-letter currency code like "USD", "EUR", "GBP"),
  "vendor": string,
  "description": string (in the user's language),
  "date": string (ISO format YYYY-MM-DD, e.g., "2025-07-11"),
  "category": string (one of: ${CATEGORIES.join(', ')}),
  "type": string ("income" or "expense")
}

RULES:
- Amount should ALWAYS be positive (absolute value)
- Use the 'type' field to indicate if it's income or expense
- Today's date to be used as a reference is: ${todayDate}
- For date: 
  * Convert ALL relative dates to absolute dates in ISO format (YYYY-MM-DD)
  * If the text contains "X days ago", calculate the exact date
  * If the text contains "last [weekday]", find the most recent occurrence of that weekday
  * If no date is mentioned, use today's date (${todayDate.split('T')[0]})
- For description: use the same language as the user's input
- For vendor: extract the relevant name from the context
- For category: choose the most relevant from the provided list
- For type: determine if this is "income" or "expense" based on context`;

    try {
      const response = await this.aiClient.models.generateContent({
        model: this.MODEL_NAMES.FLASH,
        contents: [{
          role: 'user',
          parts: [{ text: prompt }]
        }]
      });
      
      const responseText = response.text;
      
      if (!responseText) {
        throw new Error('Empty response from Gemini API');
      }
      
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.error({ response: responseText }, 'No valid JSON found in Gemini response');
        throw new Error('No valid JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      logger.debug({ 
        hasAmount: parsed.amount !== undefined,
        hasDate: parsed.date !== undefined,
        category: parsed.category
      }, 'Parsed AI response');
      
      let transactionDate: Date | undefined;
      
      if (parsed.date) {
        try {
          transactionDate = new Date(parsed.date);
          if (isNaN(transactionDate.getTime())) {
            throw new Error('Invalid date format from AI');
          }
        } catch (e) {
          logger.warn({ 
            date: parsed.date,
            error: e instanceof Error ? e.message : 'Unknown error',
            originalText: text
          }, 'Date parsing failed, using current date');
          transactionDate = new Date();
        }
      } else {
        transactionDate = new Date();
      }
      
      let amount = parsed.amount ? Math.abs(Number(parsed.amount)) : undefined; // Ensure positive
      let type: 'income' | 'expense' | undefined = parsed.type || undefined;
      
      // Validate type
      if (type && !['income', 'expense'].includes(type)) {
        logger.warn({ type, text }, 'Invalid transaction type from AI, defaulting to expense');
        type = 'expense';
      }
      
      const result: ParsedTransactionText = {
        amount,
        currency: parsed.currency || undefined,
        vendor: parsed.vendor || undefined,
        description: parsed.description || text,
        date: transactionDate,
        category: parsed.category || undefined,
        type: type
      };
      
      const endTime = Date.now();
      logger.info({ 
        duration: endTime - startTime,
        hasAmount: result.amount !== undefined,
        category: result.category,
        detectedLanguage: detectedLanguage.code
      }, 'Transaction text parsing completed successfully');
      
      return result;
    } catch (error) {
      const endTime = Date.now();
      logger.error({ 
        error: error instanceof Error ? error.message : error,
        duration: endTime - startTime,
        text: text.substring(0, 100)
      }, 'Transaction text parsing failed');
      throw error;
    }
  }

  async parseReceiptImage(imageBase64: string): Promise<ReceiptData> {
    const startTime = Date.now();
    
    logger.info({ imageSize: imageBase64.length }, 'Starting receipt image parsing');
    
    const prompt = `
      Analyze this receipt image and extract transaction information.
      
      Return ONLY a JSON object with these fields (use null for missing data):
      {
        "date": string (ISO format),
        "vendor": string,
        "total": number,
        "items": [
          {
            "name": string,
            "price": number,
            "quantity": number
          }
        ]
      }
      
      Be accurate with the total amount and individual item prices.
    `;

    try {
      const response = await this.aiClient.models.generateContent({
        model: this.MODEL_NAMES.FLASH,
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: imageBase64,
                mimeType: 'image/jpeg'
              }
            }
          ]
        }]
      });

      const text = response.text;
      
      if (!text) {
        throw new Error('Empty response from Gemini API');
      }
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.error({ response: text }, 'No valid JSON found in receipt parsing response');
        throw new Error('No valid JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      const result: ReceiptData = {
        date: parsed.date ? new Date(parsed.date) : undefined,
        vendor: parsed.vendor || undefined,
        total: parsed.total ? Number(parsed.total) : undefined,
        items: parsed.items || []
      };
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      logger.info({ 
        duration, 
        vendor: result.vendor,
        total: result.total,
        itemCount: result.items?.length || 0
      }, 'Receipt image parsing completed successfully');
      
      return result;
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      logger.error({ 
        error: error instanceof Error ? error.message : error,
        duration 
      }, 'Failed to parse receipt image');
      
      throw new Error('Failed to parse receipt image');
    }
  }

  async answerFinancialQuestion(userId: string, question: string, userLanguage: string = 'en'): Promise<string> {
    const startTime = Date.now();
    
    logger.info({ question: question.substring(0, 100), userLanguage, userId }, 'Processing financial question');
    
    try {
      // Get user profile to understand their context
      const profile = await this.profileRepo.findById(userId);
      const defaultCurrency = profile?.defaultCurrency || 'USD';

      // Function detection prompt
      const functionDetectionPrompt = `You are a financial assistant. The user asked: "${question}"

Available database functions:
- query_transactions: Query transaction data with flexible SQL conditions
- get_transaction_summary: Get summary of transaction statistics
- get_spending_by_category: Get spending breakdown by category
- get_spending_by_vendor: Get spending breakdown by vendor
- get_recent_transactions: Get recent transactions with optional filters

DATABASE SCHEMA INFORMATION:
- Table: transactions
- User ID: ${userId}
- Default currency: ${defaultCurrency}
- Transaction amount stored as converted amount in user's default currency
- Categories available through category service
- Date format: YYYY-MM-DD

Determine what data you need to answer the user's question. Return ONLY a JSON array of function calls:

[
  {
    "function": "function_name",
    "args": {
      "arg1": "value1",
      "arg2": "value2"
    }
  }
]

Current date: ${new Date().toISOString().split('T')[0]}`;
      
      const response = await this.aiClient.models.generateContent({
        model: this.MODEL_NAMES.FLASH,
        contents: [{
          role: 'user',
          parts: [{ text: functionDetectionPrompt }]
        }]
      });
      
      const responseText = response.text;
      
      if (!responseText) {
        throw new Error('Empty response from AI');
      }
      
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        logger.info({ question: question.substring(0, 100) }, 'No function calls detected, providing general response');
        return `I'd be happy to help you with your financial question. However, I need more specific information to query your data. Could you please be more specific about what you'd like to know about your finances?`;
      }
      
      const functionCalls = JSON.parse(jsonMatch[0]);
      
      if (!Array.isArray(functionCalls) || functionCalls.length === 0) {
        throw new Error('Invalid function calls format');
      }
      
      logger.info({ functionCallsCount: functionCalls.length }, 'Function calls detected');
      
      // Execute function calls using repositories
      const functionResults = [];
      for (const call of functionCalls) {
        try {
          const result = await this.executeFunction(userId, call.function, call.args);
          functionResults.push({
            name: call.function,
            result
          });
        } catch (error) {
          logger.error({ 
            functionName: call.function, 
            args: call.args, 
            error: error instanceof Error ? error.message : error 
          }, 'Function call failed');
          
          functionResults.push({
            name: call.function,
            error: error instanceof Error ? error.message : 'Function call failed'
          });
        }
      }
      
      // Generate final response
      const finalPrompt = `Based on the function call results, provide a helpful response to the user's question: "${question}"

Function Results:
${functionResults.map(r => `${r.name}: ${r.error ? `Error: ${r.error}` : JSON.stringify(r.result, null, 2)}`).join('\n\n')}

Respond in ${userLanguage} with specific numbers and insights. Format currency amounts nicely and provide actionable insights. Be conversational and helpful.`;

      const finalResponse = await this.aiClient.models.generateContent({
        model: this.MODEL_NAMES.FLASH,
        contents: [{
          role: 'user',
          parts: [{ text: finalPrompt }]
        }]
      });
      
      const finalText = finalResponse.text;
      
      if (!finalText) {
        throw new Error('Empty final response from AI');
      }
      
      const endTime = Date.now();
      logger.info({ 
        duration: endTime - startTime,
        functionCallsCount: functionCalls.length,
        responseLength: finalText.length
      }, 'Financial question answered successfully');
      
      return finalText;
    } catch (error) {
      const endTime = Date.now();
      logger.error({ 
        error: error instanceof Error ? error.message : error,
        duration: endTime - startTime,
        question: question.substring(0, 100)
      }, 'Financial question processing failed');
      
      return "Sorry, an error occurred while processing your request. Please try again later.";
    }
  }

  private async executeFunction(userId: string, functionName: string, args: any): Promise<any> {
    const startTime = Date.now();
    
    logger.info({ functionName, args, userId }, 'Executing AI-requested function');
    
    try {
      switch (functionName) {
        case 'get_transaction_summary':
          return await this.getTransactionSummary(userId, args);
        case 'get_spending_by_category':
          return await this.getSpendingByCategory(userId, args);
        case 'get_spending_by_vendor':
          return await this.getSpendingByVendor(userId, args);
        case 'get_recent_transactions':
          return await this.getRecentTransactions(userId, args);
        default:
          throw new Error(`Unknown function: ${functionName}`);
      }
    } catch (error) {
      const endTime = Date.now();
      logger.error({ 
        functionName, 
        args, 
        error: error instanceof Error ? error.message : error,
        duration: endTime - startTime
      }, 'Function execution failed');
      
      throw error;
    }
  }

  private async getTransactionSummary(userId: string, args: any): Promise<any> {
    const startDate = args.start_date ? new Date(args.start_date) : undefined;
    const endDate = args.end_date ? new Date(args.end_date) : undefined;
    
    const stats = await this.transactionRepo.getStats(userId, startDate, endDate);
    
    return {
      success: true,
      data: stats,
      query_description: 'Transaction summary statistics'
    };
  }

  private async getSpendingByCategory(userId: string, args: any): Promise<any> {
    const startDate = args.start_date ? new Date(args.start_date) : undefined;
    const endDate = args.end_date ? new Date(args.end_date) : undefined;
    
    const transactions = await this.transactionRepo.findByDateRange(userId, startDate || new Date(0), endDate || new Date());
    
    const categoryStats: Record<string, { amount: number; count: number }> = {};
    
    for (const transaction of transactions) {
      const amount = Number(transaction.amount);
      // We need to get the category name from the category repository
      const category = await this.categoryRepo.findById(transaction.categoryId);
      const categoryName = category?.name || 'Unknown';
      
      if (!categoryStats[categoryName]) {
        categoryStats[categoryName] = { amount: 0, count: 0 };
      }
      categoryStats[categoryName].amount += Math.abs(amount);
      categoryStats[categoryName].count++;
    }
    
    const results = Object.entries(categoryStats)
      .map(([category, stats]) => ({
        category,
        transaction_count: stats.count,
        total_spent: stats.amount,
        avg_spent: stats.amount / stats.count
      }))
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, args.limit || 10);
    
    return {
      success: true,
      data: results,
      query_description: 'Spending breakdown by category'
    };
  }

  private async getSpendingByVendor(userId: string, args: any): Promise<any> {
    const startDate = args.start_date ? new Date(args.start_date) : undefined;
    const endDate = args.end_date ? new Date(args.end_date) : undefined;
    
    const transactions = await this.transactionRepo.findByDateRange(userId, startDate || new Date(0), endDate || new Date());
    
    const vendorStats: Record<string, { amount: number; count: number }> = {};
    
    for (const transaction of transactions) {
      const amount = Number(transaction.amount);
      const vendor = transaction.description || 'Unknown'; // Using description as vendor for now
      
      if (!vendorStats[vendor]) {
        vendorStats[vendor] = { amount: 0, count: 0 };
      }
      vendorStats[vendor].amount += Math.abs(amount);
      vendorStats[vendor].count++;
    }
    
    const results = Object.entries(vendorStats)
      .map(([vendor, stats]) => ({
        vendor,
        transaction_count: stats.count,
        total_spent: stats.amount,
        avg_spent: stats.amount / stats.count
      }))
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, args.limit || 10);
    
    return {
      success: true,
      data: results,
      query_description: 'Spending breakdown by vendor'
    };
  }

  private async getRecentTransactions(userId: string, args: any): Promise<any> {
    const limit = args.limit || 10;
    const transactions = await this.transactionRepo.findByUserId(userId, limit);
    
    const results = transactions.map(t => ({
      id: t.transactionId,
      amount: Number(t.amount),
      description: t.description,
      date: t.transactionDate,
      created_at: t.createdAt
    }));
    
    return {
      success: true,
      data: results,
      query_description: 'Recent transactions'
    };
  }
} 