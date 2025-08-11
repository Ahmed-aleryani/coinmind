import { ParsedTransactionText, ReceiptData, TransactionCategory } from '../types/transaction';
import { ServiceFactory } from '../services';
import { formatCurrency } from '../utils/formatters';
import { detectLanguage, extractCurrencyAmount } from '../utils/language-detection';
import logger from '../utils/logger';

// Get Gemini service instance
function getGeminiService() {
  return ServiceFactory.getInstance().gemini;
}

/**
 * Parse natural language text into structured transaction data with multi-language support
 */
export async function parseTransactionText(text: string): Promise<ParsedTransactionText> {
  const geminiService = getGeminiService();
  const result = await geminiService.parseTransactionText(text);
  
  // Convert the result to match the expected type
  return {
    amount: result.amount,
    currency: result.currency,
    vendor: result.vendor,
    description: result.description,
    date: result.date,
    category: result.category as TransactionCategory,
    type: result.type,
  };
}

/**
 * Process receipt image and extract transaction data
 */
export async function parseReceiptImage(imageBase64: string): Promise<ReceiptData> {
  const geminiService = getGeminiService();
  return await geminiService.parseReceiptImage(imageBase64);
}

/**
 * Categorize a transaction automatically
 */
export function categorizeTransaction(
  description: string, 
  vendor?: string
): TransactionCategory {
  // Simple categorization logic based on keywords
  const lower = description.toLowerCase();
  const vendorLower = vendor?.toLowerCase() || '';
  
  // Food & Drink
  if (lower.includes('coffee') || lower.includes('restaurant') || lower.includes('food') || 
      lower.includes('starbucks') || lower.includes('mcdonald') || lower.includes('pizza') ||
      vendorLower.includes('restaurant') || vendorLower.includes('cafe')) {
    return 'Food & Drink';
  }
  
  // Transportation
  if (lower.includes('gas') || lower.includes('fuel') || lower.includes('uber') || 
      lower.includes('lyft') || lower.includes('taxi') || lower.includes('parking') ||
      vendorLower.includes('gas') || vendorLower.includes('uber')) {
    return 'Transportation';
  }
  
  // Utilities
  if (lower.includes('electric') || lower.includes('water') || lower.includes('internet') ||
      lower.includes('phone') || lower.includes('utility') || lower.includes('bill')) {
    return 'Utilities';
  }
  
  // Entertainment
  if (lower.includes('movie') || lower.includes('netflix') || lower.includes('spotify') ||
      lower.includes('game') || lower.includes('entertainment')) {
    return 'Entertainment';
  }
  
  // Shopping
  if (lower.includes('amazon') || lower.includes('walmart') || lower.includes('target') ||
      lower.includes('shopping') || lower.includes('store') ||
      vendorLower.includes('amazon') || vendorLower.includes('walmart') || vendorLower.includes('target') ||
      vendorLower.includes('store')) {
    return 'Shopping';
  }
  
  // Healthcare
  if (lower.includes('medical') || lower.includes('doctor') || lower.includes('pharmacy') ||
      lower.includes('hospital') || lower.includes('health')) {
    return 'Healthcare';
  }
  
  // Income
  if (lower.includes('salary') || lower.includes('paycheck') || lower.includes('income') ||
      lower.includes('deposit') || lower.includes('bonus')) {
    return 'Income';
  }
  
  return 'Other';
}

/**
 * Answer user questions using AI-powered function calling to query the database
 */
export async function answerFinancialQuestion(userId: string, question: string, userLanguage: string = 'en'): Promise<string> {
  const geminiService = getGeminiService();
  return await geminiService.answerFinancialQuestion(userId, question, userLanguage);
}

/**
 * Parse spreadsheet data (CSV or XLSX) using Gemini 2.5 Pro Preview for fast and accurate processing
 */
