import { GoogleGenAI } from '@google/genai';
import { ParsedTransactionText, ReceiptData, TransactionCategory } from '../types/transaction';
import { transactionDb, initDatabase } from '../db/schema';
import { formatCurrency } from '../utils/formatters';
import { detectLanguage, extractCurrencyAmount } from '../utils/language-detection';
import logger from '../utils/logger';

// Lazy-loaded Gemini AI client
let _aiInstance: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!_aiInstance) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set in environment variables');
    }
    
    _aiInstance = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });
    
    logger.info('Gemini AI client initialized');
  }
  
  return _aiInstance;
}

// Model names for different use cases
const MODEL_NAMES = {
  FLASH: 'gemini-2.5-flash',
  PRO: 'gemini-2.5-pro-preview-06-05'
};

// Transaction categories for consistent categorization
const CATEGORIES: TransactionCategory[] = [
  'Food & Drink',
  'Transportation',
  'Utilities',
  'Entertainment',
  'Shopping',
  'Healthcare',
  'Education',
  'Income',
  'Transfer',
  'Other'
];

/**
 * Parse natural language text into structured transaction data with multi-language support
 */
export async function parseTransactionText(text: string): Promise<ParsedTransactionText> {
  const startTime = Date.now();
  
  logger.info({ text: text.substring(0, 100) }, 'Starting transaction text parsing');
  
  // Detect the language of the input text
  const detectedLanguage = detectLanguage(text);
  const todayDate = new Date().toISOString();
  
  // AI will handle all date parsing, including relative dates

  // Create a single prompt that adapts to the user's language
  const prompt = `Parse this natural language transaction description into structured data:
"${text}"

Today's date is: ${todayDate}

IMPORTANT: Respond in the same language as the user's input.

Analyze the message carefully and extract:
1. Amount (with correct sign: positive for income/earnings, negative for expenses)
2. Currency (dollar, euro, pound, etc. - use standard currency codes like "USD", "EUR", "GBP")
3. Vendor/source (who the user received money from or paid money to)
4. Description (what the transaction was for, in the user's language)
5. Date (convert ALL dates to ISO format YYYY-MM-DD, including relative dates like 'yesterday', '2 days ago', 'last Monday')
6. Category (choose the most appropriate one from the list)

Return ONLY a JSON object with these fields (use null for missing data):
{
  "amount": number (positive for income, negative for expenses),
  "currency": string (3-letter currency code like "USD", "EUR", "GBP"),
  "vendor": string,
  "description": string (in the user's language),
  "date": string (ISO format YYYY-MM-DD, e.g., "2025-07-11"),
  "category": string (one of: ${CATEGORIES.join(', ')})
}

RULES:
- For income/earnings: use POSITIVE amounts
- For expenses: use NEGATIVE amounts
- Today's date to be used as a reference is: ${todayDate}
- For date: 
  * Convert ALL relative dates to absolute dates in ISO format (YYYY-MM-DD)
  * If the text contains "X days ago", calculate the exact date
  * If the text contains "last [weekday]", find the most recent occurrence of that weekday
  * If no date is mentioned, use today's date (${todayDate})
  * Example: If today is 2025-07-11 and text says "5 days ago", use "2025-07-06"
- For description: use the same language as the user's input
- For vendor: extract the relevant name from the context
- For category: choose the most relevant from the provided list`;

  try {
    // Send request to Gemini model
    
    // Generate content using the client
    const response = await getAiClient().models.generateContent({
      model: MODEL_NAMES.FLASH,
      contents: [{
        role: 'user',
        parts: [{
          text: prompt
        }]
      }]
    });
    
    const responseText = response.text;
    
    if (!responseText) {
      throw new Error('Empty response from Gemini API');
    }
    
    // Received response from Gemini model
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error({ response: responseText }, 'No valid JSON found in Gemini response');
      throw new Error('No valid JSON found in response');
    }

    // Parse the JSON response
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Log basic parsing info
    logger.debug({ 
      hasAmount: parsed.amount !== undefined,
      hasDate: parsed.date !== undefined,
      category: parsed.category
    }, 'Parsed AI response');
    
    // Parse the date from the AI response
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
    
    // Arabic expense keyword correction
    let amount = parsed.amount ? Number(parsed.amount) : undefined;
    let type: 'income' | 'expense' | undefined = undefined;
    if (detectedLanguage.code === 'ar' && typeof amount === 'number' && amount > 0) {
      const expenseKeywords = [
        'دفعت', 'أنفقت', 'سددت', 'صرف', 'شراء', 'اشترى', 'دفعة', 'فاتورة', 'تكلفة', 'رسوم', 'مصاريف', 'مدفوعات', 'سحب', 'خصم'
      ];
      const lowerText = text.replace(/[\u064B-\u0652]/g, '').toLowerCase(); // Remove Arabic diacritics
      if (expenseKeywords.some(word => lowerText.includes(word))) {
        amount = -Math.abs(amount);
        type = 'expense';
      }
    }
    // Note: Using date from AI response
    
    const result_data = {
      amount: typeof amount === 'number' ? amount : undefined,
      currency: parsed.currency || undefined,
      vendor: parsed.vendor || undefined,
      description: parsed.description || undefined,
      date: transactionDate,
      category: parsed.category || undefined,
      type: type // will be undefined unless we force expense above
    };
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.info({ 
      duration, 
      hasAmount: result_data.amount !== undefined,
      category: result_data.category,
      vendor: result_data.vendor,
      detectedLanguage: detectedLanguage.code
    }, 'Transaction text parsing completed successfully');
    
    return result_data;
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.error({ 
      error: error instanceof Error ? error.message : error,
      duration,
      text: text.substring(0, 100),
      detectedLanguage: detectedLanguage.code
    }, 'Failed to parse transaction text');
    
    throw new Error('Failed to parse transaction text');
  }
}

