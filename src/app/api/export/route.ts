import { NextRequest, NextResponse } from 'next/server';
import { getServices } from '@/lib/services';
import { ExportService, ExportOptions } from '@/lib/services/export.service';
import logger from '@/lib/utils/logger';

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  logger.info({ requestId, method: 'POST', url: request.url }, 'Export API request started');
  
  try {
    // Prefer client user id from cookie to avoid creating a new anonymous user
    const cookieUserId = request.cookies.get('cm_uid')?.value;
    const { services, userId } = await getServices(cookieUserId);
    
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const options: ExportOptions = body.options;
    
    logger.info({ requestId, options, userId, cookieUserId }, 'Export options received');

    // Validate required options
    if (!options.format || !options.dateRange || !options.viewType) {
      return NextResponse.json(
        { success: false, error: 'Missing required export options' },
        { status: 400 }
      );
    }

    // Fetch all transactions for the user
    const transactions = await services.transactions.getTransactions(userId, 10000, 0);
    
    logger.info({ requestId, transactionCount: transactions.length }, 'Transactions fetched for export');

    // Create export service instance
    const exportService = new ExportService();
    
    // Perform export
    const result = await exportService.export(transactions, options);
    
    logger.info({ 
      requestId, 
      format: options.format, 
      filename: result.filename,
      dataSize: result.data instanceof Uint8Array ? result.data.length : result.data.length 
    }, 'Export completed successfully');

    // Return the exported file
    const headers = new Headers();
    headers.set('Content-Type', getContentType(options.format));
    headers.set('Content-Disposition', `attachment; filename="${result.filename}"`);
    
    if (result.data instanceof Uint8Array) {
      return new NextResponse(result.data, {
        status: 200,
        headers
      });
    } else {
      return new NextResponse(result.data, {
        status: 200,
        headers: {
          ...Object.fromEntries(headers.entries()),
          'Content-Type': 'text/csv'
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
    }, 'Export failed');
    
    return NextResponse.json(
      { success: false, error: 'Export failed' },
      { status: 500 }
    );
  } finally {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.info({ requestId, duration }, 'Export request completed');
  }
}

function getContentType(format: string): string {
  switch (format) {
    case 'pdf':
      return 'application/pdf';
    case 'excel':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'csv':
      return 'text/csv';
    default:
      return 'application/octet-stream';
  }
} 