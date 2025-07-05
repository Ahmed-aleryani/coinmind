import { format, formatDistanceToNow, isToday, isYesterday, startOfMonth, endOfMonth } from 'date-fns';

/**
 * Format currency amounts
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

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });

  const formatted = formatter.format(Math.abs(amount));
  
  if (showSign) {
    if (amount > 0) return `+${formatted}`;
    if (amount < 0) return `-${formatted}`;
  }
  
  return formatted;
}

/**
 * Format amounts with color context
 */
export function formatAmountWithColor(amount: number): {
  formatted: string;
  color: 'green' | 'red' | 'gray';
} {
  if (amount > 0) {
    return {
      formatted: formatCurrency(amount, { showSign: true }),
      color: 'green'
    };
  } else if (amount < 0) {
    return {
      formatted: formatCurrency(amount, { showSign: true }),
      color: 'red'
    };
  } else {
    return {
      formatted: formatCurrency(amount),
      color: 'gray'
    };
  }
}

/**
 * Format dates for display
 */
export function formatDate(date: Date, style: 'short' | 'medium' | 'long' | 'relative' = 'medium'): string {
  if (!date || isNaN(date.getTime())) return 'Invalid date';

  switch (style) {
    case 'short':
      return format(date, 'MM/dd');
    case 'medium':
      return format(date, 'MMM dd, yyyy');
    case 'long':
      return format(date, 'EEEE, MMMM dd, yyyy');
    case 'relative':
      if (isToday(date)) return 'Today';
      if (isYesterday(date)) return 'Yesterday';
      return formatDistanceToNow(date, { addSuffix: true });
    default:
      return format(date, 'MMM dd, yyyy');
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
    'Food & Drink': '🍽️',
    'Transportation': '🚗',
    'Utilities': '⚡',
    'Entertainment': '🎬',
    'Shopping': '🛍️',
    'Healthcare': '🏥',
    'Education': '📚',
    'Income': '💰',
    'Transfer': '🔄',
    'Other': '📝'
  };
  
  return emojiMap[category] || '📝';
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
export function formatTransactionAmount(amount: number, type: 'income' | 'expense'): {
  formatted: string;
  className: string;
} {
  const absAmount = Math.abs(amount);
  const formatted = formatCurrency(absAmount);
  
  if (type === 'income') {
    return {
      formatted: `+${formatted}`,
      className: 'text-green-600 dark:text-green-400'
    };
  } else {
    return {
      formatted: `-${formatted}`,
      className: 'text-red-600 dark:text-red-400'
    };
  }
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