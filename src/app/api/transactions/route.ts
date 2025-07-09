import { NextRequest, NextResponse } from 'next/server';
import { transactionDb, initDatabase } from '@/lib/db/schema';
import { validateTransactionInput } from '@/lib/utils/parsers';
import logger from '@/lib/utils/logger';

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  logger.info({ requestId, method: 'GET', url: request.url }, 'Transactions API request started');
  
  try {
    initDatabase();
    
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search');
    const targetCurrency = searchParams.get('currency');
    
    logger.info({ requestId, limit, offset, search, targetCurrency }, 'Fetching transactions with parameters');
    
    let transactions;
    
    if (search) {
      transactions = transactionDb.search(search, limit);
      logger.info({ requestId, search, resultCount: transactions.length }, 'Search completed');
    } else {
      transactions = transactionDb.getAll(limit, offset);
      logger.info({ requestId, resultCount: transactions.length }, 'Fetched all transactions');
    }

    // If a target currency is specified, convert all transactions to that currency
    if (targetCurrency) {
      const { getGlobalRates, convertWithGlobalRates } = await import('@/lib/utils/currency');
      // Fetch all rates with a single API call (base USD)
      let ratesObj;
      try {
        ratesObj = await getGlobalRates('USD');
      } catch (e) {
        logger.warn({ requestId, error: e instanceof Error ? e.message : e }, 'Global rates fetch failed, falling back to batch conversion');
        // Fallback to previous batch method
        const { batchConvertAmounts } = await import('@/lib/utils/currency');
        const items = transactions.map((t: any) => ({
          amount: t.originalAmount || t.amount,
          from: t.originalCurrency || targetCurrency
        }));
        let convertedAmounts: number[] = [];
        try {
          convertedAmounts = await batchConvertAmounts(items, targetCurrency);
        } catch (e) {
          logger.warn({ requestId, error: e instanceof Error ? e.message : e }, 'Batch currency conversion failed, falling back to per-transaction');
          const { convertAmount } = await import('@/lib/utils/currency');
          convertedAmounts = await Promise.all(transactions.map(async (t: any) => {
            if (!t.originalAmount || !t.originalCurrency || t.originalCurrency === targetCurrency) {
              return t.originalAmount || t.amount;
            }
            try {
              return await convertAmount(t.originalAmount, t.originalCurrency, targetCurrency);
            } catch {
              return t.originalAmount || t.amount;
            }
          }));
        }
        transactions = transactions.map((t: any, i: number) => ({
          ...t,
          convertedAmount: convertedAmounts[i],
          convertedCurrency: targetCurrency
        }));
        return NextResponse.json({
          success: true,
          data: transactions
        });
      }
      const { rates, base } = ratesObj;
      transactions = transactions.map((t: any) => {
        const origAmount = t.originalAmount || t.amount;
        const origCurrency = t.originalCurrency || targetCurrency;
        let converted = origAmount;
        try {
          converted = convertWithGlobalRates(origAmount, origCurrency, targetCurrency, rates, base);
        } catch (e) {
          logger.warn({ requestId, error: e instanceof Error ? e.message : e, t }, 'Global cross-rate conversion failed, using original amount');
        }
        return {
          ...t,
          convertedAmount: converted,
          convertedCurrency: targetCurrency
        };
      });
    }
    
    return NextResponse.json({
      success: true,
      data: transactions
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
    initDatabase();
    
    const body = await request.json();
    
    logger.info({ requestId, bodyKeys: Object.keys(body) }, 'Transaction creation data received');
    
    const transactionInput = validateTransactionInput(body);
    
    if (!transactionInput) {
      logger.warn({ requestId, body }, 'Invalid transaction data provided');
      return NextResponse.json(
        { success: false, error: 'Invalid transaction data' },
        { status: 400 }
      );
    }
    
    const transaction = await transactionDb.create(transactionInput);
    
    if (!transaction) {
      logger.error({ requestId }, 'Failed to create transaction - database returned null');
      return NextResponse.json(
        { success: false, error: 'Failed to create transaction' },
        { status: 500 }
      );
    }
    
    logger.info({ 
      requestId, 
      transactionId: transaction.id, 
      amount: transaction.amount,
      category: transaction.category 
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