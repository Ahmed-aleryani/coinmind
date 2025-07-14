import { NextResponse } from 'next/server';
import { CurrencyFormatter } from '@/lib/utils/currency-formatter';
import { getSupportedCurrencies } from '@/lib/utils/currency';

export async function GET() {
  try {
    // Get currencies from our unified CurrencyFormatter first
    let currencies = CurrencyFormatter.getSupportedCurrencies();
    
    // Also fetch from external API for additional currencies
    try {
      const externalCurrencies = await getSupportedCurrencies();
      // Merge and deduplicate currencies
      currencies = Array.from(new Set([...currencies, ...externalCurrencies]));
    } catch (externalError) {
      console.warn('Failed to fetch external currencies, using local list only:', externalError);
    }
    
    // Add YER if not present (Yemeni Rial)
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