export async function parseCSVWithGemini(csvText: string): Promise<{
  preview: string;
  transactions: Array<{
    amount: number;
    vendor: string;
    description: string;
    date: Date;
    category: string;
    type: 'income' | 'expense';
    currency?: string;
  }>;
  requiresConfirmation: boolean;
}> {
  const startTime = Date.now();

  logger.info({ csvLength: csvText.length }, 'Starting CSV/XLSX parsing with heuristic classifier');

  // Try to detect if input is a base64-encoded XLSX (zip) payload
  const looksLikeBase64Xlsx = csvText.length > 1000 && /UEsDB/.test(csvText) && /^[A-Za-z0-9+/=\r\n]+$/.test(csvText.replace(/\s/g, ''));

  // If XLSX, parse with SheetJS
  if (looksLikeBase64Xlsx) {
    try {
      const XLSX = await import('xlsx');
      const clean = csvText.replace(/\s/g, '');
      const buffer = Buffer.from(clean, 'base64');
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const transactions = rows.slice(0, 1000).map((row) => {
        // Normalize keys
        const norm: Record<string, any> = {};
        Object.keys(row).forEach((k) => (norm[k.toLowerCase().replace(/\s+/g, '')] = row[k]));

        const rawDate = norm['date'] || norm['transactiondate'] || norm['posteddate'] || norm['bookingdate'] || '';
        const rawDesc = norm['description'] || norm['memo'] || norm['details'] || norm['narration'] || norm['payee'] || norm['vendor'] || '';
        const rawAmount = norm['amount'] ?? '';
        const rawDebit = norm['debit'] ?? norm['outflow'] ?? norm['withdrawal'] ?? norm['dr'] ?? '';
        const rawCredit = norm['credit'] ?? norm['inflow'] ?? norm['deposit'] ?? norm['cr'] ?? '';
        const rawType = norm['type'] ?? norm['tranxtype'] ?? '';
        const rawCategory = norm['category'] ?? norm['cat'] ?? '';
        const rawCurrency = norm['currency'] ?? norm['curr'] ?? norm['ccy'] ?? '';

        const parseNum = (s: any) => {
          const str = String(s ?? '').trim();
          if (!str) return NaN;
          const isParen = /^\(.*\)$/.test(str);
          let t = isParen ? str.slice(1, -1) : str;
          if (t.includes('.') && t.includes(',')) {
            const lastDot = t.lastIndexOf('.')
            const lastComma = t.lastIndexOf(',');
            t = lastComma > lastDot ? t.replace(/\./g, '').replace(/,/g, '.') : t.replace(/,/g, '');
          } else {
            t = t.replace(/,/g, '');
          }
          t = t.replace(/[^\d.\-]/g, '');
          let n = parseFloat(t);
          if (isNaN(n)) return NaN;
          if (isParen) n = -Math.abs(n);
          return n;
        };

        const credit = parseNum(rawCredit);
        const debit = parseNum(rawDebit);
        const amountParsed = parseNum(rawAmount);

        let amount = 0;
        let type: 'income' | 'expense' = 'expense';
        if (!isNaN(credit) && credit > 0) {
          amount = Math.abs(credit);
          type = 'income';
        } else if (!isNaN(debit) && debit > 0) {
          amount = Math.abs(debit);
          type = 'expense';
        } else if (!isNaN(amountParsed)) {
          amount = Math.abs(amountParsed);
          type = amountParsed < 0 ? 'expense' : 'income';
        } else {
          const low = String(rawDesc).toLowerCase();
          type = /salary|paycheck|income|deposit|refund|reimbursement|bonus/.test(low) ? 'income' : 'expense';
        }

        const description = String(rawDesc || '').trim();
        const vendor = description.split(/\s{2,}|\s-\s|,|\|/)[0] || 'Unknown';
        let category = String(rawCategory || '').trim();
        if (!category) {
          category = categorizeTransaction(description);
        }
        let currency = String(rawCurrency || '').trim().toUpperCase();
        if (!currency) {
          const symbolMatch = String(rawAmount || rawDebit || rawCredit || '').match(/[A-Z]{3}|\$|€|£|ر\.س|SAR|USD|EUR|GBP/i);
          if (symbolMatch) {
            const s = symbolMatch[0].toUpperCase();
            if (s === '$') currency = 'USD';
            else if (s === '€') currency = 'EUR';
            else if (s === '£') currency = 'GBP';
            else if (s === 'ر.س' || s === 'SAR') currency = 'SAR';
            else if (/^[A-Z]{3}$/.test(s)) currency = s;
          }
        }

        const date = new Date(rawDate || '');
        return {
          amount,
          vendor,
          description,
          date: isNaN(date.getTime()) ? new Date() : date,
          category: category || 'Other',
          type,
          currency
        };
      });

      const incomeCount = transactions.filter((t) => t.type === 'income').length;
      const expenseCount = transactions.filter((t) => t.type === 'expense').length;

      logger.info({ duration: Date.now() - startTime, transactionCount: transactions.length, incomeCount, expenseCount }, 'XLSX parsed successfully');

      return {
        preview: `Found ${transactions.length} transactions (income: ${incomeCount}, expenses: ${expenseCount})`,
        transactions,
        requiresConfirmation: true
      };
    } catch (e) {
      logger.warn({ error: e instanceof Error ? e.message : e }, 'XLSX parse failed, falling back to CSV parsing');
    }
  }

  // Detect delimiter (comma, semicolon, tab)
  const firstLine = csvText.split(/\r?\n/)[0] || '';
  const delimiter = (() => {
    const counts = [',', ';', '\t'].map((d) => ({ d, c: (firstLine.match(new RegExp(`\\${d}`, 'g')) || []).length }));
    counts.sort((a, b) => b.c - a.c);
    return counts[0].c > 0 ? counts[0].d : ',';
  })();

  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= 1) {
    return { preview: 'No rows found', transactions: [], requiresConfirmation: true };
  }

  const headersRaw = lines[0].split(delimiter).map((h) => h.trim());
  const headers = headersRaw.map((h) => h.toLowerCase().replace(/\s+/g, ''));

  function getIndex(names: string[]): number {
    for (const n of names) {
      const idx = headers.findIndex((h) => h === n || h.includes(n));
      if (idx >= 0) return idx;
    }
    return -1;
  }

  const idxDate = getIndex(['date', 'transactiondate', 'posteddate', 'bookingdate']);
  const idxDesc = getIndex(['description', 'memo', 'details', 'narration', 'payee', 'vendor']);
  const idxAmount = getIndex(['amount', 'amt', 'value']);
  const idxDebit = getIndex(['debit', 'outflow', 'withdrawal', 'dr']);
  const idxCredit = getIndex(['credit', 'inflow', 'deposit', 'cr']);
  const idxType = getIndex(['type', 'tranxtype']);
  const idxCategory = getIndex(['category', 'cat']);
  const idxCurrency = getIndex(['currency', 'curr', 'ccy']);

  function parseNumber(str: string | undefined): number {
    if (!str) return NaN;
    let s = String(str).trim();
    // Handle parentheses for negatives
    const isParenNeg = /^\(.*\)$/.test(s);
    if (isParenNeg) s = s.slice(1, -1);
    // Normalize European decimals: 1.234,56 -> 1234.56
    if (s.includes('.') && s.includes(',')) {
      // Choose the last occurring symbol as decimal
      const lastDot = s.lastIndexOf('.');
      const lastComma = s.lastIndexOf(',');
      if (lastComma > lastDot) {
        s = s.replace(/\./g, '').replace(/,/g, '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else {
      s = s.replace(/,/g, '');
    }
    // Remove currency symbols and non-numeric
    s = s.replace(/[^\d.\-]/g, '');
    let n = parseFloat(s);
    if (isNaN(n)) return NaN;
    if (isParenNeg) n = -Math.abs(n);
    return n;
  }

  const transactions: Array<{
    amount: number;
    vendor: string;
    description: string;
    date: Date;
    category: string;
    type: 'income' | 'expense';
    currency?: string;
  }> = [];

  for (let i = 1; i < Math.min(lines.length, 1000); i++) {
    const row = lines[i].split(delimiter);
    if (row.length < 2) continue;
    try {
      const rawDate = idxDate >= 0 ? row[idxDate] : row[0];
      const rawDesc = idxDesc >= 0 ? row[idxDesc] : row[1];
      const rawAmount = idxAmount >= 0 ? row[idxAmount] : undefined;
      const rawDebit = idxDebit >= 0 ? row[idxDebit] : undefined;
      const rawCredit = idxCredit >= 0 ? row[idxCredit] : undefined;
      const rawType = idxType >= 0 ? row[idxType] : undefined;
      const rawCategory = idxCategory >= 0 ? row[idxCategory] : undefined;
      const rawCurrency = idxCurrency >= 0 ? row[idxCurrency] : undefined;

      const parsedDate = new Date(rawDate || '');
      const date = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
      const description = (rawDesc || '').trim();

      const debit = parseNumber(rawDebit);
      const credit = parseNumber(rawCredit);
      const amountParsed = parseNumber(rawAmount);

      let amount = 0;
      let type: 'income' | 'expense' = 'expense';

      if (!isNaN(credit) && credit > 0) {
        amount = Math.abs(credit);
        type = 'income';
      } else if (!isNaN(debit) && debit > 0) {
        amount = Math.abs(debit);
        type = 'expense';
      } else if (!isNaN(amountParsed)) {
        amount = Math.abs(amountParsed);
        type = amountParsed < 0 ? 'expense' : 'income';
      } else {
        // Fallback by description keywords
        const low = description.toLowerCase();
        type = /salary|paycheck|income|deposit|refund|reimbursement|bonus/.test(low) ? 'income' : 'expense';
        amount = 0; // Unknown amount, skip row
      }

      // Normalize category: use CSV category if available, else use heuristics
      let category = (rawCategory || '').trim();
      if (!category) {
        category = await categorizeTransaction(description);
      }

      // Basic vendor extraction: take a concise fragment from description
      const vendor = description.split(/\s{2,}|\s-\s|,|\|/)[0] || 'Unknown';

      // Currency detection: prefer explicit column
      let currency: string | undefined = (rawCurrency || '').trim().toUpperCase();
      if (!currency) {
        // Try detecting from amount string
        const symbolMatch = (rawAmount || rawDebit || rawCredit || '').match(/[A-Z]{3}|\$|€|£|ر\.س|SAR|USD|EUR|GBP/i);
        if (symbolMatch) {
          const s = symbolMatch[0].toUpperCase();
          if (s === '$') currency = 'USD';
          else if (s === '€') currency = 'EUR';
          else if (s === '£') currency = 'GBP';
          else if (s === 'ر.س' || s === 'SAR') currency = 'SAR';
          else if (/^[A-Z]{3}$/.test(s)) currency = s;
        }
      }

      transactions.push({
        amount,
        vendor: vendor || 'Unknown',
        description,
        date,
        category: category || 'Other',
        type,
        currency
      });
    } catch (error) {
      logger.warn({ error, line: i, row }, 'Failed to parse CSV line');
      continue;
    }
  }

  // Summaries
  const incomeCount = transactions.filter((t) => t.type === 'income').length;
  const expenseCount = transactions.filter((t) => t.type === 'expense').length;

  const endTime = Date.now();
  const duration = endTime - startTime;

  logger.info({ duration, transactionCount: transactions.length, incomeCount, expenseCount }, 'CSV parsing completed successfully');

  return {
    preview: `Found ${transactions.length} transactions (income: ${incomeCount}, expenses: ${expenseCount})`,
    transactions,
    requiresConfirmation: true
  };
}

/**
 * Generic MCP-style database query tool that Gemini can call with flexible parameters
 */
export function queryFinancialDatabase(params: any = {}) {
  logger.warn('queryFinancialDatabase is deprecated, use the new service layer instead');
  return {
    type: 'deprecated',
    message: 'This function has been deprecated. Please use the new service layer.'
  };
}

