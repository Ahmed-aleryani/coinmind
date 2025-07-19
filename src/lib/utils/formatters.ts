import { format, formatDistanceToNow, isToday, isYesterday, startOfMonth, endOfMonth } from 'date-fns';
import { CurrencyFormatter } from './currency-formatter';

/**
 * Format currency amounts (legacy function - use CurrencyFormatter.format instead)
 * @deprecated Use CurrencyFormatter.format() instead
 */
export function formatCurrency(amount: number, options: {
  showSign?: boolean;
  showCents?: boolean;
  currency?: string;
} = {}): string {
  const {
    showSign = false,
    showCents = true,
    currency = 'USD'
  } = options;

  return CurrencyFormatter.format(amount, currency, {
    showSign,
    showCents,
    currency
  });
}

/**
 * Format amounts with color context
 */
export function formatAmountWithColor(amount: number, currencyCode: string = 'USD'): {
  formatted: string;
  color: 'green' | 'red' | 'gray';
} {
  return CurrencyFormatter.formatWithColor(amount, currencyCode);
}

/**
 * Format dates for display
 * Fixed to handle timezone issues properly for transaction dates
 */
export function formatDate(date: Date, style: 'short' | 'medium' | 'long' | 'relative' = 'medium'): string {
  if (!date || isNaN(date.getTime())) return 'Invalid date';

  // Convert to local date to avoid timezone issues with transaction dates
  // This ensures that if a transaction was created on July 11, it shows as July 11
  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  switch (style) {
    case 'short':
      return format(localDate, 'MM/dd');
    case 'medium':
      return format(localDate, 'MMM dd, yyyy');
    case 'long':
      return format(localDate, 'EEEE, MMMM dd, yyyy');
    case 'relative':
      if (isToday(localDate)) return 'Today';
      if (isYesterday(localDate)) return 'Yesterday';
      return formatDistanceToNow(localDate, { addSuffix: true });
    default:
      return format(localDate, 'MMM dd, yyyy');
  }
}

/**
 * Format time for chat messages
 */
export function formatMessageTime(date: Date): string {
  if (isToday(date)) {
    return format(date, 'h:mm a');
  } else if (isYesterday(date)) {
    return 'Yesterday ' + format(date, 'h:mm a');
  } else {
    return format(date, 'MMM dd, h:mm a');
  }
}

/**
 * Format transaction categories for display
 */
export function formatCategory(category: string): string {
  return category.replace(/([A-Z])/g, ' $1').trim();
}

/**
 * Get category emoji
 */
export function getCategoryEmoji(category: string): string {
  const emojiMap: Record<string, string> = {
    // Food & Dining
    'Food & Dining': '🍽️',
    'Food & Drink': '🍽️',
    'Restaurants': '🍕',
    'Groceries': '🛒',
    'Coffee': '☕',
    
    // Shopping
    'Shopping': '🛍️',
    'Clothing': '👕',
    'Electronics': '📱',
    'Gifts': '🎁',
    
    // Transportation
    'Transportation': '🚗',
    'Gas': '⛽',
    'Public Transport': '🚌',
    'Taxi': '🚕',
    'Parking': '🅿️',
    'Car Maintenance': '🔧',
    
    // Entertainment
    'Entertainment': '🎬',
    'Movies': '🎭',
    'Games': '🎮',
    'Sports': '⚽',
    'Music': '🎵',
    'Theater': '🎪',
    
    // Bills & Utilities
    'Bills & Utilities': '💡',
    'Utilities': '⚡',
    'Electricity': '⚡',
    'Water': '💧',
    'Internet': '🌐',
    'Phone': '📞',
    'Rent': '🏠',
    'Mortgage': '🏡',
    
    // Healthcare
    'Healthcare': '🏥',
    'Medical': '💊',
    'Dental': '🦷',
    'Pharmacy': '💊',
    'Insurance': '🛡️',
    
    // Education
    'Education': '📚',
    'Tuition': '🎓',
    'Books': '📖',
    'Courses': '📝',
    
    // Travel
    'Travel': '✈️',
    'Flights': '🛫',
    'Hotels': '🏨',
    'Vacation': '🏖️',
    
    // Business
    'Business': '🏢',
    'Office': '💼',
    'Equipment': '🖥️',
    'Marketing': '📢',
    
    // Income
    'Salary': '💰',
    'Income': '💰',
    'Investment': '📈',
    'Freelance': '💻',
    'Bonus': '🎉',
    
    // Other Expenses
    'Other Expenses': '💸',
    'Other': '📝',
    'Fees': '💳',
    'Taxes': '📋',
    
    // Transfers
    'Transfer': '🔄',
    'Deposit': '📥',
    'Withdrawal': '📤',
    
    // Gifts
    'Gift': '🎁',
    'Charity': '❤️',
    
    // Other Income
    'Other Income': '➕',
    'Refund': '↩️',
    'Rebate': '💵'
  };
  
  // Try exact match first
  if (emojiMap[category]) {
    return emojiMap[category];
  }
  
  // Try partial matches for categories that might have variations
  const lowerCategory = category.toLowerCase();
  
  if (lowerCategory.includes('food') || lowerCategory.includes('dining') || lowerCategory.includes('restaurant')) {
    return '🍽️';
  }
  if (lowerCategory.includes('shopping') || lowerCategory.includes('store')) {
    return '🛍️';
  }
  if (lowerCategory.includes('transport') || lowerCategory.includes('car') || lowerCategory.includes('gas')) {
    return '🚗';
  }
  if (lowerCategory.includes('entertainment') || lowerCategory.includes('movie') || lowerCategory.includes('game')) {
    return '🎬';
  }
  if (lowerCategory.includes('bill') || lowerCategory.includes('utility') || lowerCategory.includes('electric')) {
    return '💡';
  }
  if (lowerCategory.includes('health') || lowerCategory.includes('medical') || lowerCategory.includes('doctor')) {
    return '🏥';
  }
  if (lowerCategory.includes('education') || lowerCategory.includes('school') || lowerCategory.includes('course')) {
    return '📚';
  }
  if (lowerCategory.includes('travel') || lowerCategory.includes('flight') || lowerCategory.includes('hotel')) {
    return '✈️';
  }
  if (lowerCategory.includes('income') || lowerCategory.includes('salary') || lowerCategory.includes('payment')) {
    return '💰';
  }
  if (lowerCategory.includes('business') || lowerCategory.includes('work') || lowerCategory.includes('office')) {
    return '🏢';
  }
  if (lowerCategory.includes('gift') || lowerCategory.includes('charity')) {
    return '🎁';
  }
  
  // Default fallback
  return '💳';
}

