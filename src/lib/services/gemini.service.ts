import { GoogleGenAI } from '@google/genai';
import { TransactionRepository, ProfileRepository, CategoryRepository } from '../domain/repositories';
import { TransactionStats } from '../domain/repositories';
import { detectLanguage } from '../utils/language-detection';
import { formatCurrency } from '../utils/formatters';
import { getExchangeRate } from '../utils/currency';
import logger from '../utils/logger';
import { DatabaseFunctions } from './database-functions';

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
  private dbFunctions: DatabaseFunctions;

  constructor(
    private transactionRepo: TransactionRepository,
    private profileRepo: ProfileRepository,
    private categoryRepo: CategoryRepository,
    apiKey: string
  ) {
    this.aiClient = new GoogleGenAI({ apiKey });
    this.dbFunctions = new DatabaseFunctions(transactionRepo, profileRepo, categoryRepo);
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
      
      const amount = parsed.amount ? Math.abs(Number(parsed.amount)) : undefined; // Ensure positive
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
      const functionDetectionPrompt = `You are an advanced financial AI assistant with deep analytical capabilities. The user asked: "${question}"

AVAILABLE POWERFUL DATABASE FUNCTIONS:

**Transaction Queries:**
- get_transactions_by_type: List transactions by type (income/expense) with date ranges
- get_transactions_by_vendor: List transactions by vendor with filtering
- get_transactions_by_category: List transactions by category with date ranges
- get_recent_transactions: List transactions for yesterday/today or last N days

**Analytics & Insights:**
- get_category_count: Get the number of unique categories used
- get_vendor_count: Get the number of unique vendors
- get_spending_analysis: Analyze spending patterns (daily, weekly, monthly, overall)
- get_income_vs_expenses: Compare income and expenses with savings rate
- get_top_spending_categories: Show top spending categories with amounts
- get_spending_trends: Show spending trends (monthly/weekly) with change analysis
- get_budget_analysis: Analyze spending against budget limits
- get_spending_comparison: Compare spending between two periods
- get_financial_health_metrics: Get comprehensive financial health score and metrics
- get_balance: Get current balance (income - expenses)

**Legacy Functions (for compatibility):**
- get_transaction_summary: Get summary of transaction statistics
- get_spending_by_category: Get spending breakdown by category
- get_spending_by_vendor: Get spending breakdown by vendor

**SMART QUERY CAPABILITIES:**
You can combine multiple functions to answer complex questions like:
- "How much did I spend on food vs entertainment this month?"
- "Show me my spending patterns for the last 3 months"
- "What's my average daily spending and how does it compare to last week?"
- "Which vendors do I spend the most with?"
- "Am I saving enough money?"
- "What are my top 5 spending categories?"
- "Show me my income vs expenses for this year"
- "How many different categories do I use?"
- "What did I spend money on yesterday and today?"
- "Show me my spending trends over time"
- "Which days of the week do I spend the most?"
- "What percentage of my income goes to bills?"
- "Am I spending more than I'm earning?"
- "Show me my net worth trend"
- "What's my biggest expense category?"
- "How much do I spend on average per transaction?"
- "Show me transactions from specific vendors like 'Amazon' or 'Starbucks'"
- "What's my spending breakdown by category for this month?"
- "Show me my income sources"
- "What's my savings rate?"
- "Compare my spending this month vs last month"
- "Show me my highest and lowest spending days"
- "What categories do I spend the most on?"
- "How much do I spend on dining vs groceries?"
- "Show me my spending by day of the week"
- "What's my average transaction amount?"
- "Show me my biggest single transactions"
- "How much do I spend on transportation vs entertainment?"
- "What's my financial health score?"
- "Am I over budget in any categories?"
- "Compare my spending this quarter vs last quarter"
- "What's my spending concentration (am I too focused on one vendor/category)?"
- "Show me my budget analysis for this month"
- "What's my net worth trend over the last 6 months?"
- "How diverse is my spending across categories?"
- "What's my biggest spending day this month?"
- "Show me my spending efficiency (high vs low value transactions)"
- "What percentage of my spending goes to essential vs discretionary items?"
- "How does my spending compare to typical patterns?"
- "What's my financial wellness score?"
- "Show me my spending velocity (daily/weekly/monthly averages)"
- "What are my spending hotspots (categories/vendors with highest frequency)?"
- "How much do I spend on subscriptions vs one-time purchases?"
- "What's my spending seasonality (monthly patterns)?"
- "Show me my spending optimization opportunities"
- "What's my cash flow analysis (income timing vs expense timing)?"
- "How much do I spend on digital vs physical purchases?"
- "What's my spending risk profile (concentration analysis)?"

**CONTEXT INFORMATION:**
- User ID: ${userId}
- Default currency: ${defaultCurrency}
- Current date: ${new Date().toISOString().split('T')[0]}
- Date format: YYYY-MM-DD
- All amounts are in user's default currency

**FUNCTION PARAMETER FORMATS:**
- Date parameters: Use YYYY-MM-DD format (e.g., "2025-07-01")
- For get_spending_comparison: Use period1_start, period1_end, period2_start, period2_end
- For date ranges: Use start_date, end_date
- For categories: Use category parameter
- For vendors: Use vendor parameter
- For limits: Use limit parameter (number)

**ANALYSIS INSTRUCTIONS:**
1. For comparison questions, use multiple functions and combine results
2. For trend questions, use get_spending_trends or get_spending_analysis
3. For category questions, use get_top_spending_categories or get_spending_by_category
4. For vendor questions, use get_transactions_by_vendor or get_spending_by_vendor
5. For time-based questions, use get_recent_transactions with appropriate days
6. For insight questions, combine multiple functions for comprehensive analysis

Determine what data you need to answer the user's question comprehensively. Return ONLY a JSON array of function calls:

[
  {
    "function": "function_name",
    "args": {
      "arg1": "value1",
      "arg2": "value2"
    }
  }
]

Be smart about combining functions to provide the most insightful answer possible.`;
      
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
      const finalPrompt = `You are an advanced financial AI assistant. The user asked: "${question}"

Function Results:
${functionResults.map(r => `${r.name}: ${r.error ? `Error: ${r.error}` : JSON.stringify(r.result, null, 2)}`).join('\n\n')}

**RESPONSE REQUIREMENTS:**
1. **Be Comprehensive**: Analyze all the data and provide deep insights
2. **Be Specific**: Use exact numbers and percentages when available
3. **Be Actionable**: Provide practical advice and recommendations
4. **Be Conversational**: Use natural, friendly language in ${userLanguage}
5. **Format Currency**: Format all amounts nicely (e.g., "$1,234.56")
6. **Provide Context**: Compare data when possible (e.g., "This is 15% higher than last month")
7. **Identify Patterns**: Point out interesting trends or anomalies
8. **Give Recommendations**: Suggest ways to improve financial health
9. **Ask Follow-up Questions**: Suggest related questions the user might want to ask

**ANALYSIS GUIDELINES:**
- If comparing categories, highlight the biggest differences
- If showing trends, explain what the data means
- If showing spending patterns, suggest optimization opportunities
- If showing income vs expenses, discuss savings potential
- If showing vendor data, identify spending habits
- If showing time-based data, point out patterns (weekends, weekdays, etc.)

**BALANCE CALCULATION RULES:**
- Net Balance = Total Income - Total Expenses
- NEVER add income + expenses together
- Positive net amount means you have money left over
- Negative net amount means you spent more than you earned
- When asked for "balance", always use the net_amount field
- Format balance as currency (e.g., "Your balance is $150.00")

**EXAMPLE INSIGHTS TO PROVIDE:**
- "Your biggest spending category is X, accounting for Y% of your total expenses"
- "You're spending Z% more on X this month compared to last month"
- "Your average daily spending is $X, which is above/below your typical pattern"
- "You have X unique vendors, with Y being your most frequent"
- "Your savings rate is X%, which is [good/needs improvement]"
- "Consider reducing spending on X to save $Y per month"

Respond in a helpful, insightful, and actionable way that makes the user feel empowered about their financial decisions.`;

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
      // Map AI parameter names to function parameter names
      const mappedArgs = { ...args };
      
      // Handle parameter name mappings
      if (args.transaction_type) {
        mappedArgs.type = args.transaction_type;
        delete mappedArgs.transaction_type;
      }
      if (args.category_name) {
        mappedArgs.category = args.category_name;
        delete mappedArgs.category_name;
      }
      if (args.vendor_name) {
        mappedArgs.vendor = args.vendor_name;
        delete mappedArgs.vendor_name;
      }
      
      // Handle spending comparison parameter mappings
      if (args.period1_start_date) {
        mappedArgs.period1_start = args.period1_start_date;
        delete mappedArgs.period1_start_date;
      }
      if (args.period1_end_date) {
        mappedArgs.period1_end = args.period1_end_date;
        delete mappedArgs.period1_end_date;
      }
      if (args.period2_start_date) {
        mappedArgs.period2_start = args.period2_start_date;
        delete mappedArgs.period2_start_date;
      }
      if (args.period2_end_date) {
        mappedArgs.period2_end = args.period2_end_date;
        delete mappedArgs.period2_end_date;
      }
      
      switch (functionName) {
        case 'get_transactions_by_type':
          return await this.dbFunctions.getTransactionsByType(userId, mappedArgs);
        case 'get_transactions_by_vendor':
          return await this.dbFunctions.getTransactionsByVendor(userId, mappedArgs);
        case 'get_transactions_by_category':
          return await this.dbFunctions.getTransactionsByCategory(userId, mappedArgs);
        case 'get_recent_transactions':
          return await this.dbFunctions.getRecentTransactions(userId, mappedArgs);
        case 'get_category_count':
          return await this.dbFunctions.getCategoryCount(userId, mappedArgs);
        case 'get_vendor_count':
          return await this.dbFunctions.getVendorCount(userId, mappedArgs);
        case 'get_spending_analysis':
          return await this.dbFunctions.getSpendingAnalysis(userId, mappedArgs);
        case 'get_income_vs_expenses':
          return await this.dbFunctions.getIncomeVsExpenses(userId, mappedArgs);
        case 'get_top_spending_categories':
          return await this.dbFunctions.getTopSpendingCategories(userId, mappedArgs);
        case 'get_spending_trends':
          return await this.dbFunctions.getSpendingTrends(userId, mappedArgs);
        case 'get_budget_analysis':
          return await this.dbFunctions.getBudgetAnalysis(userId, mappedArgs);
        case 'get_spending_comparison':
          return await this.dbFunctions.getSpendingComparison(userId, mappedArgs);
        case 'get_financial_health_metrics':
          return await this.dbFunctions.getFinancialHealthMetrics(userId, mappedArgs);
        case 'get_balance':
          return await this.dbFunctions.getBalance(userId, mappedArgs);
        // Legacy/compatibility:
        case 'get_transaction_summary':
          return await this.getTransactionSummary(userId, mappedArgs);
        case 'get_spending_by_category':
          return await this.getSpendingByCategory(userId, mappedArgs);
        case 'get_spending_by_vendor':
          return await this.getSpendingByVendor(userId, mappedArgs);
        default:
          throw new Error(`Unknown function: ${functionName}`);
      }
    } catch (error) {
      const endTime = Date.now();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ 
        functionName, 
        args, 
        error: errorMessage,
        duration: endTime - startTime
      }, 'Function execution failed');
      
      // Return a more user-friendly error response
      return {
        success: false,
        error: errorMessage,
        data: null,
        query_description: `Failed to execute ${functionName}`
      };
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