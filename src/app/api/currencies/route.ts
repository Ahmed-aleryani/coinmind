import { NextResponse } from 'next/server';
import { getSupportedCurrencies } from '@/lib/utils/currency';

export async function GET() {
  try {
    const currencies = await getSupportedCurrencies();
    return NextResponse.json({ 
      success: true,
      currencies: currencies.slice(0, 50) // Limit to first 50 currencies for performance
    });
  } catch (error) {
    console.error('Error fetching currencies:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to fetch currencies',
      currencies: ['USD', 'EUR', 'GBP', 'JPY', 'SAR', 'EGP', 'CNY', 'KRW', 'INR', 'RUB', 'TRY'] // Fallback currencies
    }, { status: 500 });
  }
} 