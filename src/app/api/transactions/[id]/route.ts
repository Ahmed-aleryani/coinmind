import { NextRequest, NextResponse } from 'next/server';
import { getServices } from '@/lib/services';
import { validateTransactionInput } from '@/lib/utils/parsers';
import logger from '@/lib/utils/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  logger.info({ requestId, method: 'GET', url: request.url }, 'Get transaction by ID request started');
  
  try {
    const { services, userId } = await getServices();
    const resolvedParams = await params;
    
    logger.info({ requestId, transactionId: resolvedParams.id, userId }, 'Fetching transaction by ID');
    
    const transactionId = parseInt(resolvedParams.id);
    if (isNaN(transactionId)) {
      logger.warn({ requestId, transactionId: resolvedParams.id }, 'Invalid transaction ID');
      return NextResponse.json(
        { success: false, error: 'Invalid transaction ID' },
        { status: 400 }
      );
    }
    
    const transaction = await services.transactions.getTransaction(userId, transactionId);
    
    if (!transaction) {
      logger.warn({ requestId, transactionId: resolvedParams.id, userId }, 'Transaction not found');
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 }
      );
    }
    
    logger.info({ requestId, transactionId: resolvedParams.id, userId }, 'Transaction fetched successfully');
    
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
    }, 'Failed to fetch transaction');
    
    return NextResponse.json(
      { success: false, error: 'Failed to fetch transaction' },
      { status: 500 }
    );
  } finally {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.info({ requestId, duration }, 'GET transaction by ID request completed');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  logger.info({ requestId, method: 'PUT', url: request.url }, 'Update transaction request started');
  
  try {
    const { services, userId } = await getServices();
    const resolvedParams = await params;
    
    const body = await request.json();
    
    logger.info({ 
      requestId, 
      transactionId: resolvedParams.id, 
      updateKeys: Object.keys(body),
      userId 
    }, 'Transaction update data received');
    
    const transactionId = parseInt(resolvedParams.id);
    if (isNaN(transactionId)) {
      logger.warn({ requestId, transactionId: resolvedParams.id }, 'Invalid transaction ID');
      return NextResponse.json(
        { success: false, error: 'Invalid transaction ID' },
        { status: 400 }
      );
    }
    
    const updates = validateTransactionInput(body);
    
    if (!updates) {
      logger.warn({ requestId, transactionId: resolvedParams.id, body }, 'Invalid transaction update data');
      return NextResponse.json(
        { success: false, error: 'Invalid transaction data' },
        { status: 400 }
      );
    }
    
    const transaction = await services.transactions.updateTransaction(userId, transactionId, updates);
    
    if (!transaction) {
      logger.warn({ requestId, transactionId: resolvedParams.id, userId }, 'Transaction not found for update');
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 }
      );
    }
    
    logger.info({ 
      requestId, 
      transactionId: resolvedParams.id,
      updatedFields: Object.keys(updates),
      userId
    }, 'Transaction updated successfully');
    
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
    }, 'Failed to update transaction');
    
    return NextResponse.json(
      { success: false, error: 'Failed to update transaction' },
      { status: 500 }
    );
  } finally {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.info({ requestId, duration }, 'PUT transaction request completed');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  logger.info({ requestId, method: 'DELETE', url: request.url }, 'Delete transaction request started');
  
  try {
    const { services, userId } = await getServices();
    const resolvedParams = await params;
    
    logger.info({ requestId, transactionId: resolvedParams.id, userId }, 'Deleting transaction');
    
    const transactionId = parseInt(resolvedParams.id);
    if (isNaN(transactionId)) {
      logger.warn({ requestId, transactionId: resolvedParams.id }, 'Invalid transaction ID');
      return NextResponse.json(
        { success: false, error: 'Invalid transaction ID' },
        { status: 400 }
      );
    }
    
    const success = await services.transactions.deleteTransaction(userId, transactionId);
    
    if (!success) {
      logger.warn({ requestId, transactionId: resolvedParams.id, userId }, 'Transaction not found for deletion');
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 }
      );
    }
    
    logger.info({ requestId, transactionId: resolvedParams.id, userId }, 'Transaction deleted successfully');
    
    return NextResponse.json({
      success: true,
      data: { message: 'Transaction deleted successfully' }
    });
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.error({ 
      requestId, 
      error: error instanceof Error ? error.message : error,
      duration 
    }, 'Failed to delete transaction');
    
    return NextResponse.json(
      { success: false, error: 'Failed to delete transaction' },
      { status: 500 }
    );
  } finally {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.info({ requestId, duration }, 'DELETE transaction request completed');
  }
} 