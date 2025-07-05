import Papa from 'papaparse';
import { TransactionInput } from '../types/transaction';
import { CSVPreview } from '../types/api';

/**
 * Parse CSV file to preview data and detect columns
 */
export function parseCSVFile(file: File): Promise<CSVPreview> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          reject(new Error('Error parsing CSV: ' + results.errors[0].message));
          return;
        }

        const data = results.data as string[][];
        if (data.length === 0) {
          reject(new Error('CSV file is empty'));
          return;
        }

        const headers = data[0];
        const rows = data.slice(1, 6); // Show first 5 rows for preview
        
        // Try to auto-detect column mapping
        const columnMapping = detectColumns(headers);

        resolve({
          headers,
          rows,
          totalRows: data.length - 1, // Exclude header row
          columnMapping
        });
      },
      error: (error) => {
        reject(new Error('Failed to parse CSV: ' + error.message));
      }
    });
  });
}

/**
 * Convert CSV data to transactions using column mapping
 */
export function csvToTransactions(
  csvData: string[][],
  columnMapping: {
    date: string;
    description: string;
    amount: string;
  }
): TransactionInput[] {
  const headers = csvData[0];
  const dateIndex = headers.indexOf(columnMapping.date);
  const descriptionIndex = headers.indexOf(columnMapping.description);
  const amountIndex = headers.indexOf(columnMapping.amount);

  if (dateIndex === -1 || descriptionIndex === -1 || amountIndex === -1) {
    throw new Error('Invalid column mapping');
  }

  const transactions: TransactionInput[] = [];

  for (let i = 1; i < csvData.length; i++) {
    const row = csvData[i];
    
    try {
      const dateStr = row[dateIndex];
      const description = row[descriptionIndex];
      const amountStr = row[amountIndex];

      // Parse date
      const date = parseDate(dateStr);
      if (!date) continue; // Skip invalid dates

      // Parse amount
      const amount = parseAmount(amountStr);
      if (amount === null) continue; // Skip invalid amounts

      // Extract vendor from description (simple heuristic)
      const vendor = extractVendor(description);

      transactions.push({
        date,
        amount,
        vendor,
        description: description.trim(),
        type: amount > 0 ? 'income' : 'expense'
      });
    } catch (error) {
      console.warn(`Skipping row ${i}: ${error}`);
      continue;
    }
  }

  return transactions;
}

/**
 * Auto-detect column types from CSV headers
 */
function detectColumns(headers: string[]): {
  date?: string;
  description?: string;
  amount?: string;
} {
  const columnMapping: any = {};

  headers.forEach(header => {
    const lower = header.toLowerCase();
    
    // Date detection
    if (!columnMapping.date && (
      lower.includes('date') ||
      lower.includes('time') ||
      lower === 'when'
    )) {
      columnMapping.date = header;
    }
    
    // Description detection
    if (!columnMapping.description && (
      lower.includes('description') ||
      lower.includes('memo') ||
      lower.includes('detail') ||
      lower === 'merchant' ||
      lower.includes('payee')
    )) {
      columnMapping.description = header;
    }
    
    // Amount detection
    if (!columnMapping.amount && (
      lower.includes('amount') ||
      lower.includes('value') ||
      lower.includes('sum') ||
      lower === 'total' ||
      lower.includes('debit') ||
      lower.includes('credit')
    )) {
      columnMapping.amount = header;
    }
  });

  return columnMapping;
}

/**
 * Parse various date formats
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Common date formats
  const formats = [
    /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
    /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
    /^\d{2}-\d{2}-\d{4}$/, // MM-DD-YYYY
    /^\d{2}\/\d{2}\/\d{2}$/, // MM/DD/YY
    /^\d{1,2}\/\d{1,2}\/\d{4}$/, // M/D/YYYY
  ];

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      // Try parsing manually for MM/DD/YYYY format
      const parts = dateStr.split(/[\/\-]/);
      if (parts.length === 3) {
        const month = parseInt(parts[0]) - 1; // Month is 0-indexed
        const day = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        
        // Handle 2-digit years
        const fullYear = year < 100 ? (year > 50 ? 1900 + year : 2000 + year) : year;
        
        const parsedDate = new Date(fullYear, month, day);
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate;
        }
      }
      return null;
    }
    return date;
  } catch {
    return null;
  }
}

/**
 * Parse amount strings (handle currency symbols, negative values)
 */
function parseAmount(amountStr: string): number | null {
  if (!amountStr) return null;

  // Remove currency symbols and whitespace
  let cleaned = amountStr.replace(/[$£€¥,\s]/g, '');
  
  // Handle parentheses for negative amounts
  let isNegative = false;
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    isNegative = true;
    cleaned = cleaned.slice(1, -1);
  }
  
  // Handle explicit negative sign
  if (cleaned.startsWith('-')) {
    isNegative = true;
    cleaned = cleaned.slice(1);
  }

  const amount = parseFloat(cleaned);
  if (isNaN(amount)) return null;

  return isNegative ? -Math.abs(amount) : amount;
}

/**
 * Extract vendor name from transaction description
 */
function extractVendor(description: string): string {
  if (!description) return 'Unknown';

  // Common patterns to extract vendor names
  const cleaned = description.trim();
  
  // Remove common prefixes
  const prefixes = [
    /^(DEBIT|CREDIT|ACH|ATM|POS|PURCHASE|PAYMENT)\s+/i,
    /^(VISA|MASTERCARD|AMEX)\s+/i,
  ];
  
  let vendor = cleaned;
  prefixes.forEach(prefix => {
    vendor = vendor.replace(prefix, '');
  });

  // Take first part before numbers or special patterns
  const parts = vendor.split(/\s+\d+|\s+#|\s+\*/).filter(Boolean);
  if (parts.length > 0) {
    vendor = parts[0];
  }

  // Capitalize first letter of each word
  vendor = vendor.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());

  return vendor || 'Unknown';
}

/**
 * Convert file to base64 string
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix to get just the base64 data
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Validate file type for receipts
 */
export function isValidReceiptFile(file: File): boolean {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  const maxSize = 10 * 1024 * 1024; // 10MB

  return validTypes.includes(file.type) && file.size <= maxSize;
}

/**
 * Validate CSV file
 */
export function isValidCSVFile(file: File): boolean {
  const validTypes = ['text/csv', 'application/csv'];
  const maxSize = 5 * 1024 * 1024; // 5MB

  return (
    validTypes.includes(file.type) || 
    file.name.toLowerCase().endsWith('.csv')
  ) && file.size <= maxSize;
}

/**
 * Clean and validate transaction input
 */
export function validateTransactionInput(input: any): TransactionInput | null {
  try {
    const amount = typeof input.amount === 'string' ? parseFloat(input.amount) : input.amount;
    if (isNaN(amount) || amount === 0) return null;

    return {
      amount,
      description: input.description?.trim() || 'Unknown transaction',
      vendor: input.vendor?.trim(),
      date: input.date ? new Date(input.date) : new Date(),
      category: input.category || 'Other',
      type: input.type || (amount > 0 ? 'income' : 'expense'),
      receiptUrl: input.receiptUrl
    };
  } catch {
    return null;
  }
} 