'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import logger from '@/lib/utils/logger';

interface CurrencyContextType {
  defaultCurrency: string;
  supportedCurrencies: string[];
  isCurrencyLoading: boolean;
  setDefaultCurrency: (currency: string) => Promise<void>;
  refreshCurrency: () => Promise<void>;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [defaultCurrency, setDefaultCurrencyState] = useState('USD');
  const [supportedCurrencies, setSupportedCurrencies] = useState<string[]>([]);
  const [isCurrencyLoading, setIsCurrencyLoading] = useState(false);

  // Fetch supported currencies and user default currency
  const fetchCurrencies = async () => {
    try {
      setIsCurrencyLoading(true);
      const res = await fetch('/api/user-currency');
      const data = await res.json();
      setDefaultCurrencyState(data.defaultCurrency || 'USD');
      const curRes = await fetch('/api/currencies');
      const curData = await curRes.json();
      setSupportedCurrencies(curData.currencies || ['USD']);
    } catch (e) {
      setSupportedCurrencies(['USD']);
      logger.error({ error: e }, 'Failed to fetch currencies');
    } finally {
      setIsCurrencyLoading(false);
    }
  };

  const setDefaultCurrency = async (newCurrency: string) => {
    logger.info({ newCurrency }, 'Global currency changed');
    setDefaultCurrencyState(newCurrency);
    setIsCurrencyLoading(true);
    
    try {
      await fetch('/api/user-currency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultCurrency: newCurrency })
      });
      logger.info({ newCurrency }, 'Global currency update completed');
    } catch (error) {
      logger.error({ error, newCurrency }, 'Failed to update global currency');
    } finally {
      setIsCurrencyLoading(false);
    }
  };

  const refreshCurrency = async () => {
    await fetchCurrencies();
  };

  useEffect(() => {
    fetchCurrencies();
  }, []);

  return (
    <CurrencyContext.Provider value={{
      defaultCurrency,
      supportedCurrencies,
      isCurrencyLoading,
      setDefaultCurrency,
      refreshCurrency
    }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
} 