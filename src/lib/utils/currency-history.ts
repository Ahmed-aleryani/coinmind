import { Transaction } from '../types/transaction';

export interface CurrencyConversionHistory {
  date: Date;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  amount: number;
  convertedAmount: number;
  transactionId: string;
}

export interface ExchangeRateData {
  date: string;
  rate: number;
  volume: number;
}

export interface CurrencyPair {
  from: string;
  to: string;
  label: string;
}

/**
 * Extract currency conversion history from transactions
 */
export function getCurrencyConversionHistory(transactions: Transaction[]): CurrencyConversionHistory[] {
  return transactions
    .filter(t => 
      t.originalAmount && 
      t.convertedAmount && 
      t.originalCurrency && 
      t.convertedCurrency &&
      t.originalCurrency !== t.convertedCurrency
    )
    .map(t => ({
      date: new Date(t.date),
      fromCurrency: t.originalCurrency!,
      toCurrency: t.convertedCurrency!,
      rate: t.conversionRate || 1,
      amount: t.originalAmount!,
      convertedAmount: t.convertedAmount!,
      transactionId: t.id
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

/**
 * Get unique currency pairs from conversion history
 */
export function getCurrencyPairs(history: CurrencyConversionHistory[]): CurrencyPair[] {
  const pairs = new Set<string>();
  const pairMap = new Map<string, CurrencyPair>();

  history.forEach(h => {
    const key = `${h.fromCurrency}-${h.toCurrency}`;
    if (!pairs.has(key)) {
      pairs.add(key);
      pairMap.set(key, {
        from: h.fromCurrency,
        to: h.toCurrency,
        label: `${h.fromCurrency}/${h.toCurrency}`
      });
    }
  });

  return Array.from(pairMap.values());
}

/**
 * Generate exchange rate data for charts
 */
export function generateExchangeRateData(
  history: CurrencyConversionHistory[],
  fromCurrency: string,
  toCurrency: string,
  days: number = 30
): ExchangeRateData[] {
  const filteredHistory = history.filter(h => 
    h.fromCurrency === fromCurrency && h.toCurrency === toCurrency
  );

  // Group by date and calculate average rate
  const dailyRates = new Map<string, { totalRate: number; count: number; volume: number }>();

  filteredHistory.forEach(h => {
    const dateKey = h.date.toISOString().split('T')[0];
    const existing = dailyRates.get(dateKey) || { totalRate: 0, count: 0, volume: 0 };
    
    existing.totalRate += h.rate;
    existing.count += 1;
    existing.volume += Math.abs(h.amount);
    dailyRates.set(dateKey, existing);
  });

  // Convert to chart data format
  return Array.from(dailyRates.entries())
    .map(([date, data]) => ({
      date,
      rate: data.totalRate / data.count,
      volume: data.volume
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days); // Last N days
}

/**
 * Calculate conversion statistics
 */
export function getConversionStats(history: CurrencyConversionHistory[]) {
  if (history.length === 0) {
    return {
      totalConversions: 0,
      totalVolume: 0,
      averageRate: 0,
      bestRate: 0,
      worstRate: 0,
      mostActivePair: null
    };
  }

  const totalConversions = history.length;
  const totalVolume = history.reduce((sum, h) => sum + Math.abs(h.amount), 0);
  const averageRate = history.reduce((sum, h) => sum + h.rate, 0) / totalConversions;
  
  const rates = history.map(h => h.rate);
  const bestRate = Math.max(...rates);
  const worstRate = Math.min(...rates);

  // Find most active currency pair
  const pairCounts = new Map<string, number>();
  history.forEach(h => {
    const pair = `${h.fromCurrency}-${h.toCurrency}`;
    pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
  });

  const mostActivePair = Array.from(pairCounts.entries())
    .sort((a, b) => b[1] - a[1])[0];

  return {
    totalConversions,
    totalVolume,
    averageRate,
    bestRate,
    worstRate,
    mostActivePair: mostActivePair ? {
      pair: mostActivePair[0],
      count: mostActivePair[1]
    } : null
  };
}

/**
 * Get conversion trends over time
 */
export function getConversionTrends(history: CurrencyConversionHistory[], days: number = 7) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
  
  const recentHistory = history.filter(h => h.date >= cutoff);
  
  // Group by day
  const dailyStats = new Map<string, { conversions: number; volume: number; avgRate: number; totalRate: number; count: number }>();
  
  recentHistory.forEach(h => {
    const dateKey = h.date.toISOString().split('T')[0];
    const existing = dailyStats.get(dateKey) || { conversions: 0, volume: 0, avgRate: 0, totalRate: 0, count: 0 };
    
    existing.conversions += 1;
    existing.volume += Math.abs(h.amount);
    existing.totalRate += h.rate;
    existing.count += 1;
    existing.avgRate = existing.totalRate / existing.count;
    
    dailyStats.set(dateKey, existing);
  });

  return Array.from(dailyStats.entries())
    .map(([date, stats]) => ({
      date,
      conversions: stats.conversions,
      volume: stats.volume,
      averageRate: stats.avgRate
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calculate currency exposure (how much money is in each currency)
 */
export function getCurrencyExposure(transactions: Transaction[]) {
  const exposure = new Map<string, number>();
  
  transactions.forEach(t => {
    const currency = t.originalCurrency || 'USD';
    const amount = t.originalAmount || t.amount;
    
    if (t.type === 'income') {
      exposure.set(currency, (exposure.get(currency) || 0) + amount);
    } else {
      exposure.set(currency, (exposure.get(currency) || 0) - Math.abs(amount));
    }
  });

  return Array.from(exposure.entries())
    .map(([currency, amount]) => ({ currency, amount }))
    .filter(item => item.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

/**
 * Get conversion efficiency (how well rates are being used)
 */
export function getConversionEfficiency(history: CurrencyConversionHistory[]) {
  if (history.length === 0) return { efficiency: 0, savings: 0 };

  // Calculate potential savings from better rates
  const rates = history.map(h => h.rate);
  const avgRate = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  const bestRate = Math.max(...rates);
  
  const efficiency = (avgRate / bestRate) * 100;
  const potentialSavings = history.reduce((sum, h) => {
    const betterAmount = h.amount * bestRate;
    const actualAmount = h.convertedAmount;
    return sum + (betterAmount - actualAmount);
  }, 0);

  return {
    efficiency: Math.round(efficiency),
    savings: Math.abs(potentialSavings)
  };
} 