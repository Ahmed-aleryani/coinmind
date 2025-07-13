/**
 * Validation utilities for transaction and data validation
 */

import { TransactionCategory } from '@/lib/types/transaction';
import { CurrencyFormatter } from './currency-formatter';

export interface TransactionValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface TransactionData {
  description?: string;
  amount?: number;
  currency?: string;
  category?: string;
  type?: 'income' | 'expense';
  date?: Date;
  vendor?: string;
}

/**
 * Validate transaction data
 */
export function validateTransaction(transaction: TransactionData): TransactionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields validation
  if (!transaction.description || transaction.description.trim().length === 0) {
    errors.push('Description is required');
  }

  if (transaction.amount === undefined || transaction.amount === null) {
    errors.push('Amount is required');
  } else if (isNaN(transaction.amount)) {
    errors.push('Amount must be a valid number');
  }

  // Currency validation
  if (transaction.currency) {
    if (!CurrencyFormatter.isValidCurrencyCode(transaction.currency)) {
      warnings.push(`Currency code '${transaction.currency}' may not be supported`);
    }
  }

  // Category validation
  if (transaction.category) {
    if (!isValidCategory(transaction.category)) {
      warnings.push(`Category '${transaction.category}' may not be recognized`);
    }
  }

  // Date validation
  if (transaction.date) {
    if (!isValidDate(transaction.date)) {
      errors.push('Date must be a valid date');
    }
  }

  // Type validation
  if (transaction.type && !['income', 'expense'].includes(transaction.type)) {
    errors.push('Type must be either "income" or "expense"');
  }

  // Amount type consistency
  if (transaction.amount !== undefined && transaction.type) {
    const amount = transaction.amount;
    const type = transaction.type;
    
    if (type === 'income' && amount < 0) {
      warnings.push('Income amount is negative - consider using "expense" type');
    }
    
    if (type === 'expense' && amount > 0) {
      warnings.push('Expense amount is positive - consider using "income" type');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate currency code (now uses CurrencyFormatter)
 */
export function isValidCurrencyCode(currencyCode: string): boolean {
  return CurrencyFormatter.isValidCurrencyCode(currencyCode);
}

/**
 * Validate category
 */
export function isValidCategory(category: string): boolean {
  const validCategories: TransactionCategory[] = [
    'Food & Drink',
    'Transportation',
    'Utilities',
    'Entertainment',
    'Shopping',
    'Healthcare',
    'Education',
    'Income',
    'Transfer',
    'Other'
  ];
  
  return validCategories.includes(category as TransactionCategory);
}

/**
 * Validate date
 */
export function isValidDate(date: any): boolean {
  if (!date) return false;
  
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime());
}

/**
 * Validate amount
 */
export function isValidAmount(amount: any): boolean {
  if (amount === undefined || amount === null) return false;
  
  const num = Number(amount);
  return !isNaN(num) && isFinite(num);
}

/**
 * Sanitize transaction data
 */
export function sanitizeTransaction(transaction: TransactionData): TransactionData {
  return {
    description: transaction.description?.trim() || '',
    amount: transaction.amount !== undefined ? Number(transaction.amount) : 0,
    currency: transaction.currency?.toUpperCase() || 'USD',
    category: transaction.category || 'Other',
    type: transaction.type || (transaction.amount && transaction.amount > 0 ? 'income' : 'expense'),
    date: transaction.date || new Date(),
    vendor: transaction.vendor?.trim() || 'Unknown'
  };
}

/**
 * Validate CSV import data
 */
export function validateCSVData(data: any[]): TransactionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(data)) {
    errors.push('Data must be an array');
    return { isValid: false, errors, warnings };
  }

  if (data.length === 0) {
    errors.push('No data to import');
    return { isValid: false, errors, warnings };
  }

  // Check for required fields in first row
  const firstRow = data[0];
  const requiredFields = ['description', 'amount'];
  
  for (const field of requiredFields) {
    if (!(field in firstRow)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate each row
  data.forEach((row, index) => {
    const rowValidation = validateTransaction(row);
    if (!rowValidation.isValid) {
      errors.push(`Row ${index + 1}: ${rowValidation.errors.join(', ')}`);
    }
    if (rowValidation.warnings.length > 0) {
      warnings.push(`Row ${index + 1}: ${rowValidation.warnings.join(', ')}`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate user settings
 */
export function validateUserSettings(settings: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (settings.defaultCurrency && !isValidCurrencyCode(settings.defaultCurrency)) {
    errors.push('Invalid default currency code');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
} 