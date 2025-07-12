const API_URL = "https://open.er-api.com/v6/latest";

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
  // Convert to uppercase to handle case sensitivity
  from = from.toUpperCase();
  to = to.toUpperCase();

  // If same currency, return 1
  if (from === to) return 1;

  const now = Date.now();
  
  // Check cache first
  if (
    cachedBase === from &&
    cachedRates[to] &&
    now - lastFetch < 60 * 60 * 1000 // Cache for 1 hour
  ) {
    console.log(`[getExchangeRate] (CACHED) ${from} -> ${to}: ${cachedRates[to]}`);
    return cachedRates[to];
  }

  try {
    // Fetch latest rates from the API
    const url = `${API_URL}/${from}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    
    if (data.result !== 'success') {
      throw new Error(data['error-type'] || 'Failed to fetch exchange rates');
    }

    if (!data.rates || !data.rates[to]) {
      throw new Error(`Currency ${to} not supported`);
    }

    // Update cache
    cachedRates = data.rates;
    cachedBase = from;
    lastFetch = now;

    const rate = data.rates[to];
    console.log(`[getExchangeRate] ${from} -> ${to}: ${rate}`);
    
    return rate;
  } catch (error) {
    console.error('Error in getExchangeRate:', error);
    throw new Error(`Failed to get exchange rate: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getGlobalRates(
  base: string = "USD"
): Promise<{ rates: Record<string, number>; base: string }> {
  // Convert to uppercase to handle case sensitivity
  base = base.toUpperCase();
  
  const now = Date.now();
  
  // Check cache first
  if (
    globalRatesBase === base &&
    Object.keys(globalRates).length > 0 &&
    now - globalRatesLastFetch < 60 * 60 * 1000 // Cache for 1 hour
  ) {
    console.log(`[getGlobalRates] (CACHED) Returning cached rates for base ${base}`);
    return { rates: { ...globalRates }, base };
  }

  try {
    // Fetch latest rates from the API
    const url = `${API_URL}/${base}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    
    if (data.result !== 'success') {
      throw new Error(data['error-type'] || 'Failed to fetch exchange rates');
    }

    if (!data.rates) {
      throw new Error('No rates data received from API');
    }

    // Update cache
    globalRates = data.rates;
    globalRatesBase = base;
    globalRatesLastFetch = now;

    console.log(`[getGlobalRates] Fetched new rates for base ${base}`);
    return { rates: { ...data.rates }, base };
  } catch (error) {
    console.error('Error in getGlobalRates:', error);
    throw new Error(`Failed to get global rates: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function convertWithGlobalRates(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>,
  base: string = "USD"
): number {
  // Convert to uppercase to handle case sensitivity
  from = from.toUpperCase();
  to = to.toUpperCase();
  base = base.toUpperCase();
  
  // If same currency, return amount as is
  if (from === to) return amount;
  
  try {
    // If converting from base currency
    if (from === base) {
      if (!rates[to]) throw new Error(`Target currency ${to} not found in rates`);
      return amount * rates[to];
    }
    
    // If converting to base currency
    if (to === base) {
      if (!rates[from]) throw new Error(`Source currency ${from} not found in rates`);
      return amount / rates[from];
    }
    
    // Cross-currency conversion through base currency
    if (!rates[from] || !rates[to]) {
      throw new Error(`One or both currencies not found in rates (${from}, ${to})`);
    }
    
    const result = (amount / rates[from]) * rates[to];
    console.log(`[convertWithGlobalRates] Converted ${amount} ${from} -> ${result} ${to} (via ${base})`);
    return result;
  } catch (error) {
    console.error(`Error in convertWithGlobalRates for ${amount} ${from} to ${to}:`, error);
    throw new Error(`Failed to convert with global rates: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function batchConvertAmounts(
  amounts: number[],
  from: string,
  to: string
): Promise<number[]> {
  // Convert to uppercase to handle case sensitivity
  from = from.toUpperCase();
  to = to.toUpperCase();
  
  // If same currency, return amounts as is
  if (from === to) return [...amounts];
  
  try {
    // Get the exchange rate once and apply to all amounts
    const rate = await getExchangeRate(from, to);
    const results = amounts.map(amount => {
      const result = amount * rate;
      console.log(`[batchConvertAmounts] Converted ${amount} ${from} -> ${result} ${to}`);
      return result;
    });
    return results;
  } catch (error) {
    console.error(`Error in batchConvertAmounts for ${from} to ${to}:`, error);
    throw new Error(`Failed to batch convert amounts: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function convertAmount(
  amount: number,
  from: string,
  to: string
): Promise<number> {
  // Convert to uppercase to handle case sensitivity
  from = from.toUpperCase();
  to = to.toUpperCase();
  
  // If same currency, return amount as is
  if (from === to) return amount;
  
  try {
    const rate = await getExchangeRate(from, to);
    const result = amount * rate;
    console.log(`[convertAmount] Converted ${amount} ${from} -> ${result} ${to}`);
    return result;
  } catch (error) {
    console.error(`Error converting ${amount} ${from} to ${to}:`, error);
    throw new Error(`Failed to convert amount: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getSupportedCurrencies(): Promise<string[]> {
  try {
    const { rates } = await getGlobalRates("USD");
    // Include base currency (USD) in the result
    const currencies = Array.from(new Set([...Object.keys(rates), "USD"])).sort();
    console.log(`[getSupportedCurrencies] Found ${currencies.length} supported currencies`);
    return currencies;
  } catch (error) {
    console.error('Error fetching supported currencies:', error);
    throw new Error(`Failed to get supported currencies: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
