import { NextResponse } from 'next/server';
import { getSupportedCurrencies } from '@/lib/utils/currency';

export async function GET() {
  try {
    let currencies = await getSupportedCurrencies();
    if (!currencies.includes('YER')) currencies.push('YER');
    // Arrange preferred currencies first
    const preferred = ['YER', 'SAR', 'USD', 'EUR', 'EGP'];
    currencies = [
      ...preferred.filter(c => currencies.includes(c)),
      ...currencies.filter(c => !preferred.includes(c)).sort()
    ];
    return NextResponse.json({ 
      success: true,
      currencies: currencies.slice(0, 50) // Limit to first 50 currencies for performance
    });
  } catch (error) {
    console.error('Error fetching currencies:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to fetch currencies',
      currencies: ['YER', 'SAR', 'USD', 'EUR', 'EGP', 'GBP', 'JPY', 'CNY', 'KRW', 'INR', 'RUB', 'TRY'] // Fallback currencies, preferred first
    }, { status: 500 });
  }
} 