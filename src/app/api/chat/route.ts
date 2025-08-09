import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { TransactionCategory } from "@/lib/types/transaction";
import { parseTransactionText, parseCSVWithGemini, answerFinancialQuestion, categorizeTransaction } from "@/lib/api/gemini";
import logger from "@/lib/utils/logger";
import { convertAmount } from "@/lib/utils/currency";
import { CurrencyFormatter } from "@/lib/utils/currency-formatter";
import { detectLanguage } from "@/lib/utils/language-detection";
import { getServices } from "@/lib/services";
import { cookies } from "next/headers";

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

// Concise system prompt to reduce latency
const SYSTEM_PROMPT = `You are CoinMind, a concise financial assistant.
- Reply in the user's language.
- Default to concise answers. If the user asks for details or explanation, provide a more thorough answer.
- Use user's default currency unless another is specified: {defaultCurrency}.
- Total balance equals net cash flow (income - expenses).
- If user logs a transaction, confirm and stop.
- If user asks a financial question, answer directly with 1-3 bullet points unless they request details.

Snapshot: balance={balance}, income={income}, expenses={expenses}, txns={transactionCount}.`;

// Lightweight detector for response length preference
function detectLengthPreference(message: string): 'short' | 'long' | 'auto' {
  const m = message.toLowerCase();
  // English
  const shortHints = [
    'short', 'brief', 'tl;dr', 'summary', 'summarize', 'quick', 'one line', '1-3 bullets', 'bullets', 'concise'
  ];
  const longHints = [
    'long', 'detailed', 'details', 'explain', 'explanation', 'deep', 'comprehensive', 'elaborate', 'why', 'how'
  ];
  // Arabic
  const shortHintsAr = ['مختصر', 'باختصار', 'موجز', 'ملخص', 'سريع'];
  const longHintsAr = ['تفصيلي', 'بالتفصيل', 'موسع', 'اشرح', 'شرح'];

  if ([...shortHints, ...shortHintsAr].some(k => m.includes(k))) return 'short';
  if ([...longHints, ...longHintsAr].some(k => m.includes(k))) return 'long';
  return 'auto';
}

function maxTokensFor(pref: 'short' | 'long' | 'auto'): number {
  if (pref === 'short') return 140;
  if (pref === 'long') return 600;
  return 200; // default
}

// Heuristic inference for transaction type when AI omits it
function inferTransactionType(message: string): 'income' | 'expense' {
  const m = message.toLowerCase();
  // English hints
  const incomeHints = ['salary', 'paycheck', 'income', 'deposit', 'received', 'bonus', 'refund', 'reimbursement'];
  const expenseHints = ['spent', 'pay', 'paid', 'bought', 'buy', 'purchase', 'charge', 'charged', 'withdraw', 'withdrawal'];
  // Arabic hints
  const incomeHintsAr = ['راتب', 'دخل', 'ايداع', 'إيداع', 'حولت لي', 'حوّل لي', 'حوالة', 'مكافأة', 'استرجاع'];
  const expenseHintsAr = ['دفعت', 'اشتريت', 'صرف', 'صرفتها', 'سحبت', 'تحويل خرج'];

  if ([...incomeHints, ...incomeHintsAr].some(k => m.includes(k))) return 'income';
  if ([...expenseHints, ...expenseHintsAr].some(k => m.includes(k))) return 'expense';
  // Default to expense to be conservative
  return 'expense';
}

