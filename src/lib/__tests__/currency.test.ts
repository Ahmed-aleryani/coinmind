import { getExchangeRate, convertAmount, getSupportedCurrencies, getGlobalRates, convertWithGlobalRates } from '../utils/currency';

describe('Currency Utilities', () => {
  // Test case for getting exchange rate
  describe('getExchangeRate', () => {
    it('should return exchange rate for valid currency pair', async () => {
      // Test with USD to EUR (should be a valid pair)
      const rate = await getExchangeRate('USD', 'EUR');
      expect(typeof rate).toBe('number');
      expect(rate).toBeGreaterThan(0);
    });

    it('should throw error for unsupported currency', async () => {
      // Test with an unlikely currency code
      await expect(getExchangeRate('USD', 'XXX')).rejects.toThrow('Failed to get exchange rate: Currency XXX not supported');
    });
  });

  // Test case for converting amounts
  describe('convertAmount', () => {
    it('should convert amount between currencies', async () => {
      // Test converting 100 USD to EUR
      const amount = 100;
      const converted = await convertAmount(amount, 'USD', 'EUR');
      
      expect(typeof converted).toBe('number');
      expect(converted).toBeGreaterThan(0);
      
      // Since we know 1 USD should be roughly 0.9-1.1 EUR (as of current rates)
      // This is a sanity check that the conversion is in a reasonable range
      expect(converted).toBeGreaterThan(amount * 0.8);
      expect(converted).toBeLessThan(amount * 1.2);
    });

    it('should return same amount for same currency', async () => {
      const amount = 100;
      const converted = await convertAmount(amount, 'USD', 'USD');
      expect(converted).toBe(amount);
    });
  });

  // Test case for getting supported currencies
  describe('getSupportedCurrencies', () => {
    it('should return array of supported currency codes', async () => {
      const currencies = await getSupportedCurrencies();
      
      expect(Array.isArray(currencies)).toBe(true);
      expect(currencies.length).toBeGreaterThan(0);
      
      // Check that common currencies are included
      expect(currencies).toContain('USD');
      expect(currencies).toContain('EUR');
      expect(currencies).toContain('GBP');
      expect(currencies).toContain('JPY');
    });
  });

  // Test case for currency exchange with specific values
  describe('Currency Exchange', () => {
    it('should correctly convert between USD and EUR', async () => {
      // Use a single snapshot of global rates so both directions are consistent
      const { rates, base } = await getGlobalRates('USD');

      const amountUSD = 100;
      const amountEUR = convertWithGlobalRates(amountUSD, 'USD', 'EUR', rates, base);

      // Sanity check: result should be in a reasonable range
      expect(amountEUR).toBeGreaterThan(amountUSD * 0.5);
      expect(amountEUR).toBeLessThan(amountUSD * 1.5);

      // Convert back using the same rate snapshot
      const convertedBack = convertWithGlobalRates(amountEUR, 'EUR', 'USD', rates, base);

      // Round-trip should approximately equal the original
      expect(convertedBack).toBeCloseTo(amountUSD, 2);
    });
  });
});
