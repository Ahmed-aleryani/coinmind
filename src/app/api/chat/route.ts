import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { transactionDb, initDatabase } from "@/lib/db/schema";

import { TransactionCategory } from "@/lib/types/transaction";
import { parseTransactionText, parseCSVWithGemini, answerFinancialQuestion } from "@/lib/api/gemini";
import logger from "@/lib/utils/logger";
import { userSettingsDb } from "@/lib/db/schema";
import { convertAmount } from "@/lib/utils/currency";
import { CurrencyFormatter } from "@/lib/utils/currency-formatter";
import { validateTransaction, sanitizeTransaction } from "@/lib/utils/validation";
import { detectLanguage } from "@/lib/utils/language-detection";

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Enhanced system prompt for advanced, context-aware financial assistance
const SYSTEM_PROMPT = `You are CoinMind, an intelligent and proactive financial assistant. Your mission is to help users manage, understand, and optimize their personal finances with clarity and empathy.

User's current financial snapshot:
- Total balance: {balance}
- Total income: {income}
- Total expenses: {expenses}
- Number of transactions: {transactionCount}
- Default currency: {defaultCurrency}

Guidelines for interaction:
1. **CRITICAL**: Always reply in the same language as the user's message. If the user writes in Arabic, respond in Arabic. If they write in Spanish, respond in Spanish, etc.
2. Offer practical, actionable, and money-conscious financial advice.
3. When parsing transactions, extract the currency if mentioned; otherwise, default to the user's currency.
4. Provide insightful analysis on spending patterns, budgeting, and overall financial health.
5. Ask clarifying questions if the user's input is ambiguous or incomplete.
6. Use a friendly, professional tone, and adapt to the user's cultural context.
7. Format all currency amounts using the user's default currency unless another is specified.
8. Proactively suggest follow-up questions and personalized recommendations based on the user's financial context.
9. If the user asks about financial goals, savings, or investments, offer tailored suggestions and encouragement.
10. If you detect signs of financial stress or concern, respond with empathy and supportive advice.

Currency handling:
- If user mentions a currency in their message, use that currency
- If no currency mentioned, use the default currency: {defaultCurrency}
- When user provides different currency than default, system will handle exchange rate conversion

Response examples:
- "Great! I've added your $50 grocery expense. You've spent $240 on food this month—still within your usual range."
- "Perfect! Recorded your €25 coffee expense. That's your 4th coffee this week—maybe time for a coffee budget? ☕"
- "Your balance is {balance}. That's a healthy financial position! Would you like tips on investing the surplus?"
- "I've noticed your entertainment spending increased by 20% this month. Would you like to review your budget or set a limit?"
- "Would you like to set a savings goal or receive tips on reducing expenses in a specific category?"

**IMPORTANT**: The user's message language determines your response language. Match their language exactly.`;

// Currency formatting is now handled by the unified CurrencyFormatter utility

// Helper functions removed - LLM handles time period parsing naturally

// LLM generates follow-up questions contextually

// LLM handles financial advice detection

// LLM provides financial advice contextually

