import { NextRequest, NextResponse } from 'next/server';
import { migrateToMultiCurrency, rollbackMigration, getMigrationStatus } from '@/lib/db/migration';
import { db } from '@/lib/db/db';
import { sql } from 'drizzle-orm';
import logger from '@/lib/utils/logger';

export async function GET() {
  try {
    const status = getMigrationStatus();
    
    return NextResponse.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Failed to get migration status');
    return NextResponse.json(
      { success: false, error: 'Failed to get migration status' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, rollbackData } = body;

    if (action === 'migrate') {
      logger.info('Starting migration via API');
      const result = await migrateToMultiCurrency();
      
      return NextResponse.json({
        success: result.success,
        data: {
          migratedCount: result.migratedCount,
          errorCount: result.errorCount,
          errors: result.errors,
          rollbackData: result.rollbackData
        }
      });
    } else if (action === 'rollback' && rollbackData) {
      logger.info('Starting rollback via API');
      const result = await rollbackMigration(rollbackData);
      
      return NextResponse.json({
        success: result.success,
        data: {
          rollbackCount: result.migratedCount,
          errorCount: result.errorCount,
          errors: result.errors
        }
      });
    } else if (action === 'addOriginalCurrency') {
      logger.info('Starting database migration to add originalCurrency and originalAmount columns');

      // Add the originalCurrency and originalAmount columns to the transactions table
      await db.execute(sql`
        ALTER TABLE transactions 
        ADD COLUMN IF NOT EXISTS original_currency CHAR(3) REFERENCES currencies(currency_code)
      `);

      await db.execute(sql`
        ALTER TABLE transactions 
        ADD COLUMN IF NOT EXISTS original_amount DECIMAL(14,4)
      `);

      logger.info('Migration completed successfully');

      return NextResponse.json({
        success: true,
        message: 'Migration completed successfully',
        result: 'originalCurrency and originalAmount columns added to transactions table'
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid action or missing rollback data' },
        { status: 400 }
      );
    }
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Migration API error');
    return NextResponse.json(
      { success: false, error: 'Migration failed' },
      { status: 500 }
    );
  }
} 