import fetch from 'node-fetch';

const API_URL = 'https://api.exchangerate-api.com/v4/latest';

// Cache rates for 1 hour
let cachedRates: Record<string, number> = {};
let cachedBase = 'USD';
let lastFetch = 0;

export async function getExchangeRate(from: string, to: string): Promise<number> {
  const now = Date.now();
  if (cachedBase === from && cachedRates[to] && now - lastFetch < 60 * 60 * 1000) {
    return cachedRates[to];
  }
  const url = `${API_URL}/${from}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch exchange rates');
  const data = await res.json() as { rates: Record<string, number> };
  cachedRates = data.rates;
  cachedBase = from;
  lastFetch = now;
  if (!cachedRates[to]) throw new Error(`Currency ${to} not supported`);
  return cachedRates[to];
}

export async function convertAmount(amount: number, from: string, to: string): Promise<number> {
  if (from === to) return amount;
  const rate = await getExchangeRate(from, to);
  return amount * rate;
}

export async function getSupportedCurrencies(): Promise<string[]> {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error('Failed to fetch supported currencies');
  const data = await res.json() as { rates: Record<string, number> };
  return Object.keys(data.rates);
} 