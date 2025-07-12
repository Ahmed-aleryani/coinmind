import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { transactionDb, initDatabase } from "@/lib/db/schema";
import {
  detectLanguage,
} from "@/lib/utils/language-detection";
import { TransactionCategory } from "@/lib/types/transaction";
import { parseTransactionText, parseCSVWithGemini, answerFinancialQuestion } from "@/lib/api/gemini";
import logger from "@/lib/utils/logger";
import { userSettingsDb } from "@/lib/db/schema";
import { convertAmount } from "@/lib/utils/currency";

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Enhanced system prompt that guides LLM on proper financial assistance
const SYSTEM_PROMPT = `You are CoinMind, a smart financial assistant. Your task is to help users manage their personal finances.

Current financial information:
- Total balance: {balance}
- Total income: {income}
- Total expenses: {expenses}
- Transaction count: {transactionCount}
- User's default currency: {defaultCurrency}

Important rules:
1. Always respond in the same language as the user's message
2. Be helpful and money-conscious with practical financial advice
3. When parsing transactions, extract currency if mentioned, otherwise assume user's default currency
4. Provide contextual insights about spending patterns, budgeting, and financial health
5. Ask clarifying questions when user input is unclear
6. Use friendly, professional language with appropriate cultural context
7. Format currency amounts using the user's default currency unless specified otherwise
8. Generate natural follow-up questions and suggestions based on financial context

Currency handling:
- If user mentions a currency in their message, use that currency
- If no currency mentioned, use the default currency: {defaultCurrency}
- When user provides different currency than default, system will handle exchange rate conversion

Response examples:
- "Great! I've added your $50 grocery expense. You've spent $240 on food this month - still within your usual range."
- "Perfect! Recorded your €25 coffee expense. That's your 4th coffee this week - maybe time for a coffee budget? ☕"
- "Your balance is {balance}. That's a healthy financial position! Would you like tips on investing the surplus?"`;

// Helper function to format currency based on currency code
function formatCurrencyByCode(amount: number, currencyCode: string): string {
  const currencyFormats: Record<string, { locale: string; currency: string }> =
    {
      USD: { locale: "en-US", currency: "USD" },
      EUR: { locale: "de-DE", currency: "EUR" },
      SAR: { locale: "ar-SA", currency: "SAR" },
      GBP: { locale: "en-GB", currency: "GBP" },
      JPY: { locale: "ja-JP", currency: "JPY" },
      CNY: { locale: "zh-CN", currency: "CNY" },
      KRW: { locale: "ko-KR", currency: "KRW" },
      INR: { locale: "hi-IN", currency: "INR" },
      RUB: { locale: "ru-RU", currency: "RUB" },
      TRY: { locale: "tr-TR", currency: "TRY" },
      PLN: { locale: "pl-PL", currency: "PLN" },
      SEK: { locale: "sv-SE", currency: "SEK" },
      DKK: { locale: "da-DK", currency: "DKK" },
      NOK: { locale: "no-NO", currency: "NOK" },
      ILS: { locale: "he-IL", currency: "ILS" },
      IRR: { locale: "fa-IR", currency: "IRR" },
      PKR: { locale: "ur-PK", currency: "PKR" },
    };

  const format = currencyFormats[currencyCode] || currencyFormats.USD;

  try {
    return new Intl.NumberFormat(format.locale, {
      style: "currency",
      currency: format.currency,
    }).format(amount);
  } catch (error) {
    // Fallback to USD
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  }
}

// Helper functions removed - LLM handles time period parsing naturally

// LLM generates follow-up questions contextually

// LLM handles financial advice detection

// LLM provides financial advice contextually

