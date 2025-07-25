import { NextRequest, NextResponse } from 'next/server';
import { getServices } from '@/lib/services';
import { validateTransactionInput } from '@/lib/utils/parsers';
import logger from '@/lib/utils/logger';

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  logger.info({ requestId, method: 'GET', url: request.url }, 'Transactions API request started');
  
  try {
    const { services, userId } = await getServices();
    
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search');
    const targetCurrency = searchParams.get('currency');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    
    let startDate: Date | undefined = undefined;
    let endDate: Date | undefined = undefined;
    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      endDate = new Date(endDateParam);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json({ success: false, error: 'Invalid startDate or endDate' }, { status: 400 });
      }
    }
    
    logger.info({ requestId, limit, offset, search, targetCurrency, userId }, 'Fetching transactions with parameters');
    
    let transactions;
    
    if (search) {
      transactions = await services.transactions.searchTransactions(userId, search, limit);
      logger.info({ requestId, search, resultCount: transactions.length }, 'Search completed');
    } else if (startDate && endDate) {
      transactions = await services.transactions.findByDateRange(userId, startDate, endDate);
      logger.info({ requestId, startDate, endDate, resultCount: transactions.length }, 'Fetched transactions by date range');
    } else {
      transactions = await services.transactions.getTransactions(userId, limit, offset);
      logger.info({ requestId, resultCount: transactions.length }, 'Fetched all transactions');
    }

    // If a target currency is specified, convert all transactions to that currency
    if (targetCurrency) {
      logger.info({ requestId, targetCurrency, transactionCount: transactions.length }, 'Starting currency conversion for transactions');
      const { getGlobalRates, convertWithGlobalRates } = await import('@/lib/utils/currency');
      // Fetch all rates with a single API call (base USD)
      let ratesObj;
      try {
        ratesObj = await getGlobalRates('USD');
      } catch (e) {
        logger.warn({ requestId, error: e instanceof Error ? e.message : e }, 'Global rates fetch failed, falling back to batch conversion');
        // Fallback to per-transaction conversion since each transaction may have different source currency
        const { convertAmount } = await import('@/lib/utils/currency');
        const convertedAmounts = await Promise.all(transactions.map(async (t: any) => {
          // Use original currency if available, otherwise use the main currency
          const originalAmount = t.originalAmount || Number(t.amount);
          const originalCurrency = t.originalCurrency || t.currency;
          if (originalCurrency === targetCurrency) {
            return originalAmount;
          }
          try {
            return await convertAmount(originalAmount, originalCurrency, targetCurrency);
          } catch {
            return originalAmount;
          }
        }));
        transactions = transactions.map((t: any, i: number) => ({
          ...t,
          amount: convertedAmounts[i], // Update the main amount to show converted value
          currency: targetCurrency, // Update the main currency to show target currency
          convertedAmount: convertedAmounts[i],
          convertedCurrency: targetCurrency
        }));
        return NextResponse.json({
          success: true,
          data: transactions
        });
      }
      const { rates, base } = ratesObj;
      logger.info({ requestId, targetCurrency, ratesCount: Object.keys(rates).length }, 'Currency conversion rates loaded');
      
      transactions = transactions.map((t: any) => {
        // Use original currency if available, otherwise use the main currency
        const origAmount = t.originalAmount || Number(t.amount);
        const origCurrency = t.originalCurrency || t.currency;
        let converted = origAmount;
        try {
          converted = convertWithGlobalRates(origAmount, origCurrency, targetCurrency, rates, base);
          logger.debug({ 
            requestId, 
            originalAmount: origAmount, 
            originalCurrency: origCurrency, 
            targetCurrency, 
            convertedAmount: converted 
          }, 'Transaction converted successfully');
        } catch (e) {
          logger.warn({ 
            requestId, 
            error: e instanceof Error ? e.message : e, 
            originalAmount: origAmount,
            originalCurrency: origCurrency,
            targetCurrency
          }, 'Global cross-rate conversion failed, using original amount');
        }
        return {
          ...t,
          amount: converted, // Update the main amount to show converted value
          currency: targetCurrency, // Update the main currency to show target currency
          convertedAmount: converted,
          convertedCurrency: targetCurrency
        };
      });
      
      logger.info({ 
        requestId, 
        targetCurrency, 
        convertedCount: transactions.length,
        sampleConversion: transactions[0] ? {
          originalAmount: transactions[0].originalAmount,
          originalCurrency: transactions[0].originalCurrency,
          convertedAmount: transactions[0].convertedAmount,
          convertedCurrency: transactions[0].convertedCurrency
        } : null
      }, 'Currency conversion completed');
    }
    
    // Get total count for pagination
    let totalCount = 0;
    let hasMore = false;
    
    if (!search) {
      // For regular queries, we can estimate based on returned results
      totalCount = offset + transactions.length;
      hasMore = transactions.length === limit; // If we got exactly the limit, there might be more
    } else {
      // For search, use the returned length (not ideal but works)
      totalCount = transactions.length;
      hasMore = false;
    }

    return NextResponse.json({
      success: true,
      data: transactions,
      pagination: {
        limit,
        offset,
        totalCount,
        hasMore
      }
    });
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.error({ 
      requestId, 
      error: error instanceof Error ? error.message : error,
      duration 
    }, 'Failed to fetch transactions');
    
    return NextResponse.json(
      { success: false, error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  } finally {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.info({ requestId, duration }, 'GET transactions request completed');
  }
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  logger.info({ requestId, method: 'POST', url: request.url }, 'Create transaction request started');
  
  try {
    const { services, userId } = await getServices();
    
    const body = await request.json();
    
    logger.info({ requestId, bodyKeys: Object.keys(body), userId }, 'Transaction creation data received');
    
    const transactionInput = validateTransactionInput(body);
    
    if (!transactionInput) {
      logger.warn({ requestId, body }, 'Invalid transaction data provided');
      return NextResponse.json(
        { success: false, error: 'Invalid transaction data' },
        { status: 400 }
      );
    }
    
    // Ensure amount is defined for the service
    const serviceInput = {
      ...transactionInput,
      amount: transactionInput.amount || 0
    };
    
    const transaction = await services.transactions.createTransaction(userId, serviceInput);
    
    if (!transaction) {
      logger.error({ requestId }, 'Failed to create transaction - service returned null');
      return NextResponse.json(
        { success: false, error: 'Failed to create transaction' },
        { status: 500 }
      );
    }
    
    logger.info({ 
      requestId, 
      transactionId: transaction.id, 
      amount: transaction.amount,
      description: transaction.description 
    }, 'Transaction created successfully');
    
    return NextResponse.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.error({ 
      requestId, 
      error: error instanceof Error ? error.message : error,
      duration 
    }, 'Failed to create transaction');
    
    return NextResponse.json(
      { success: false, error: 'Failed to create transaction' },
      { status: 500 }
    );
  } finally {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.info({ requestId, duration }, 'POST transaction request completed');
  }
} 