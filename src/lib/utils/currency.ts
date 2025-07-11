const API_URL = "https://api.exchangerate-api.com/v4/latest";

// Cache rates for 1 hour
let cachedRates: Record<string, number> = {};
let cachedBase = "USD";
let lastFetch = 0;

// Fetch and cache all rates with a single API call (base USD)
let globalRates: Record<string, number> = {};
let globalRatesBase = "USD";
let globalRatesLastFetch = 0;

export async function getExchangeRate(
  from: string,
  to: string
): Promise<number> {
  const now = Date.now();
  if (
    cachedBase === from &&
    cachedRates[to] &&
    now - lastFetch < 60 * 60 * 1000
  ) {
    console.log(
      `[getExchangeRate] (CACHED) ${from} -> ${to}: ${cachedRates[to]}`
    );
    return cachedRates[to];
  }
  const url = `${API_URL}/${from}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch exchange rates");
  const data = (await res.json()) as { rates: Record<string, number> };
  cachedRates = data.rates;
  cachedBase = from;
  lastFetch = now;
  if (!cachedRates[to]) throw new Error(`Currency ${to} not supported`);
  console.log(`[getExchangeRate] ${from} -> ${to}: ${cachedRates[to]}`);
  return cachedRates[to];
}

export async function getGlobalRates(
  base: string = "USD"
): Promise<{ rates: Record<string, number>; base: string }> {
  const now = Date.now();
  if (
    globalRatesBase === base &&
    Object.keys(globalRates).length > 0 &&
    now - globalRatesLastFetch < 60 * 60 * 1000
  ) {
    return { rates: globalRates, base: globalRatesBase };
  }
  const url = `${API_URL}/${base}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch global exchange rates");
  const data = (await res.json()) as { rates: Record<string, number> };
  globalRates = data.rates;
  globalRatesBase = base;
  globalRatesLastFetch = now;
  return { rates: globalRates, base: globalRatesBase };
}

// Convert using a global rates table (cross-rate math)
export function convertWithGlobalRates(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>,
  base: string
): number {
  if (from === to) return amount;
  if (from === base) {
    // Direct conversion from base
    if (!rates[to]) throw new Error(`Currency ${to} not supported in rates`);
    return amount * rates[to];
  }
  if (to === base) {
    // Convert to base
    if (!rates[from])
      throw new Error(`Currency ${from} not supported in rates`);
    return amount / rates[from];
  }
  // Cross-rate: from -> base -> to
  if (!rates[from] || !rates[to])
    throw new Error(`Currency ${from} or ${to} not supported in rates`);
  return (amount / rates[from]) * rates[to];
}

export async function convertAmount(
  amount: number,
  from: string,
  to: string
): Promise<number> {
  if (from === to) return amount;
  const rate = await getExchangeRate(from, to);
  return amount * rate;
}

export async function getSupportedCurrencies(): Promise<string[]> {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error("Failed to fetch supported currencies");
  const data = (await res.json()) as { rates: Record<string, number> };
  return Object.keys(data.rates);
}

// Batch convert an array of {amount, from} to a target currency
export async function batchConvertAmounts(
  items: { amount: number; from: string }[],
  to: string
): Promise<number[]> {
  // Group by source currency
  const groups: Record<string, { idx: number; amount: number }[]> = {};
  items.forEach((item, idx) => {
    if (!groups[item.from]) groups[item.from] = [];
    groups[item.from].push({ idx, amount: item.amount });
  });
  // Fetch all needed rates in one call per source currency
  const now = Date.now();
  const results: number[] = new Array(items.length);
  for (const from in groups) {
    if (from === to) {
      groups[from].forEach(({ idx, amount }) => {
        results[idx] = amount;
      });
      continue;
    }
    // Use cached rates if available and fresh
    if (
      cachedBase === from &&
      cachedRates[to] &&
      now - lastFetch < 60 * 60 * 1000
    ) {
      const rate = cachedRates[to];
      groups[from].forEach(({ idx, amount }) => {
        results[idx] = amount * rate;
      });
      continue;
    }
    // Fetch rates for this base
    const url = `${API_URL}/${from}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch exchange rates");
    const data = (await res.json()) as { rates: Record<string, number> };
    cachedRates = data.rates;
    cachedBase = from;
    lastFetch = now;
    const rate = cachedRates[to];
    if (!rate) throw new Error(`Currency ${to} not supported for base ${from}`);
    groups[from].forEach(({ idx, amount }) => {
      results[idx] = amount * rate;
    });
  }
  return results;
}

// DEBUG: Direct test for currency conversion utility
if (
  typeof process !== "undefined" &&
  process.argv &&
  process.argv[1] &&
  process.argv[1].endsWith("currency.ts")
) {
  (async () => {
    const from = "USD";
    const to = "SAR";
    const amount = 50;
    const rate = await getExchangeRate(from, to);
    const converted = await convertAmount(amount, from, to);
    console.log(
      `[TEST] 50 ${from} to ${to}: rate=${rate}, converted=${converted}`
    );
  })();
}

// TEMP: Conditional test for currency conversion utility (runs only in development)
if (process.env.NODE_ENV === "development") {
  (async () => {
    console.log("[TEST] Running direct currency conversion test...");
    const from = "USD";
    const to = "SAR";
    const amount = 50;
    const rate = await getExchangeRate(from, to);
    const converted = await convertAmount(amount, from, to);
    console.log(
      `[TEST] 50 ${from} to ${to}: rate=${rate}, converted=${converted}`
    );
  })();
}