// Helper function to determine if user is asking about financial data using AI
async function determineIfFinancialQuery(message: string): Promise<{ isFinancial: boolean; intent: string }> {
  try {
    const intentDetectionPrompt = `You are an AI assistant that identifies user intent in financial conversations. 

Analyze the following user message and determine:
1. Is this a financial query (asking about money, expenses, income, transactions, spending, etc.)?
2. What is the specific intent?

User message: "${message}"

Respond with ONLY a raw JSON object (no markdown formatting) in this exact format:
{
  "isFinancial": true/false,
  "intent": "specific_intent_here"
}

Intent categories:
- "balance_inquiry" - asking about current balance
- "spending_analysis" - asking about spending patterns/amounts
- "income_analysis" - asking about income/earnings
- "transaction_list" - asking to see transactions
- "category_breakdown" - asking about spending by category
- "vendor_analysis" - asking about spending at specific vendors
- "financial_advice" - asking for financial tips/advice
- "transaction_entry" - trying to add/record a transaction
- "general_financial" - other financial questions
- "unknown" - unclear what they want, even after analysis
- "non_financial" - not related to finances

Be strict - only return isFinancial: true if it's clearly about finances.`;

    const result = await model.generateContent(intentDetectionPrompt);
    const response = await result.response;
    const text = response.text().trim();

    // Try to parse JSON response - handle both raw JSON and markdown-wrapped JSON
    try {
      let jsonText = text;
      
      // Check if response is wrapped in markdown code blocks
      const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
      }
      
      const parsed = JSON.parse(jsonText);
      if (typeof parsed.isFinancial === 'boolean' && typeof parsed.intent === 'string') {
        return {
          isFinancial: parsed.isFinancial,
          intent: parsed.intent
        };
      }
    } catch (parseError) {
      logger.warn({ text, parseError }, 'Failed to parse AI intent detection response');
    }

    // Fallback if JSON parsing fails
    return {
      isFinancial: false,
      intent: "unknown"
    };
  } catch (error) {
    logger.error({ error }, 'Intent detection failed');
    return {
      isFinancial: false,
      intent: "unknown"
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { message, language, type } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Check if Gemini API key is configured
    if (!process.env.GEMINI_API_KEY) {
      logger.error("GEMINI_API_KEY not configured");
      return NextResponse.json(
        {
          error:
            "AI service not configured. Please set GEMINI_API_KEY environment variable.",
        },
        { status: 500 }
      );
    }

    // Use provided language or detect it
    let detectedLanguage;
    if (language && typeof language === "string") {
      // Use the language provided by frontend
      detectedLanguage = {
        code: language,
        name: language,
        isRTL: ["ar", "he", "fa", "ur"].includes(language),
      };
      logger.info(
        { detectedLanguage: detectedLanguage.code },
        "Language provided by frontend"
      );
    } else {
      // Fallback to server-side detection
      detectedLanguage = detectLanguage(message);
      logger.info(
        { detectedLanguage: detectedLanguage.code },
        "Language detected by server"
      );
    }

    // Handle CSV import requests
    if (type === "csv_import") {
      try {
        logger.info("Processing CSV import request");

        // Extract CSV data from message
        const csvMatch = message.match(
          /Please analyze and import this CSV file data:\n\n([\s\S]*)/
        );
        if (!csvMatch) {
          return NextResponse.json(
            {
              success: false,
              error: "Invalid CSV import request format",
            },
            { status: 400 }
          );
        }

        const csvText = csvMatch[1];
        const result = await parseCSVWithGemini(csvText);

        // Return preview for user confirmation
        const confirmationMessage = `📄 **CSV Analysis Complete**\n\n${result.preview}\n\nWould you like me to import these transactions to your account?\n\n**Click "Confirm" to import or "Cancel" to abort.**`;

        return NextResponse.json({
          success: true,
          data: {
            message: confirmationMessage,
            type: "csv_preview",
            requiresConfirmation: true,
            suggestions: ["Confirm Import", "Cancel Import"],
          },
        });
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : error },
          "CSV import failed"
        );
        return NextResponse.json(
          {
            success: false,
            error: `CSV import failed: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
          { status: 500 }
        );
      }
    }

    // Handle CSV import confirmation
    if (type === "csv_import_confirm") {
      try {
        logger.info("Processing CSV import confirmation");

        // Extract CSV data from message
        const csvMatch = message.match(/Process CSV import: ([\s\S]*)/);
        if (!csvMatch) {
          return NextResponse.json(
            {
              success: false,
              error: "Invalid CSV import confirmation format",
            },
            { status: 400 }
          );
        }

        const csvText = csvMatch[1];
        const result = await parseCSVWithGemini(csvText);

        // Initialize database
        initDatabase();

        // Get user's default currency
        const userSettings = userSettingsDb.get() || { defaultCurrency: "USD" };
        const defaultCurrency = userSettings.defaultCurrency || "USD";

        let importedCount = 0;
        let failedCount = 0;

        // Import each transaction
        for (const transaction of result.transactions) {
          try {
            // Convert amount to user's default currency if needed
            let finalAmount = transaction.amount;
            let finalCurrency = defaultCurrency;
            let conversionRate = 1;

            // For now, assume CSV amounts are in USD
            const csvCurrency = "USD";
            if (csvCurrency !== defaultCurrency) {
              try {
                const converted = await convertAmount(
                  Math.abs(transaction.amount),
                  csvCurrency,
                  defaultCurrency
                );
                finalAmount = transaction.amount < 0 ? -converted : converted;
                conversionRate = converted / Math.abs(transaction.amount);
                finalCurrency = defaultCurrency;
              } catch (conversionError) {
                logger.warn(
                  {
                    error:
                      conversionError instanceof Error
                        ? conversionError.message
                        : conversionError,
                    fromCurrency: csvCurrency,
                    toCurrency: defaultCurrency,
                  },
                  "Currency conversion failed for CSV import, using original amount"
                );
                finalAmount = transaction.amount;
                finalCurrency = csvCurrency;
                conversionRate = 1;
              }
            }

            // Create transaction record
            const newTransaction = {
              description: transaction.description,
              originalAmount: Math.abs(transaction.amount),
              originalCurrency: csvCurrency,
              convertedAmount: finalAmount,
              convertedCurrency: finalCurrency,
              conversionRate: conversionRate,
              conversionFee: 0,
              category: transaction.category as TransactionCategory,
              date: transaction.date,
              type: transaction.type,
              vendor: transaction.vendor || "CSV Import",
            };

            transactionDb.create(newTransaction);
            importedCount++;
          } catch (transactionError) {
            logger.error(
              {
                error:
                  transactionError instanceof Error
                    ? transactionError.message
                    : transactionError,
                transaction,
              },
              "Failed to import individual transaction"
            );
            failedCount++;
          }
        }

        // Create success message
        let successMessage = `✅ **CSV Import Complete**\n\n`;
        successMessage += `Successfully imported **${importedCount}** transactions`;
        if (failedCount > 0) {
          successMessage += `\n⚠️ Failed to import ${failedCount} transactions`;
        }
        successMessage += `\n\nYour transactions have been added to your account. You can view them in the dashboard.`;

        return NextResponse.json({
          success: true,
          data: {
            message: successMessage,
            type: "csv_success",
          },
        });
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : error },
          "CSV import confirmation failed"
        );
        return NextResponse.json(
          {
            success: false,
            error: `CSV import failed: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          },
          { status: 500 }
        );
      }
    }

    // Initialize database and get financial data
    try {
      initDatabase();
      const transactions = transactionDb.getAll();

      const totalBalance = transactions.reduce(
        (sum: number, t: any) => sum + (t.amount || 0),
        0
      );
      const income = transactions
        .filter((t: any) => (t.amount || 0) > 0)
        .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
      const expenses = Math.abs(
        transactions
          .filter((t: any) => (t.amount || 0) < 0)
          .reduce((sum: number, t: any) => sum + (t.amount || 0), 0)
      );

      // Get user's default currency for formatting
      const userSettings = userSettingsDb.get() || { defaultCurrency: "USD" };
      const defaultCurrency = userSettings.defaultCurrency || "USD";
      
      // Format currency using user's default currency
      const formattedBalance = formatCurrencyByCode(totalBalance, defaultCurrency);
      const formattedIncome = formatCurrencyByCode(income, defaultCurrency);
      const formattedExpenses = formatCurrencyByCode(expenses, defaultCurrency);

      // Check if the message contains transaction information using AI-powered parsing
      let responseText = "";
      let transactionAdded = false;
      let transactionInfo = null;

      try {
        // Use AI-powered transaction parsing with multi-language support
        const parsedTransaction = await parseTransactionText(message);

        if (
          parsedTransaction.amount !== undefined &&
          parsedTransaction.description
        ) {
          transactionInfo = {
            description: parsedTransaction.description,
            amount: parsedTransaction.amount,
            currency: parsedTransaction.currency,
            category: parsedTransaction.category || "Other",
            type:
              parsedTransaction.type ||
              (parsedTransaction.amount > 0 ? "income" : "expense"),
            date: parsedTransaction.date, // Preserve the parsed date
          } as {
            description: string;
            amount: number;
            currency?: string;
            category: TransactionCategory;
            type: "income" | "expense";
            date?: Date;
          };
        }
      } catch (parseError) {
        logger.warn(
          {
            error:
              parseError instanceof Error ? parseError.message : parseError,
          },
          "AI transaction parsing failed, falling back to keyword detection"
        );
        // No fallback - rely solely on AI parsing for transaction detection
      }

      if (transactionInfo) {
        // Use currency from AI parsing or default currency - no language-based detection
        // Add the transaction to the database
        try {
          // Get user's default currency
          const userSettings = userSettingsDb.get() || {
            defaultCurrency: "USD",
          };
          const defaultCurrency = userSettings.defaultCurrency || "USD";

          // Extract currency from parsed transaction or use default
          const transactionCurrency =
            transactionInfo.currency || defaultCurrency;
          let finalAmount = transactionInfo.amount;
          let finalCurrency = transactionCurrency;
          let conversionRate = 1;

          // Convert to user's default currency if different
          if (transactionCurrency !== defaultCurrency) {
            try {
              const converted = await convertAmount(
                transactionInfo.amount,
                transactionCurrency,
                defaultCurrency
              );
              conversionRate = converted / transactionInfo.amount;
              finalAmount = converted;
              finalCurrency = defaultCurrency;
            } catch (conversionError) {
              logger.warn(
                {
                  error:
                    conversionError instanceof Error
                      ? conversionError.message
                      : conversionError,
                  fromCurrency: transactionCurrency,
                  toCurrency: defaultCurrency,
                },
                "Currency conversion failed, using original amount"
              );
              // Keep original amount if conversion fails
              finalAmount = transactionInfo.amount;
              finalCurrency = transactionCurrency;
              conversionRate = 1;
            }
          }

          // Create transaction with new multi-currency fields
          const newTransaction = {
            description: transactionInfo.description,
            originalAmount: transactionInfo.amount,
            originalCurrency: transactionCurrency,
            convertedAmount: finalAmount,
            convertedCurrency: finalCurrency,
            conversionRate: conversionRate,
            conversionFee: 0, // No fee for now
            category: transactionInfo.category as TransactionCategory,
            date: transactionInfo.date || new Date(), // Use parsed date from AI
            type:
              transactionInfo.type ||
              ((transactionInfo.amount > 0 ? "income" : "expense") as
                | "income"
                | "expense"),
            vendor: "Chat Input",
          };

          transactionDb.create(newTransaction);
          transactionAdded = true;

          // Get updated financial data
          const updatedTransactions = transactionDb.getAll();
          const updatedBalance = updatedTransactions.reduce(
            (sum: number, t: any) => sum + (t.convertedAmount || t.amount || 0),
            0
          );
          const updatedFormattedBalance = formatCurrencyByCode(
            updatedBalance,
            defaultCurrency
          );

          // Create success message in the detected language
          // Helper to get currency symbol by code
          function getCurrencySymbol(code: string): string {
            const symbols: Record<string, string> = {
              USD: "$",
              EUR: "€",
              GBP: "£",
              JPY: "¥",
              SAR: "ر.س",
              EGP: "£",
              AED: "د.إ",
              KWD: "د.ك",
              BHD: "ب.د",
              JOD: "د.ا",
              CNY: "¥",
              KRW: "₩",
              INR: "₹",
              RUB: "₽",
              TRY: "₺",
              PLN: "zł",
              SEK: "kr",
              NOK: "kr",
              DKK: "kr",
              MAD: "د.م",
              DZD: "دج",
              TND: "د.ت",
              QAR: "ر.ق",
              LBP: "ل.ل",
              YER: "ر.ي", // Yemeni Rial
            };
            return symbols[code] || code;
          }

          // Format number in English numerals
          function formatNumberEn(num: number): string {
            return num.toLocaleString("en-US", {
              maximumFractionDigits: 2,
              minimumFractionDigits: 2,
            });
          }

          // Format number in English numerals, then append currency symbol
          function formatAmountWithSymbol(num: number, code: string): string {
            return `${formatNumberEn(num)}${getCurrencySymbol(code)}`;
          }

          const originalAmountStr = formatAmountWithSymbol(
            Math.abs(transactionInfo.amount),
            transactionCurrency
          );

          // Let AI generate a natural success message
          const transactionSuccessPrompt = SYSTEM_PROMPT
            .replace("{balance}", formattedBalance)
            .replace("{income}", formattedIncome) 
            .replace("{expenses}", formattedExpenses)
            .replace("{transactionCount}", (transactions.length + 1).toString())
            .replace("{defaultCurrency}", defaultCurrency) +
            `\n\nUser message: ${message}\n\nA transaction has been successfully added:\n- Description: ${transactionInfo.description}\n- Amount: ${originalAmountStr}\n- Category: ${transactionInfo.category}\n- Type: ${transactionInfo.type}\n- Date: ${transactionInfo.date?.toDateString() || new Date().toDateString()}\n\nGenerate a natural, friendly response acknowledging the transaction was added. Include helpful insights or suggestions if appropriate. Respond in the same language as the user's message.\n\nExamples:\n- "Great! I've added your $6 coffee purchase to your expenses. That's your 3rd coffee this week - maybe time for a coffee budget? ☕"\n- "Perfect! Recorded your $50 grocery expense. You've spent $240 on food this month so far."\n- "Got it! Added your $2000 salary to your income. Your balance is looking healthy this month! 💰"\n- "Nice! Your $15 lunch expense has been saved. Food spending is at $180 this week - still within your usual range."`;

          // Generate AI success message

          const result = await model.generateContent(transactionSuccessPrompt);
          const response = await result.response;
          responseText = response.text();
        } catch (transactionError) {
          logger.error(
            {
              error:
                transactionError instanceof Error
                  ? transactionError.message
                  : transactionError,
            },
            "Transaction addition error"
          );

          // Let AI generate a natural error message
          const transactionErrorPrompt = SYSTEM_PROMPT
            .replace("{balance}", formattedBalance)
            .replace("{income}", formattedIncome) 
            .replace("{expenses}", formattedExpenses)
            .replace("{transactionCount}", transactions.length.toString())
            .replace("{defaultCurrency}", defaultCurrency) +
            `\n\nUser message: ${message}\n\nThere was an error while trying to add the transaction. Generate a helpful, apologetic response acknowledging the error and suggesting the user try again. Respond in the same language as the user's message.\n\nExamples:\n- "Sorry, I had trouble adding that transaction. Could you try again? Sometimes rephrasing helps!"\n- "Oops! Something went wrong while saving your transaction. Please try again."\n- "I apologize, but I couldn't save that transaction. Could you try entering it again?"`;

          // Generate AI error message

          try {
            const result = await model.generateContent(transactionErrorPrompt);
            const response = await result.response;
            responseText = response.text();
          } catch (aiError) {
            // Fallback to simple error message if AI fails
            responseText = "Sorry, there was an error adding the transaction. Please try again.";
          }
        }
      }

      // If no transaction was detected or added, use the regular AI response
      if (!transactionAdded) {
        // Use the simple English system prompt

        const prompt =
          SYSTEM_PROMPT
            .replace("{balance}", formattedBalance)
            .replace("{income}", formattedIncome)
            .replace("{expenses}", formattedExpenses)
            .replace("{transactionCount}", transactions.length.toString())
            .replace("{defaultCurrency}", defaultCurrency) +
          `\n\nUser message: ${message}\n\nRemember: Respond in the same language as the user's message.`;

        // Send chat request to Gemini

        const result = await model.generateContent(prompt);
        const response = await result.response;
        responseText = response.text();

        logger.info(
          {
            responseLength: responseText.length,
            detectedLanguage: detectedLanguage.code,
          },
          "Chat response generated successfully"
        );
      }

      // Check if this is a financial query using AI-powered function calling
      if (!transactionAdded) {
        // Determine if user is asking about their financial data
        const queryAnalysis = await determineIfFinancialQuery(message);
        
        logger.info({ 
          message: message.substring(0, 100),
          isFinancial: queryAnalysis.isFinancial,
          intent: queryAnalysis.intent
        }, 'Intent analysis completed');
        
        if (queryAnalysis.isFinancial) {
          logger.info({ message: message.substring(0, 100) }, 'Processing financial query with AI function calling');
          
          try {
            const financialAnswer = await answerFinancialQuestion(message, detectedLanguage.code);
            
        return NextResponse.json({
          success: true,
          data: {
                message: financialAnswer,
                detectedLanguage: detectedLanguage.code,
            isRTL: detectedLanguage.isRTL,
            transactionAdded: false,
          },
        });
          } catch (error) {
            logger.error({ 
              error: error instanceof Error ? error.message : error,
              message: message.substring(0, 100)
            }, 'Financial query processing failed, falling back to general response');
            
            // Fall through to general AI response
          }
        } else if (queryAnalysis.intent === "unknown") {
          // Handle unknown intent - respond with "unknown" message
          const unknownMessage = detectedLanguage.code === "ar" 
            ? "غير معروف - لم أتمكن من فهم ما تريد. هل يمكنك توضيح سؤالك أكثر؟"
            : detectedLanguage.code === "es"
            ? "Desconocido - No pude entender lo que quieres. ¿Podrías aclarar tu pregunta?"
            : "Unknown - I couldn't understand what you're asking for. Could you clarify your question?";
          
        return NextResponse.json({
          success: true,
          data: {
              message: unknownMessage,
            detectedLanguage: detectedLanguage.code,
            isRTL: detectedLanguage.isRTL,
            transactionAdded: false,
          },
        });
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          message: responseText,
          detectedLanguage: detectedLanguage.code,
          isRTL: detectedLanguage.isRTL,
          transactionAdded: transactionAdded,
        },
      });
    } catch (dbError) {
      logger.error(
        { error: dbError instanceof Error ? dbError.message : dbError },
        "Database error"
      );

      // Fallback response without database data
      const fallbackPrompt = `You are a smart financial assistant called CoinMind. The user said: "${message}". Please respond in ${detectedLanguage.name} (${detectedLanguage.code}) and be helpful with financial advice.`;

      const result = await model.generateContent(fallbackPrompt);
      const response = await result.response;
      const text = response.text();

      return NextResponse.json({
        success: true,
        data: {
          message: text,
          detectedLanguage: detectedLanguage.code,
          isRTL: detectedLanguage.isRTL,
        },
      });
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : error },
      "Chat API error"
    );
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process chat message. Please try again.",
      },
      { status: 500 }
    );
  }
}

// Removed extractTransactionFromMessage - LLM handles all transaction parsing


