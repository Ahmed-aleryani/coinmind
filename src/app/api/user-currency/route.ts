import { NextRequest, NextResponse } from 'next/server';
import { getServices } from '@/lib/services';
import logger from '@/lib/utils/logger';

export async function GET() {
  try {
    const { services, userId } = await getServices();
    
    const profile = await services.repositories.profiles.findById(userId);
    const defaultCurrency = profile?.defaultCurrency || 'USD';
    
    return NextResponse.json({ defaultCurrency });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Failed to get user currency');
    return NextResponse.json({ defaultCurrency: 'USD' }); // Fallback to USD
  }
}

export async function POST(request: NextRequest) {
  try {
    const { services, userId } = await getServices();
    
    const { defaultCurrency } = await request.json();
    
    if (!defaultCurrency || typeof defaultCurrency !== 'string') {
      return NextResponse.json({ error: 'defaultCurrency is required' }, { status: 400 });
    }
    
    await services.repositories.profiles.ensureExists(userId, defaultCurrency);
    
    // Update the profile with the new currency
    const updatedProfile = await services.repositories.profiles.update(userId, {
      defaultCurrency,
      updatedAt: new Date()
    });
    
    if (!updatedProfile) {
      return NextResponse.json({ error: 'Failed to update currency' }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true, 
      defaultCurrency: updatedProfile.defaultCurrency 
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Failed to update user currency');
    return NextResponse.json({ error: 'Failed to update currency' }, { status: 500 });
  }
} 