import fetch from 'node-fetch';

const API_URL = 'https://api.exchangerate-api.com/v4/latest';

// Cache rates for 1 hour
let cachedRates: Record<string, number> = {};
let cachedBase = 'USD';
let lastFetch = 0;

export async function getExchangeRate(from: string, to: string): Promise<number> {
  const now = Date.now();
  if (cachedBase === from && cachedRates[to] && now - lastFetch < 60 * 60 * 1000) {
    console.log(`[getExchangeRate] (CACHED) ${from} -> ${to}: ${cachedRates[to]}`);
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
  console.log(`[getExchangeRate] ${from} -> ${to}: ${cachedRates[to]}`);
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

// DEBUG: Direct test for currency conversion utility
if (typeof process !== 'undefined' && import.meta && import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const from = 'USD';
    const to = 'SAR';
    const amount = 50;
    const rate = await getExchangeRate(from, to);
    const converted = await convertAmount(amount, from, to);
    console.log(`[TEST] 50 ${from} to ${to}: rate=${rate}, converted=${converted}`);
  })();
}

// TEMP: Unconditional test for currency conversion utility
(async () => {
  console.log('[TEST] Running direct currency conversion test...');
  const from = 'USD';
  const to = 'SAR';
  const amount = 50;
  const rate = await getExchangeRate(from, to);
  const converted = await convertAmount(amount, from, to);
  console.log(`[TEST] 50 ${from} to ${to}: rate=${rate}, converted=${converted}`);
})(); 