/**
 * Process receipt image and extract transaction data
 */
export async function parseReceiptImage(imageBase64: string): Promise<ReceiptData> {
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
    // Send receipt image to Gemini model
    
    const response = await getAiClient().models.generateContent({
      model: MODEL_NAMES.FLASH,
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
    
    // Received receipt parsing response
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error({ response: text }, 'No valid JSON found in receipt parsing response');
      throw new Error('No valid JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    const result_data = {
      date: parsed.date ? new Date(parsed.date) : undefined,
      vendor: parsed.vendor || undefined,
      total: parsed.total ? Number(parsed.total) : undefined,
      items: parsed.items || []
    };
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.info({ 
      duration, 
      vendor: result_data.vendor,
      total: result_data.total,
      itemCount: result_data.items.length 
    }, 'Receipt image parsing completed successfully');
    
    return result_data;
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

/**
 * Categorize a transaction automatically
 */
export async function categorizeTransaction(
  description: string, 
  vendor?: string
): Promise<TransactionCategory> {
  const prompt = `
    Categorize this transaction into one of these categories:
    ${CATEGORIES.join(', ')}
    
    Transaction details:
    Description: "${description}"
    Vendor: "${vendor || 'Unknown'}"
    
    Return ONLY the category name, nothing else.
    
    Examples:
    - "Coffee" from "Starbucks" → Food & Drink
    - "Gas" from "Shell" → Transportation
    - "Electric bill" → Utilities
    - "Salary" → Income
  `;

  try {
    const response = await getAiClient().models.generateContent({
      model: MODEL_NAMES.FLASH,
      contents: [{
        role: 'user',
        parts: [{
          text: prompt
        }]
      }]
    });
    
    const category = response.text?.trim();
    
    if (!category) {
      throw new Error('Empty response from Gemini API');
    }
    
    // Validate category
    if (CATEGORIES.includes(category as TransactionCategory)) {
      return category as TransactionCategory;
    }
    
    return 'Other';
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Error categorizing transaction');
    return 'Other';
  }
}

/**
 * Function calling system for dynamic SQL query generation
 * This replaces the keyword-based approach with proper AI function calling
 */

interface DatabaseQueryTools {
  name: string;
  description: string;
  parameters: any;
}

// Define available function tools for the AI to use
const DATABASE_QUERY_TOOLS: DatabaseQueryTools[] = [
  {
    name: "query_transactions",
    description: "Query transaction data with flexible SQL conditions. Use this to answer questions about spending, income, transactions, categories, vendors, dates, etc.",
    parameters: {
      type: "object",
      properties: {
        sql_query: {
          type: "string",
          description: "A SQL query to execute against the transactions table. Available columns: id, amount, description, vendor, category, type (income/expense), date, created_at, updated_at, original_amount, original_currency, converted_amount, converted_currency, conversion_rate, conversion_fee"
        },
        explanation: {
          type: "string", 
          description: "Brief explanation of what this query does"
        }
      },
      required: ["sql_query", "explanation"]
    }
  },
  {
    name: "get_transaction_summary",
    description: "Get a summary of transaction statistics for a time period or category",
    parameters: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format (optional)"
        },
        end_date: {
          type: "string", 
          description: "End date in YYYY-MM-DD format (optional)"
        },
        category: {
          type: "string",
          description: "Filter by category (optional)"
        },
        transaction_type: {
          type: "string",
          description: "Filter by type: 'income', 'expense', or 'all' (optional, defaults to 'all')"
        }
      },
      required: []
    }
  },
  {
    name: "get_spending_by_category",
    description: "Get spending breakdown by category for analysis",
    parameters: {
      type: "object", 
      properties: {
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format (optional)"
        },
        end_date: {
          type: "string",
          description: "End date in YYYY-MM-DD format (optional)" 
        },
        limit: {
          type: "number",
          description: "Maximum number of categories to return (optional, defaults to 10)"
        }
      },
      required: []
    }
  },
  {
    name: "get_spending_by_vendor",
    description: "Get spending breakdown by vendor/merchant",
    parameters: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format (optional)"
        },
        end_date: {
          type: "string",
          description: "End date in YYYY-MM-DD format (optional)"
        },
        limit: {
          type: "number", 
          description: "Maximum number of vendors to return (optional, defaults to 10)"
        }
      },
      required: []
    }
  },
  {
    name: "get_recent_transactions",
    description: "Get recent transactions, optionally filtered by category, vendor, or amount",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of transactions to return (optional, defaults to 10)"
        },
        category: {
          type: "string",
          description: "Filter by category (optional)"
        },
        vendor: {
          type: "string",
          description: "Filter by vendor (optional)"
        },
        min_amount: {
          type: "number",
          description: "Minimum amount filter (optional)"
        },
        max_amount: {
          type: "number",
          description: "Maximum amount filter (optional)"
        },
        transaction_type: {
          type: "string",
          description: "Filter by type: 'income' or 'expense' (optional)"
        }
      },
      required: []
    }
  }
];

