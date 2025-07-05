import { NextRequest, NextResponse } from 'next/server';
import { parseTransactionText, detectIntent, queryTransactions, parseCSVWithGemini } from '@/lib/api/gemini';
import { transactionDb, initDatabase } from '@/lib/db/schema';
import { validateTransactionInput } from '@/lib/utils/parsers';
import logger from '@/lib/utils/logger';

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  logger.info({ requestId, url: request.url }, 'Chat API request started');
  
  try {
    // Initialize database
    initDatabase();
    
    const { message, type } = await request.json();
    
    logger.info({ requestId, message: message?.substring(0, 100), type }, 'Chat request received');
    
    if (!message || typeof message !== 'string') {
      logger.warn({ requestId, message, type }, 'Invalid message in chat request');
      return NextResponse.json(
        { success: false, error: 'Message is required' },
        { status: 400 }
      );
    }

    // Handle CSV import requests
    if (type === 'csv_import') {
      logger.info({ requestId }, 'Processing CSV import request');
      try {
        const csvData = await parseCSVWithGemini(message);
        
        logger.info({ 
          requestId, 
          transactionCount: csvData.transactions.length, 
          requiresConfirmation: csvData.requiresConfirmation 
        }, 'CSV parsing completed successfully');
        
        return NextResponse.json({
          success: true,
          data: {
            message: `📊 **CSV Analysis Complete!**\n\n${csvData.preview}\n\nI found ${csvData.transactions.length} transactions. Here's a preview of the first few:\n\n${csvData.transactions.slice(0, 3).map((t, i) => `${i + 1}. ${t.description} - ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(t.amount))} (${t.category})`).join('\n')}\n\nWould you like me to import all these transactions?`,
            type: 'csv_preview',
            requiresConfirmation: csvData.requiresConfirmation,
            suggestions: ['Yes, import all transactions', 'No, cancel import']
          }
        });
      } catch (error) {
        logger.error({ requestId, error: error instanceof Error ? error.message : error }, 'CSV parsing failed');
        return NextResponse.json({
          success: true,
          data: {
            message: `❌ Error analyzing CSV: ${error instanceof Error ? error.message : 'Unknown error'}. Please make sure your CSV contains transaction data with columns like Date, Description, and Amount.`,
            type: 'error'
          }
        });
      }
    }

    // Handle CSV import confirmation
    if (type === 'csv_import_confirm') {
      logger.info({ requestId }, 'Processing CSV import confirmation');
      try {
        const csvData = await parseCSVWithGemini(message.replace('Process CSV import: ', ''));
        
        logger.info({ requestId, transactionCount: csvData.transactions.length }, 'Starting CSV transaction import');
        
        let successCount = 0;
        let errorCount = 0;
        const errors: string[] = [];

        // Import transactions one by one
        for (const transaction of csvData.transactions) {
          try {
            const transactionInput = validateTransactionInput({
              amount: transaction.amount,
              vendor: transaction.vendor,
              description: transaction.description,
              date: transaction.date,
              category: transaction.category,
              type: transaction.type
            });

            if (transactionInput) {
              const result = transactionDb.create(transactionInput);
              if (result) {
                successCount++;
              } else {
                errorCount++;
                errors.push(`Failed to create transaction: ${transaction.description}`);
              }
            } else {
              errorCount++;
              errors.push(`Invalid transaction data: ${transaction.description}`);
            }
          } catch (error) {
            errorCount++;
            errors.push(`Import error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        logger.info({ 
          requestId, 
          successCount, 
          errorCount, 
          totalProcessed: csvData.transactions.length 
        }, 'CSV import completed');
        
        return NextResponse.json({
          success: true,
          data: {
            message: `✅ **CSV Import Complete!**\n\n📊 **Results:**\n- Successfully imported: ${successCount} transactions\n- Errors: ${errorCount}\n- Total processed: ${csvData.transactions.length}\n\n${errorCount > 0 ? `\n⚠️ **Errors encountered:**\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n... and ${errors.length - 5} more` : ''}` : ''}`,
            type: 'import_complete',
            suggestions: successCount > 0 ? ['Show me my dashboard', 'View all transactions'] : []
          }
        });
      } catch (error) {
        logger.error({ requestId, error: error instanceof Error ? error.message : error }, 'CSV import failed');
        return NextResponse.json({
          success: true,
          data: {
            message: `❌ Error importing CSV: ${error instanceof Error ? error.message : 'Unknown error'}`,
            type: 'error'
          }
        });
      }
    }

    // Detect user intent
    const intent = await detectIntent(message);
    
    logger.info({ requestId, intent }, 'User intent detected');
    
    if (intent === 'create') {
      // Parse transaction from natural language
      logger.info({ requestId }, 'Processing transaction creation');
      try {
        const parsed = await parseTransactionText(message);
        
        if (parsed.amount === undefined) {
          logger.warn({ requestId, parsed }, 'No amount detected in transaction text');
          return NextResponse.json({
            success: true,
            data: {
              message: "I couldn't detect an amount in your message. Could you please specify how much you spent or earned?",
              type: 'clarification'
            }
          });
        }

        // Create transaction input
        const transactionInput = validateTransactionInput({
          amount: parsed.amount,
          vendor: parsed.vendor,
          description: parsed.description || message,
          date: parsed.date,
          category: parsed.category
        });

        if (!transactionInput) {
          logger.warn({ requestId, parsed }, 'Invalid transaction input after validation');
          return NextResponse.json({
            success: true,
            data: {
              message: "I had trouble processing that transaction. Could you try rephrasing it?",
              type: 'error'
            }
          });
        }

        // Save to database
        const transaction = transactionDb.create(transactionInput);
        
        if (transaction) {
          logger.info({ 
            requestId, 
            transactionId: transaction.id, 
            amount: transaction.amount, 
            category: transaction.category 
          }, 'Transaction created successfully');
          
          return NextResponse.json({
            success: true,
            data: {
              message: `✅ Transaction added! ${transaction.description} for ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(transaction.amount))} in ${transaction.category}.`,
              transaction: {
                id: transaction.id,
                amount: transaction.amount,
                vendor: transaction.vendor,
                description: transaction.description,
                category: transaction.category,
                date: transaction.date
              },
              type: 'transaction_created'
            }
          });
        } else {
          throw new Error('Failed to create transaction');
        }
      } catch (error) {
        logger.error({ requestId, error: error instanceof Error ? error.message : error }, 'Transaction creation failed');
        return NextResponse.json({
          success: true,
          data: {
            message: "I had trouble creating that transaction. Please try again or check if your Gemini API key is configured correctly.",
            type: 'error'
          }
        });
      }
    } else if (intent === 'query') {
      // Query existing transactions
      logger.info({ requestId }, 'Processing transaction query');
      try {
        const transactions = transactionDb.getAll(100);
        const response = await queryTransactions(message, transactions as unknown as Record<string, unknown>[]);
        
        logger.info({ requestId, transactionCount: transactions.length }, 'Transaction query completed');
        
        return NextResponse.json({
          success: true,
          data: {
            message: response,
            type: 'query_response'
          }
        });
      } catch (error) {
        logger.error({ requestId, error: error instanceof Error ? error.message : error }, 'Transaction query failed');
        return NextResponse.json({
          success: true,
          data: {
            message: "I had trouble analyzing your transactions. Please make sure your Gemini API key is configured correctly.",
            type: 'error'
          }
        });
      }
    } else {
      // Help intent
      logger.info({ requestId }, 'Providing help response');
      
      const helpMessage = `Hi! I can help you track your finances. Here are some things you can try:

💰 **Add transactions**: "I bought lunch for $12", "Got paid $2000 salary"
📊 **Ask questions**: "How much did I spend this month?", "What's my biggest expense category?"
📈 **Get insights**: "Show me my spending trends", "Am I saving money?"

You can also upload receipts or import CSV files from your bank. What would you like to do?`;

      return NextResponse.json({
        success: true,
        data: {
          message: helpMessage,
          type: 'help',
          suggestions: [
            "I bought coffee for $5",
            "How much did I spend this month?",
            "Show me my food expenses",
            "Upload a receipt"
          ]
        }
      });
    }
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.error({ 
      requestId, 
      error: error instanceof Error ? error.message : error, 
      duration 
    }, 'Chat API request failed');
    
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.info({ requestId, duration }, 'Chat API request completed');
  }
} 