// Helper function to determine if user is asking about their financial data using AI
async function handleFinancialQueryWithLLM(message: string, userLanguage?: string): Promise<{ isFinancial: boolean; intent: string; response: string }> {
  try {
    const prompt = `You are a multilingual AI financial assistant.

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
${userLanguage ? `User language: ${userLanguage}` : ""}`;

    const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 512 } });
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
    // Parse request body once (avoid multiple reads of body stream)
    const payload = await request.json();
    const { message, type } = payload as { message: string; type?: string };
    const url = new URL(request.url);
    const stream = url.searchParams.get('stream') === '1';

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

        // Extract file information from already parsed payload
        const { fileInfo, previousFile } = (payload as any) || {};
        
        // Extract spreadsheet data from message
        const csvMatch = message.match(/Please analyze and import this spreadsheet file data:\n\n([\s\S]*)/);
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
          // Fast path: exact duplicate by name/size/mtime without AI
          if (
            previousFile.name === fileInfo.name &&
            previousFile.size === fileInfo.size &&
            previousFile.lastModified === fileInfo.lastModified
          ) {
            const fallbackMessage = `⚠️ Duplicate File Detected\n\n**File Details:**\n- Name: ${fileInfo.name}\n- Size: ${fileInfo.size} bytes\n- Type: ${fileInfo.type}\n\nPlease select a different file or wait a moment before uploading the same file again to avoid duplicate transactions.`;
            return NextResponse.json({
              success: true,
              data: {
                message: fallbackMessage,
                type: "duplicate_detected",
                isDuplicate: true,
              },
            });
          }
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
            const duplicateResponse = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: duplicatePrompt }] }], generationConfig: { maxOutputTokens: 256 } });
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
            const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: duplicatePrompt }] }], generationConfig: { maxOutputTokens: 256 } });
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
          } catch {
            // Fallback to simple message if AI fails
            const fallbackMessage = `⚠️ **Duplicate File Detected**

${aiExplanation}

**File Details:**
- Name: ${fileInfo.name}
- Size: ${fileInfo.size} bytes
- Type: ${fileInfo.type}

**Recommendation:** Please select a different file or wait a moment before uploading the same file again to avoid duplicate transactions.`;
            
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
        const confirmationMessage = `📄 **Spreadsheet Analysis Complete**

${result.preview}

Would you like me to import these transactions to your account?

**Click "Confirm" to import or "Cancel" to abort.**`;

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
      } catch {
        logger.error("CSV import failed");
        return NextResponse.json(
          {
            success: false,
            error: "CSV import failed",
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

        // Get services and user profile
        const uidCsv = (await cookies()).get('cm_uid')?.value;
        const { services, userId } = await getServices(uidCsv);
        const profile = await services.repositories.profiles.findById(userId);
        const defaultCurrency = profile?.defaultCurrency || "USD";

        let importedCount = 0;
        let failedCount = 0;

        // Import each transaction
        for (const transaction of result.transactions) {
          try {
            // Prefer currency parsed from CSV if available
            const csvCurrency = (transaction as any).currency || "USD";
            
            // Initialize conversion variables with default values
            let finalAmount = transaction.amount;
            let finalCurrency = csvCurrency;
            let conversionRate = 1;
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

            await services.transactions.createTransaction(userId, {
              amount: newTransaction.originalAmount,
              currency: newTransaction.originalCurrency,
              description: newTransaction.description,
              category: newTransaction.category,
              type: transaction.type, // ensure correct income/expense type
              date: newTransaction.date,
              vendor: newTransaction.vendor,
            });
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
        let successMessage = `✅ **Spreadsheet Import Complete**

Successfully imported **${importedCount}** transactions`;
        if (failedCount > 0) {
          successMessage += `
⚠️ Failed to import ${failedCount} transactions`;
        }
        successMessage += `

Your transactions have been added to your account. You can view them in the dashboard.`;

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
            error: `CSV import failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
          { status: 500 }
        );
      }
    }

    // Get services and financial data
    try {
      const uid = (await cookies()).get('cm_uid')?.value;
      const { services, userId } = await getServices(uid);
      // Faster summary via stats instead of fetching 1000 rows
      const stats = await services.transactions.getTransactionStats(userId);
      const income = stats.totalIncome || 0;
      const expenses = stats.totalExpenses || 0;
      const totalBalance = stats.netAmount ?? (income - expenses);

      // Get user's default currency for formatting
      const profile = await services.repositories.profiles.findById(userId);
      const defaultCurrency = profile?.defaultCurrency || "USD";
      
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
          // Fallback category classification if AI didn't provide one
          let fallbackCategory: TransactionCategory | undefined = parsedTransaction.category as TransactionCategory | undefined;
          if (!fallbackCategory) {
            try {
              fallbackCategory = await categorizeTransaction(parsedTransaction.description, parsedTransaction.vendor);
            } catch {
              fallbackCategory = 'Other';
            }
          }
          transactionInfo = {
            description: parsedTransaction.description,
            amount: parsedTransaction.amount,
            currency: parsedTransaction.currency,
            category: fallbackCategory || "Other",
            type:
              parsedTransaction.type || inferTransactionType(message),
            date: parsedTransaction.date, // Preserve the parsed date
            vendor: parsedTransaction.vendor,
          } as {
            description: string;
            amount: number;
            currency?: string;
            category: TransactionCategory;
            type: "income" | "expense";
            date?: Date;
            vendor?: string;
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
        // Add the transaction to the database
        try {
          // Get user's default currency
          const profile = await services.repositories.profiles.findById(userId);
          const defaultCurrency = profile?.defaultCurrency || "USD";

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



          await services.transactions.createTransaction(userId, {
            amount: transactionInfo.amount,
            currency: transactionCurrency,
            description: transactionInfo.description,
            category: transactionInfo.category,
            type: transactionInfo.type,
            date: transactionInfo.date,
            vendor: transactionInfo.vendor || "Unknown",
          });
          transactionAdded = true;

          // Fast success message without extra AI call
          const originalAmountStr = CurrencyFormatter.formatWithSymbol(
            Math.abs(transactionInfo.amount),
            transactionCurrency
          );
          const lang = detectLanguage(message).code;
          const categoryLabel = transactionInfo.category || 'Other';
          const hasVendor = Boolean(transactionInfo.vendor && transactionInfo.vendor !== 'Unknown');
          if (lang === 'ar') {
            responseText = hasVendor
              ? `✅ تم حفظ المعاملة بنجاح! **${originalAmountStr}** لدى ${transactionInfo.vendor}. الفئة: ${categoryLabel}.`
              : `✅ تم حفظ المعاملة بنجاح! **${originalAmountStr}**. الفئة: ${categoryLabel}.`;
          } else {
            responseText = hasVendor
              ? `✅ Added transaction successfully! **${originalAmountStr}** at ${transactionInfo.vendor}. Category: ${categoryLabel}.`
              : `✅ Added transaction successfully! **${originalAmountStr}**. Category: ${categoryLabel}.`;
          }
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

          // Fast error message without extra AI call
          const lang = detectLanguage(message).code;
          responseText = lang === 'ar'
            ? 'عذرًا، حدث خطأ أثناء حفظ المعاملة. يرجى المحاولة مرة أخرى.'
            : 'Sorry, there was an error adding the transaction. Please try again.';
        }
      }

      // If no transaction was added, first check if this is a financial query using AI-powered function calling
      if (!transactionAdded) {
        // Detect user's language first
        const detectedLanguage = detectLanguage(message);
        const lengthPref = detectLengthPreference(message);
        
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
            const financialAnswer = await answerFinancialQuestion(userId, message, detectedLanguage.code);
            
            return NextResponse.json({
              success: true,
              data: {
                // If user asked for short, trim to a compact answer
                message: lengthPref === 'short' ? financialAnswer.split('\n').slice(0, 6).join('\n') : financialAnswer,
                transactionAdded: false,
              },
            });
          } catch (error) {
            logger.error({ 
              error: error instanceof Error ? error.message : error,
              userId,
              message: message.substring(0, 100)
            }, 'Financial question processing failed');
            
            // Fall through to general AI response
          }
        }

        // Not a financial query → generate a general response now
        const lengthPrefTokens = maxTokensFor(lengthPref);
        const lengthInstruction = lengthPref === 'short'
          ? '\nKeep it brief: 1-3 short bullet points.\n'
          : lengthPref === 'long'
            ? '\nThe user wants details: provide a thorough but clear explanation.\n'
            : '';

        const prompt =
          SYSTEM_PROMPT
            .replace("{balance}", formattedBalance)
            .replace("{income}", formattedIncome)
            .replace("{expenses}", formattedExpenses)
            .replace("{transactionCount}", (stats.transactionCount || 0).toString())
            .replace("{defaultCurrency}", defaultCurrency) +
          `

User message: ${message}
${lengthInstruction}
Remember: Respond in the same language as the user's message.`;

        const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: lengthPrefTokens } });
        const response = await result.response;
        responseText = response.text();

        logger.info(
          {
            responseLength: responseText.length,
          },
          "Chat response generated successfully"
        );
      }

      if (!stream) {
        return NextResponse.json({
          success: true,
          data: {
            message: responseText,
            transactionAdded: transactionAdded,
          },
        });
      } else {
        // Simple text streaming (SSE-like) for faster first paint
        const encoder = new TextEncoder();
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(responseText));
            controller.close();
          }
        });
        return new Response(body, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
          },
        });
      }
    } catch (dbError) {
      logger.error(
        { error: dbError instanceof Error ? dbError.message : dbError },
        "Database error"
      );

      // Fallback response without database data
      const fallbackPrompt = `You are a smart financial assistant called CoinMind. The user said: "${message}". Please respond in the same language as the user's message and be helpful with financial advice.`;

      const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: fallbackPrompt }] }], generationConfig: { maxOutputTokens: 200 } });
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