// Let the LLM determine, handle, and answer user's finance-related queries in the user's language.
// This function delegates the entire financial query detection and response to the LLM.
async function handleFinancialQueryWithLLM(message: string, userLanguage?: string): Promise<{ isFinancial: boolean; intent: string; response: string }> {
  try {
    // Compose a prompt that instructs the LLM to:
    // 1. Detect if the message is about finance.
    // 2. Identify the user's intent.
    // 3. Return a JSON object with isFinancial and intent only.
    const prompt = `
You are a multilingual AI financial assistant.

Analyze the following user message and:
1. Determine if it is a financial query (about money, expenses, income, transactions, spending, etc.).
2. Identify the specific intent (see categories below).

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

User message: "${message}"
${userLanguage ? `User language: ${userLanguage}` : ""}
`;

    const result = await model.generateContent(prompt);
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
      if (
        typeof parsed.isFinancial === 'boolean' &&
        typeof parsed.intent === 'string'
      ) {
        return {
          isFinancial: parsed.isFinancial,
          intent: parsed.intent,
          response: "" // No response here - let answerFinancialQuestion handle the actual response
        };
      }
    } catch (parseError) {
      logger.warn({ text, parseError }, 'Failed to parse AI financial query response');
    }

    // Fallback if JSON parsing fails
    return {
      isFinancial: false,
      intent: "unknown",
      response: ""
    };
  } catch (error) {
    logger.error({ error }, 'Financial query handling failed');
    return {
      isFinancial: false,
      intent: "unknown",
      response: ""
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

    // Let AI handle language detection naturally
    logger.info("Processing message - AI will detect language automatically");

    // Handle CSV import requests
    if (type === "csv_import") {
      try {
        logger.info("Processing CSV import request");

        // Extract file information from request body
        const { fileInfo, previousFile } = await request.json();
        
        // Extract spreadsheet data from message
        const csvMatch = message.match(
          /Please analyze and import this spreadsheet file data:\n\n([\s\S]*)/
        );
        if (!csvMatch) {
          logger.error("No spreadsheet data found in message");
          return NextResponse.json(
            {
              success: false,
              error: "Invalid CSV import request format",
            },
            { status: 400 }
          );
        }

        const csvText = csvMatch[1];
        logger.info({ csvTextLength: csvText.length, csvTextPreview: csvText.substring(0, 200) }, "Extracted spreadsheet data");
        
        // Use AI to analyze if this is a duplicate file
        let duplicateAnalysis = "";
        if (previousFile) {
          const duplicatePrompt = `You are a multilingual AI assistant analyzing file uploads. 

Analyze if this file upload is a duplicate:

Current file: ${fileInfo.name} (${fileInfo.size} bytes, modified: ${new Date(fileInfo.lastModified).toISOString()})
Previous file: ${previousFile.name} (${previousFile.size} bytes, modified: ${new Date(previousFile.lastModified).toISOString()})

Consider:
1. File names (exact match or similar)
2. File sizes (identical or very close)
3. Modification times (same or very close)
4. File content similarity

**Language Detection & Response:**
- Analyze the file name and content to determine the user's language preference
- Respond in the same language as the file name or content
- Be culturally sensitive and user-friendly
- Consider the natural language patterns in the file name

**Response Format:**
- Start with "DUPLICATE:" or "NEW_FILE:" followed by your analysis
- Provide explanation in the detected language
- Include specific details about why the file is considered duplicate or different

Analyze and respond naturally in the appropriate language:`;

          try {
            const duplicateResponse = await model.generateContent(duplicatePrompt);
            duplicateAnalysis = duplicateResponse.response.text();
            logger.info({ duplicateAnalysis }, "AI duplicate analysis completed");
          } catch (error) {
            logger.warn({ error }, "AI duplicate analysis failed, proceeding with import");
          }
        }

        // Check if AI detected a duplicate
        if (duplicateAnalysis.includes("DUPLICATE")) {
          // Extract the AI's explanation and use it directly
          const aiExplanation = duplicateAnalysis.replace(/^DUPLICATE:\s*/i, '').trim();
          
          // Let the AI handle the complete response naturally
          const duplicatePrompt = `You are a multilingual AI assistant. The AI analysis found a duplicate file:

File: ${fileInfo.name} (${fileInfo.size} bytes, type: ${fileInfo.type})
AI Analysis: ${aiExplanation}

Generate a complete, user-friendly duplicate detection message in the same language as the file name. Include:
- A clear warning about the duplicate
- File details
- Recommendation to select a different file

Respond naturally in the appropriate language based on the file name and AI analysis.`;

          try {
            const result = await model.generateContent(duplicatePrompt);
            const response = await result.response;
            const duplicateMessage = response.text();
            
            return NextResponse.json({
              success: true,
              data: {
                message: duplicateMessage,
                type: "duplicate_detected",
                isDuplicate: true,
              },
            });
          } catch (error) {
            // Fallback to simple message if AI fails
            const fallbackMessage = `⚠️ **Duplicate File Detected**\n\n${aiExplanation}\n\n**File Details:**\n- Name: ${fileInfo.name}\n- Size: ${fileInfo.size} bytes\n- Type: ${fileInfo.type}\n\n**Recommendation:** Please select a different file or wait a moment before uploading the same file again to avoid duplicate transactions.`;
            
            return NextResponse.json({
              success: true,
              data: {
                message: fallbackMessage,
                type: "duplicate_detected",
                isDuplicate: true,
              },
            });
          }
        }
        
        const result = await parseCSVWithGemini(csvText);

        // Return preview for user confirmation
        const confirmationMessage = `📄 **Spreadsheet Analysis Complete**\n\n${result.preview}\n\nWould you like me to import these transactions to your account?\n\n**Click "Confirm" to import or "Cancel" to abort.**`;

        return NextResponse.json({
          success: true,
          data: {
            message: confirmationMessage,
            type: "csv_preview",
            requiresConfirmation: true,
            suggestions: ["Confirm Import", "Cancel Import"],
            fileInfo: fileInfo, // Return file info for tracking
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

        // Extract spreadsheet data from message
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
        let successMessage = `✅ **Spreadsheet Import Complete**\n\n`;
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
      const formattedBalance = CurrencyFormatter.format(totalBalance, defaultCurrency);
      const formattedIncome = CurrencyFormatter.format(income, defaultCurrency);
      const formattedExpenses = CurrencyFormatter.format(expenses, defaultCurrency);

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
          const updatedFormattedBalance = CurrencyFormatter.format(
            updatedBalance,
            defaultCurrency
          );

          // Create success message in the detected language
          const originalAmountStr = CurrencyFormatter.formatWithSymbol(
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
          },
          "Chat response generated successfully"
        );
      }

      // Check if this is a financial query using AI-powered function calling
      if (!transactionAdded) {
        // Detect user's language first
        const detectedLanguage = detectLanguage(message);
        
        // Determine if user is asking about their financial data using AI
        const queryAnalysis = await handleFinancialQueryWithLLM(message, detectedLanguage.code);
        
        logger.info({ 
          message: message.substring(0, 100),
          isFinancial: queryAnalysis.isFinancial,
          intent: queryAnalysis.intent
        }, 'Intent analysis completed');
        
        if (queryAnalysis.isFinancial) {
          logger.info({ message: message.substring(0, 100) }, 'Processing financial query with AI function calling');
          
          // Always use answerFinancialQuestion for financial queries since it has access to the database
          try {
            // Detect user's language from the message
            const detectedLanguage = detectLanguage(message);
            const financialAnswer = await answerFinancialQuestion(message, detectedLanguage.code);
            
            return NextResponse.json({
              success: true,
              data: {
                message: financialAnswer,
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
          // Handle unknown intent - let AI generate appropriate response
          const unknownPrompt = SYSTEM_PROMPT
            .replace("{balance}", formattedBalance)
            .replace("{income}", formattedIncome)
            .replace("{expenses}", formattedExpenses)
            .replace("{transactionCount}", transactions.length.toString())
            .replace("{defaultCurrency}", defaultCurrency) +
            `\n\nUser message: ${message}\n\nI couldn't understand what the user is asking for. Generate a helpful response asking them to clarify their question. Respond in the same language as the user's message.`;
          
          try {
            const result = await model.generateContent(unknownPrompt);
            const response = await result.response;
            const unknownMessage = response.text();
            
            return NextResponse.json({
              success: true,
              data: {
                message: unknownMessage,
                transactionAdded: false,
              },
            });
          } catch (error) {
            // Fallback to simple message
            return NextResponse.json({
              success: true,
              data: {
                message: "I couldn't understand what you're asking for. Could you clarify your question?",
                transactionAdded: false,
              },
            });
          }
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          message: responseText,
          transactionAdded: transactionAdded,
        },
      });
    } catch (dbError) {
      logger.error(
        { error: dbError instanceof Error ? dbError.message : dbError },
        "Database error"
      );

      // Fallback response without database data
      const fallbackPrompt = `You are a smart financial assistant called CoinMind. The user said: "${message}". Please respond in the same language as the user's message and be helpful with financial advice.`;

      const result = await model.generateContent(fallbackPrompt);
      const response = await result.response;
      const text = response.text();

      return NextResponse.json({
        success: true,
        data: {
          message: text,
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