/**
 * Execute a database query function called by the AI
 */
async function executeQueryFunction(functionName: string, args: any): Promise<any> {
  const startTime = Date.now();
  
  logger.info({ functionName, args }, 'Executing AI-requested database function');
  
  try {
    initDatabase();
    
    switch (functionName) {
      case 'query_transactions':
        return await executeCustomSQLQuery(args.sql_query, args.explanation);
        
      case 'get_transaction_summary':
        return await getTransactionSummary(args);
        
      case 'get_spending_by_category':
        return await getSpendingByCategory(args);
        
      case 'get_spending_by_vendor':
        return await getSpendingByVendor(args);
        
      case 'get_recent_transactions':
        return await getRecentTransactions(args);
        
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
    }, 'Database function execution failed');
    
    throw error;
  }
}

/**
 * Execute a custom SQL query with safety checks
 */
async function executeCustomSQLQuery(sqlQuery: string, explanation: string): Promise<any> {
  // Basic SQL injection protection - only allow SELECT queries
  const trimmedQuery = sqlQuery.trim().toLowerCase();
  if (!trimmedQuery.startsWith('select')) {
    throw new Error('Only SELECT queries are allowed');
  }
  
  // Prevent dangerous operations
  const forbidden = ['drop', 'delete', 'insert', 'update', 'alter', 'create', 'truncate'];
  if (forbidden.some(word => trimmedQuery.includes(word))) {
    throw new Error('Query contains forbidden operations');
  }
  
  const { initDatabase } = await import('@/lib/db/schema');
  const db = initDatabase();
  
  logger.info({ sqlQuery, explanation }, 'Executing custom SQL query');
  
  try {
    const stmt = db.prepare(sqlQuery);
    const results = stmt.all();
    
    return {
      success: true,
      data: results,
      explanation,
      query: sqlQuery,
      count: results.length
    };
  } catch (error) {
    logger.error({ sqlQuery, error: error instanceof Error ? error.message : error }, 'Custom SQL query failed');
    throw new Error(`SQL query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get transaction summary with optional filters
 */
async function getTransactionSummary(args: any): Promise<any> {
  const db = initDatabase();
  
  let whereClause = '';
  const params: any[] = [];
  
  if (args.start_date) {
    whereClause += whereClause ? ' AND ' : ' WHERE ';
    whereClause += 'date >= ?';
    params.push(args.start_date);
  }
  
  if (args.end_date) {
    whereClause += whereClause ? ' AND ' : ' WHERE ';
    whereClause += 'date <= ?';
    params.push(args.end_date);
  }
  
  if (args.category) {
    whereClause += whereClause ? ' AND ' : ' WHERE ';
    whereClause += 'category = ?';
    params.push(args.category);
  }
  
  if (args.transaction_type && args.transaction_type !== 'all') {
    whereClause += whereClause ? ' AND ' : ' WHERE ';
    whereClause += 'type = ?';
    params.push(args.transaction_type);
  }
  
  const query = `
    SELECT 
      COUNT(*) as total_transactions,
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
      SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END) as total_expenses,
      AVG(CASE WHEN type = 'expense' THEN ABS(amount) ELSE NULL END) as avg_expense,
      MIN(date) as earliest_date,
      MAX(date) as latest_date
    FROM transactions${whereClause}
  `;
  
  const stmt = db.prepare(query);
  const result = stmt.get(...params);
  
  return {
    success: true,
    data: result,
    query_description: 'Transaction summary statistics'
  };
}

/**
 * Get spending breakdown by category
 */
async function getSpendingByCategory(args: any): Promise<any> {
  const db = initDatabase();
  
  let whereClause = "WHERE type = 'expense'";
  const params: any[] = [];
  
  if (args.start_date) {
    whereClause += ' AND date >= ?';
    params.push(args.start_date);
  }
  
  if (args.end_date) {
    whereClause += ' AND date <= ?';
    params.push(args.end_date);
  }
  
  const limit = args.limit || 10;
  
  const query = `
    SELECT 
      category,
      COUNT(*) as transaction_count,
      SUM(ABS(amount)) as total_spent,
      AVG(ABS(amount)) as avg_spent
    FROM transactions 
    ${whereClause}
    GROUP BY category
    ORDER BY total_spent DESC
    LIMIT ?
  `;
  
  const stmt = db.prepare(query);
  const results = stmt.all(...params, limit);
  
  return {
    success: true,
    data: results,
    query_description: 'Spending breakdown by category'
  };
  }
  
/**
 * Get spending breakdown by vendor
 */
async function getSpendingByVendor(args: any): Promise<any> {
  const db = initDatabase();
  
  let whereClause = "WHERE type = 'expense'";
  const params: any[] = [];
  
  if (args.start_date) {
    whereClause += ' AND date >= ?';
    params.push(args.start_date);
}

  if (args.end_date) {
    whereClause += ' AND date <= ?';
    params.push(args.end_date);
  }
  
  const limit = args.limit || 10;
  
  const query = `
    SELECT 
      vendor,
      COUNT(*) as transaction_count,
      SUM(ABS(amount)) as total_spent,
      AVG(ABS(amount)) as avg_spent
    FROM transactions 
    ${whereClause}
    GROUP BY vendor
    ORDER BY total_spent DESC
    LIMIT ?
  `;
  
  const stmt = db.prepare(query);
  const results = stmt.all(...params, limit);
  
  return {
    success: true,
    data: results,
    query_description: 'Spending breakdown by vendor'
  };
  }

/**
 * Get recent transactions with optional filters
 */
async function getRecentTransactions(args: any): Promise<any> {
  const db = initDatabase();
  
  let whereClause = '';
  const params: any[] = [];
  
  if (args.category) {
    whereClause += whereClause ? ' AND ' : ' WHERE ';
    whereClause += 'category = ?';
    params.push(args.category);
  }
  
  if (args.vendor) {
    whereClause += whereClause ? ' AND ' : ' WHERE ';
    whereClause += 'vendor LIKE ?';
    params.push(`%${args.vendor}%`);
  }
  
  if (args.min_amount) {
    whereClause += whereClause ? ' AND ' : ' WHERE ';
    whereClause += 'ABS(amount) >= ?';
    params.push(args.min_amount);
  }
  
  if (args.max_amount) {
    whereClause += whereClause ? ' AND ' : ' WHERE ';
    whereClause += 'ABS(amount) <= ?';
    params.push(args.max_amount);
  }
  
  if (args.transaction_type) {
    whereClause += whereClause ? ' AND ' : ' WHERE ';
    whereClause += 'type = ?';
    params.push(args.transaction_type);
    }

  const limit = args.limit || 10;
  
  const query = `
    SELECT id, amount, description, vendor, category, type, date, created_at
    FROM transactions 
    ${whereClause}
    ORDER BY date DESC, created_at DESC
    LIMIT ?
  `;
  
  const stmt = db.prepare(query);
  const results = stmt.all(...params, limit);
  
  return {
    success: true,
    data: results,
    query_description: 'Recent transactions'
  };
}

/**
 * Answer user questions using AI-powered function calling to query the database
 */
export async function answerFinancialQuestion(question: string, userLanguage: string = 'en'): Promise<string> {
  const startTime = Date.now();
  
  logger.info({ question: question.substring(0, 100), userLanguage }, 'Processing financial question with AI function calling');
  
  try {
    // First, ask AI to determine which functions to call
    const functionDetectionPrompt = `You are a financial assistant. The user asked: "${question}"

Available database functions:
${DATABASE_QUERY_TOOLS.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

DATABASE SCHEMA INFORMATION:
- Table: transactions
- Date column: 'date' (stored as ISO strings like '2025-07-12T00:00:00.000Z')
- Amount column: 'amount' (negative for expenses, positive for income)
- Vendor column: 'vendor' (contains full vendor names, use LIKE '%keyword%' for partial matches)
- Category column: 'category' (available categories: Food & Drink, Transportation, Entertainment, Shopping, Utilities, Healthcare, Income, Other, Lodging, Travel, Education, Gifts, Subscriptions, Groceries, Gas, Insurance, Investments, Savings, Debt, Fees, Taxes, Business, Personal Care, Home & Garden, Sports & Recreation, Childcare, Pet Care, Charity, Legal, Professional Services)
- For date queries, use: substr(date, 1, 10) = 'YYYY-MM-DD' or date LIKE 'YYYY-MM-DD%'
- For date ranges, use: date >= 'YYYY-MM-DD' AND date <= 'YYYY-MM-DD'
- For vendor searches, use: vendor LIKE '%keyword%' (don't assume exact category, let the data determine the category)
- IMPORTANT: When searching for vendors, be flexible with categories - hotels could be Entertainment, Lodging, or Travel

Determine which function(s) to call to answer the user's question. Return ONLY a JSON array of function calls:

[
  {
    "function": "function_name",
    "args": {
      "arg1": "value1",
      "arg2": "value2"
    }
  }
]

Examples:
- "How much did I spend this month?" → [{"function": "get_transaction_summary", "args": {"start_date": "2025-01-01", "end_date": "2025-01-31", "transaction_type": "expense"}}]
- "Show me my food expenses" → [{"function": "get_spending_by_category", "args": {"category": "Food & Drink"}}]
- "What did I spend at Starbucks?" → [{"function": "query_transactions", "args": {"sql_query": "SELECT amount, description, vendor, category, date FROM transactions WHERE vendor LIKE '%Starbucks%' AND type = 'expense'", "explanation": "Get all expenses at Starbucks"}}]
- "How much was hotel at SeaView Resort?" → [{"function": "query_transactions", "args": {"sql_query": "SELECT amount, description, vendor, category, date FROM transactions WHERE vendor LIKE '%SeaView Resort%' AND type = 'expense'", "explanation": "Get all expenses at SeaView Resort"}}]
- "What did I spend on July 12, 2025?" → [{"function": "query_transactions", "args": {"sql_query": "SELECT amount, description, vendor, category, date FROM transactions WHERE substr(date, 1, 10) = '2025-07-12' AND type = 'expense'", "explanation": "Get all expenses for July 12, 2025"}}]
- "List my biggest expenses this year" → [{"function": "query_transactions", "args": {"sql_query": "SELECT amount, description, vendor, date FROM transactions WHERE type = 'expense' AND date >= '2025-01-01' ORDER BY ABS(amount) DESC LIMIT 10", "explanation": "Get top 10 biggest expenses this year"}}]

Current date: ${new Date().toISOString().split('T')[0]}`;
    
    const response = await getAiClient().models.generateContent({
      model: MODEL_NAMES.FLASH,
      contents: [{
        role: 'user',
        parts: [{ text: functionDetectionPrompt }]
      }]
    });
    
    const responseText = response.text;
    
    if (!responseText) {
      throw new Error('Empty response from AI');
    }
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      // If no function calls detected, provide a general response
      logger.info({ question: question.substring(0, 100) }, 'No function calls detected, providing general response');
      return `I'd be happy to help you with your financial question. However, I need more specific information to query your data. Could you please be more specific about what you'd like to know about your finances?`;
    }
    
    const functionCalls = JSON.parse(jsonMatch[0]);
    
    if (!Array.isArray(functionCalls) || functionCalls.length === 0) {
      throw new Error('Invalid function calls format');
    }
    
    logger.info({ functionCallsCount: functionCalls.length }, 'Function calls detected');
    
    // Execute each function call
    const functionResults = [];
    for (const call of functionCalls) {
      try {
        const functionResult = await executeQueryFunction(call.function, call.args);
        functionResults.push({
          name: call.function,
          result: functionResult
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
    
    // Generate final response based on function results
    const finalPrompt = `Based on the function call results, provide a helpful response to the user's question: "${question}"

Function Results:
${functionResults.map(r => `${r.name}: ${r.error ? `Error: ${r.error}` : JSON.stringify(r.result, null, 2)}`).join('\n\n')}

Respond in ${userLanguage} with specific numbers and insights. Format currency amounts nicely and provide actionable insights. Be conversational and helpful.`;

    const finalResponse = await getAiClient().models.generateContent({
      model: MODEL_NAMES.FLASH,
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
    }, 'Financial question answered successfully with function calling');
    
    return finalText;
  } catch (error) {
    const endTime = Date.now();
    logger.error({ 
      error: error instanceof Error ? error.message : error,
      duration: endTime - startTime,
      question: question.substring(0, 100)
    }, 'Financial question processing failed');
    
    // Return error message in the user's language
   const errorPrompt = `The following error occurred while processing the user's financial question: "${error instanceof Error ? error.message : error}". 
Respond to the user in ${userLanguage} with a polite, empathetic message explaining that an error occurred while analyzing their financial data, and suggest they try rephrasing their question or try again later.`;

    try {
      const errorResponse = await getAiClient().models.generateContent({
        model: MODEL_NAMES.FLASH,
        contents: [{
          role: 'user',
          parts: [{ text: errorPrompt }]
        }]
      });
      const errorText = errorResponse.text;
      return errorText || "Sorry, an error occurred while processing your request. Please try again later.";
    } catch {
      return "Sorry, an error occurred while processing your request. Please try again later.";
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
  
  const prompt = `Parse this CSV data into transactions. Return JSON only:

${csvText}

Convert each row to this format:
{
  "preview": "Found X transactions",
  "transactions": [
    {
      "amount": number (negative for expenses, positive for income),
      "vendor": "string",
      "description": "string",
      "date": "ISO date string",
      "category": "string (${CATEGORIES.join('|')})",
      "type": "income" | "expense"
    }
  ],
  "requiresConfirmation": true
}

Rules:
- Negative amounts = expenses, Positive = income
- Parse dates to ISO format
- Choose best category from: ${CATEGORIES.join(', ')}
- Extract vendor from description if no vendor column
- Skip header row`;

  try {
    // Use Pro Preview for faster processing, fallback to Flash if needed
    let response;
    let modelUsed = MODEL_NAMES.PRO;
    
          try {
        // Attempt CSV parsing with Pro model
        response = await getAiClient().models.generateContent({
        model: MODEL_NAMES.PRO,
        contents: [{
          role: 'user',
          parts: [{
            text: prompt
          }]
        }]
      });
    } catch (proError) {
      logger.warn({ error: proError instanceof Error ? proError.message : proError }, 'Pro Preview unavailable, using Flash model');
      modelUsed = MODEL_NAMES.FLASH;
      response = await getAiClient().models.generateContent({
        model: MODEL_NAMES.FLASH,
        contents: [{
          role: 'user',
          parts: [{
            text: prompt
          }]
        }]
      });
    }
    
    const text = response.text;
    
    if (!text) {
      throw new Error('Empty response from Gemini API');
    }
    
    // Received CSV parsing response
    
    // Extract JSON from response (handles markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error({ response: text.substring(0, 500) }, 'No valid JSON found in CSV parsing response');
      throw new Error('No valid JSON found in response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Process transactions with simple validation
    const transactions = (parsed.transactions || []).map((t: any) => ({
      amount: Number(t.amount) || 0,
      vendor: t.vendor || 'Unknown',
      description: t.description || '',
      date: new Date(t.date) || new Date(),
      category: t.category || 'Other',
      type: t.type || (Number(t.amount) >= 0 ? 'income' : 'expense')
    }));
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.info({ 
      duration, 
      transactionCount: transactions.length,
      modelUsed,
      csvLength: csvText.length 
    }, 'CSV parsing completed successfully');
    
    return {
      preview: parsed.preview || `Found ${transactions.length} transactions`,
      transactions,
      requiresConfirmation: true
    };
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.error({ 
      error: error instanceof Error ? error.message : error,
      duration,
      csvLength: csvText.length 
    }, 'CSV parsing failed');
    
    throw new Error('Failed to parse CSV. Please check your file format.');
  }
}

/**
 * Generic MCP-style database query tool that Gemini can call with flexible parameters
 */

interface DatabaseQueryParams {
  // Time parameters
  startDate?: string;      // ISO date string
  endDate?: string;        // ISO date string
  daysBack?: number;       // How many days back from today
  weeksBack?: number;      // How many weeks back from today
  monthsBack?: number;     // How many months back from today
  
  // Filter parameters
  category?: string;       // Transaction category to filter by
  vendor?: string;         // Vendor to filter by
  minAmount?: number;      // Minimum transaction amount
  maxAmount?: number;      // Maximum transaction amount
  transactionType?: 'income' | 'expense' | 'both'; // Type of transactions
  
  // Query type parameters
  analysisType?: 'summary' | 'spending' | 'income' | 'categories' | 'vendors' | 'patterns' | 'transactions';
  groupBy?: 'date' | 'category' | 'vendor' | 'weekday' | 'month';
  limit?: number;          // Maximum number of results to return
  
  // Specific date queries
  specificDate?: string;   // Query for a specific date (YYYY-MM-DD)
}

export function queryFinancialDatabase(params: DatabaseQueryParams = {}) {
  initDatabase();
  
  // Calculate date range
  const dateRange = calculateDateRange(params);
  
  // Get base transactions
  let transactions = dateRange.start && dateRange.end 
    ? transactionDb.getByDateRange(dateRange.start, dateRange.end)
    : transactionDb.getAll(1000);
  
  // Apply filters
  transactions = applyFilters(transactions, params);
  
  // Perform analysis based on type
  const analysisType = params.analysisType || 'summary';
  const result = performAnalysis(transactions, analysisType, params, dateRange);
  
  return result;
}

function calculateDateRange(params: DatabaseQueryParams) {
  const now = new Date();
  let start: Date | undefined;
  let end: Date | undefined;
  
  // Handle specific date
  if (params.specificDate) {
    const date = new Date(params.specificDate);
    start = new Date(date.setHours(0, 0, 0, 0));
    end = new Date(date.setHours(23, 59, 59, 999));
    return { start, end, description: `on ${start.toLocaleDateString()}` };
  }
  
  // Handle explicit date range
  if (params.startDate) {
    start = new Date(params.startDate);
  }
  if (params.endDate) {
    end = new Date(params.endDate);
  }
  
  // Handle duration-based queries
  if (params.daysBack) {
    start = new Date(now.getTime() - params.daysBack * 24 * 60 * 60 * 1000);
    end = now;
  } else if (params.weeksBack) {
    start = new Date(now.getTime() - params.weeksBack * 7 * 24 * 60 * 60 * 1000);
    end = now;
  } else if (params.monthsBack) {
    start = new Date(now.getFullYear(), now.getMonth() - params.monthsBack, now.getDate());
    end = now;
  }
  
  // Default to current month if no date specified
  if (!start && !end) {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = now;
  }
  
  const description = start && end 
    ? `from ${start.toLocaleDateString()} to ${end.toLocaleDateString()}`
    : 'in the analyzed period';
  
  return { start, end, description };
}

function applyFilters(transactions: any[], params: DatabaseQueryParams) {
  let filtered = transactions;
  
  // Filter by transaction type
  if (params.transactionType && params.transactionType !== 'both') {
    filtered = filtered.filter(t => t.type === params.transactionType);
  }
  
  // Filter by category
  if (params.category) {
    filtered = filtered.filter(t => 
      t.category.toLowerCase().includes(params.category!.toLowerCase())
    );
  }
  
  // Filter by vendor
  if (params.vendor) {
    filtered = filtered.filter(t => 
      t.vendor.toLowerCase().includes(params.vendor!.toLowerCase())
    );
  }
  
  // Filter by amount range
  if (params.minAmount !== undefined) {
    filtered = filtered.filter(t => Math.abs(t.amount) >= params.minAmount!);
  }
  if (params.maxAmount !== undefined) {
    filtered = filtered.filter(t => Math.abs(t.amount) <= params.maxAmount!);
  }
  
  return filtered;
}

function performAnalysis(transactions: any[], analysisType: string, params: DatabaseQueryParams, dateRange: any) {
  const expenses = transactions.filter(t => t.type === 'expense');
  const income = transactions.filter(t => t.type === 'income');
  
  switch (analysisType) {
    case 'spending':
      return analyzeSpending(expenses, dateRange, params);
    
    case 'income':
      return analyzeIncome(income, dateRange, params);
    
    case 'categories':
      return analyzeCategories(transactions, dateRange, params);
    
    case 'vendors':
      return analyzeVendors(transactions, dateRange, params);
    
    case 'patterns':
      return analyzePatterns(transactions, dateRange, params);
    
    case 'transactions':
      return listTransactions(transactions, dateRange, params);
    
    default: // 'summary'
      return analyzeSummary(transactions, dateRange, params);
  }
}

function analyzeSpending(expenses: any[], dateRange: any, params: DatabaseQueryParams) {
  const totalSpent = expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  
  return {
    type: 'spending_analysis',
    summary: `Total spending: ${formatCurrency(totalSpent)} ${dateRange.description}`,
    totalSpent,
    transactionCount: expenses.length,
    averageTransaction: expenses.length > 0 ? totalSpent / expenses.length : 0,
    period: dateRange.description,
    categoryBreakdown: getCategoryBreakdown(expenses),
    topTransactions: expenses
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, params.limit || 5)
      .map(formatTransaction)
  };
}

function analyzeIncome(income: any[], dateRange: any, params: DatabaseQueryParams) {
  const totalIncome = income.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  
  return {
    type: 'income_analysis',
    summary: `Total income: ${formatCurrency(totalIncome)} ${dateRange.description}`,
    totalIncome,
    transactionCount: income.length,
    averageTransaction: income.length > 0 ? totalIncome / income.length : 0,
    period: dateRange.description,
    categoryBreakdown: getCategoryBreakdown(income),
    transactions: income.slice(0, params.limit || 10).map(formatTransaction)
  };
}

function analyzeCategories(transactions: any[], dateRange: any, params: DatabaseQueryParams) {
  const categoryBreakdown = getCategoryBreakdown(transactions);
  
  return {
    type: 'category_analysis',
    summary: `Spending breakdown by category ${dateRange.description}`,
    categoryBreakdown,
    topCategory: categoryBreakdown[0] || null,
    period: dateRange.description,
    totalAmount: transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0)
  };
}

function analyzeVendors(transactions: any[], dateRange: any, params: DatabaseQueryParams) {
  const vendorBreakdown = transactions.reduce((acc, t) => {
    const vendor = t.vendor || 'Unknown';
    if (!acc[vendor]) {
      acc[vendor] = { count: 0, total: 0 };
    }
    acc[vendor].count++;
    acc[vendor].total += Math.abs(t.amount);
    return acc;
  }, {} as Record<string, { count: number; total: number }>);
  
  const vendorArray = Object.entries(vendorBreakdown)
    .map(([vendor, data]) => ({
      vendor,
      count: (data as { count: number; total: number }).count,
      total: (data as { count: number; total: number }).total,
      average: (data as { count: number; total: number }).total / (data as { count: number; total: number }).count
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, params.limit || 10);
  
  return {
    type: 'vendor_analysis',
    summary: `Top vendors ${dateRange.description}`,
    vendorBreakdown: vendorArray,
    topVendor: vendorArray[0] || null,
    period: dateRange.description,
    totalVendors: Object.keys(vendorBreakdown).length
  };
}

function analyzePatterns(transactions: any[], dateRange: any, params: DatabaseQueryParams) {
  // Group by date, weekday, or month based on groupBy parameter
  const groupBy = params.groupBy || 'date';
  const grouped: Record<string, number> = {};
  
  transactions.forEach(t => {
    let key: string;
    const date = new Date(t.date);
    
    switch (groupBy) {
      case 'weekday':
        key = date.toLocaleDateString('en-US', { weekday: 'long' });
        break;
      case 'month':
        key = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        break;
      default: // 'date'
        key = date.toDateString();
    }
    
    if (!grouped[key]) grouped[key] = 0;
    grouped[key] += Math.abs(t.amount);
  });
  
  const patterns = Object.entries(grouped)
    .map(([key, amount]) => ({ period: key, amount }))
    .sort((a, b) => b.amount - a.amount);
  
  return {
    type: 'pattern_analysis',
    summary: `Spending patterns by ${groupBy} ${dateRange.description}`,
    patterns,
    period: dateRange.description,
    groupBy,
    totalAmount: transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0)
  };
}

function listTransactions(transactions: any[], dateRange: any, params: DatabaseQueryParams) {
  const sortedTransactions = transactions
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, params.limit || 20);
  
  return {
    type: 'transaction_list',
    summary: `${sortedTransactions.length} transactions ${dateRange.description}`,
    transactions: sortedTransactions.map(formatTransaction),
    period: dateRange.description,
    totalCount: transactions.length
  };
}

function analyzeSummary(transactions: any[], dateRange: any, params: DatabaseQueryParams) {
  const expenses = transactions.filter(t => t.type === 'expense');
  const income = transactions.filter(t => t.type === 'income');
  
  const totalSpent = expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const totalIncome = income.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const netAmount = totalIncome - totalSpent;
  
  return {
    type: 'financial_summary',
    summary: `Financial overview ${dateRange.description}`,
    totalSpent,
    totalIncome,
    netAmount,
    expenseCount: expenses.length,
    incomeCount: income.length,
    categoryBreakdown: getCategoryBreakdown(expenses),
    period: dateRange.description
  };
}

function formatTransaction(t: any) {
  return {
    description: t.description,
    vendor: t.vendor,
    amount: Math.abs(t.amount),
    date: new Date(t.date).toLocaleDateString(),
    category: t.category,
    type: t.type
  };
}

// Helper function for category breakdown
function getCategoryBreakdown(transactions: any[]) {
  const categoryMap = new Map<string, number>();
  
  for (const t of transactions) {
    const category = t.category || 'Uncategorized';
    const amount = Math.abs(t.amount || 0);
    categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
  }
  
  return Array.from(categoryMap.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

// Test function removed - was causing noisy logs