/**
 * Format percentage values
 */
export function formatPercentage(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format numbers with appropriate units (K, M, B)
 */
export function formatCompactNumber(num: number): string {
  if (Math.abs(num) >= 1e9) {
    return (num / 1e9).toFixed(1) + 'B';
  } else if (Math.abs(num) >= 1e6) {
    return (num / 1e6).toFixed(1) + 'M';
  } else if (Math.abs(num) >= 1e3) {
    return (num / 1e3).toFixed(1) + 'K';
  } else {
    return num.toString();
  }
}

/**
 * Format file sizes
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format progress percentage
 */
export function formatProgress(current: number, total: number): string {
  if (total === 0) return '0%';
  const percentage = (current / total) * 100;
  return `${Math.round(percentage)}%`;
}

/**
 * Generate month labels for charts
 */
export function generateMonthLabels(months: number = 6): string[] {
  const labels = [];
  const now = new Date();
  
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(format(date, 'MMM'));
  }
  
  return labels;
}

/**
 * Get date range for current month
 */
export function getCurrentMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  return {
    start: startOfMonth(now),
    end: endOfMonth(now)
  };
}

/**
 * Get transaction display name
 */
export function getTransactionDisplayName(vendor?: string, description?: string): string {
  if (vendor && vendor !== 'Unknown') {
    return vendor;
  }
  
  if (description) {
    // Capitalize first word and limit length
    const cleaned = description.trim();
    const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
    return capitalized.length > 30 ? capitalized.substring(0, 30) + '...' : capitalized;
  }
  
  return 'Unknown Transaction';
}

/**
 * Format transaction amount for display in lists
 */
export function formatTransactionAmount(amount: number, type: 'income' | 'expense', currencyCode: string = 'USD'): {
  formatted: string;
  className: string;
} {
  return CurrencyFormatter.formatTransactionAmount(amount, type, currencyCode);
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Format chat bot responses
 */
export function formatBotResponse(message: string): string {
  // Add line breaks for better readability
  return message
    .replace(/\. /g, '.\n')
    .replace(/: /g, ':\n')
    .trim();
}

/**
 * Get relative time for chat messages
 */
export function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  
  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  
  return formatDate(date, 'short');
}

/**
 * Format search results count
 */
export function formatSearchResults(count: number): string {
  if (count === 0) return 'No results found';
  if (count === 1) return '1 result found';
  return `${count} results found`;
}

/**
 * Format import progress status
 */
export function formatImportStatus(
  processed: number,
  total: number,
  errors: number,
  skipped: number
): string {
  const successful = processed - errors - skipped;
  return `${successful} imported, ${errors} errors, ${skipped} skipped`;
} 