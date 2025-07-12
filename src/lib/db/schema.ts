import Database from 'better-sqlite3';
import { Transaction, TransactionInput, UserSettings } from '../types/transaction';
import { ChatMessage } from '../types/chat';
import { convertAmount, getExchangeRate } from '../utils/currency';

const DB_PATH = process.env.DATABASE_URL || './data/finance.db';

let db: Database.Database;

export function initDatabase() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    
    // Create tables
    createTables();
  }
  return db;
}

function createTables() {
  // User settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      default_currency TEXT NOT NULL DEFAULT 'USD',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Transactions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      vendor TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      receipt_url TEXT,
      -- Multi-currency fields
      original_amount REAL,
      original_currency TEXT,
      converted_amount REAL,
      converted_currency TEXT,
      conversion_rate REAL,
      conversion_fee REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Chat sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Chat messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      content TEXT NOT NULL,
      sender TEXT NOT NULL CHECK(sender IN ('user', 'assistant')),
      timestamp TEXT NOT NULL,
      transaction_id TEXT,
      metadata TEXT, -- JSON string
      FOREIGN KEY (session_id) REFERENCES chat_sessions (id),
      FOREIGN KEY (transaction_id) REFERENCES transactions (id)
    )
  `);

  // Create indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id)');
}



// Transaction CRUD operations
export const transactionDb = {
  getAll: (limit = 100, offset = 0) => {
    const stmt = db.prepare(`
      SELECT * FROM transactions 
      ORDER BY date DESC, created_at DESC 
      LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset).map(deserializeTransaction);
  },

  getById: (id: string) => {
    const stmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
    const result = stmt.get(id);
    return result ? deserializeTransaction(result as Record<string, unknown>) : null;
  },

  create: async (transaction: TransactionInput) => {
    const id = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    // Backend fallback for currency detection from description
    if (!transaction.currency && transaction.description) {
      if (/ريال|ريالات|ر\.س|SAR/i.test(transaction.description)) {
        transaction.currency = 'SAR';
      }
    }
    // Debug log for transaction input (can be enabled in development)
    if (process.env.NODE_ENV === 'development') {
      console.debug('DEBUG TRANSACTION INPUT:', transaction);
    }

    const userSettings = userSettingsDb.get() || { defaultCurrency: 'USD' };
    const defaultCurrency = userSettings.defaultCurrency || 'USD';
    

    
    // Handle both legacy and new multi-currency formats
    let originalAmount: number;
    let originalCurrency: string;
    let convertedAmount: number;
    let convertedCurrency: string;
    let conversionRate: number;
    let conversionFee: number;

    if (transaction.originalAmount !== undefined && transaction.convertedAmount !== undefined) {
      // New multi-currency format
      originalAmount = transaction.originalAmount;
      originalCurrency = transaction.originalCurrency || defaultCurrency;
      convertedAmount = transaction.convertedAmount;
      convertedCurrency = transaction.convertedCurrency || defaultCurrency;
      conversionRate = transaction.conversionRate || 1;
      conversionFee = transaction.conversionFee || 0;
    } else {
      // Legacy format - convert to multi-currency
      originalAmount = transaction.amount || 0;
      originalCurrency = transaction.currency || defaultCurrency;
      convertedAmount = originalAmount;
      convertedCurrency = defaultCurrency;
      conversionRate = 1;
      conversionFee = 0;
      
      // Convert if different currency
      if (originalCurrency !== defaultCurrency) {
        try {
          console.log(`Converting ${originalAmount} ${originalCurrency} to ${defaultCurrency}`);
          conversionRate = await getExchangeRate(originalCurrency, defaultCurrency);
          convertedAmount = originalAmount * conversionRate;
          convertedCurrency = defaultCurrency;
          console.log(`Conversion result: ${convertedAmount} ${convertedCurrency} (rate: ${conversionRate})`);
        } catch (error) {
          console.error('Currency conversion failed:', error);
          // Keep original values if conversion fails
          convertedAmount = originalAmount;
          convertedCurrency = originalCurrency;
          conversionRate = 1;
        }
      } else {
        console.log(`No conversion needed: ${originalCurrency} = ${defaultCurrency}`);
      }
    }

    const stmt = db.prepare(`
      INSERT INTO transactions (id, date, amount, currency, vendor, description, category, type, receipt_url, original_amount, original_currency, converted_amount, converted_currency, conversion_rate, conversion_fee, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      (transaction.date || new Date()).toISOString(),
      convertedAmount, // amount (for backward compatibility, use converted)
      convertedCurrency, // currency (for backward compatibility, use converted)
      transaction.vendor || 'Unknown',
      transaction.description,
      transaction.category || 'Other',
      transaction.type || (originalAmount > 0 ? 'income' : 'expense'),
      transaction.receiptUrl || null,
      originalAmount,
      originalCurrency,
      convertedAmount,
      convertedCurrency,
      conversionRate,
      conversionFee,
      now,
      now
    );
    
    const createdTransaction = transactionDb.getById(id);
    
    return createdTransaction;
  },

  update: (id: string, updates: Partial<TransactionInput>) => {
    const fields = [];
    const values = [];

    // Map camelCase property names to database column names
    const columnMapping: Record<string, string> = {
      'originalAmount': 'original_amount',
      'originalCurrency': 'original_currency',
      'convertedAmount': 'converted_amount',
      'convertedCurrency': 'converted_currency',
      'conversionRate': 'conversion_rate',
      'conversionFee': 'conversion_fee',
      'receiptUrl': 'receipt_url'
    };

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        if (key === 'date') {
          fields.push('date = ?');
          values.push((value as Date).toISOString());
        } else {
          // Use column mapping if available, otherwise use the key as-is
          const columnName = columnMapping[key] || key;
          fields.push(`${columnName} = ?`);
          values.push(value);
        }
      }
    });

    if (fields.length === 0) return transactionDb.getById(id);

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const stmt = db.prepare(`UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return transactionDb.getById(id);
  },

  delete: (id: string) => {
    const stmt = db.prepare('DELETE FROM transactions WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },

  search: (query: string, limit = 50) => {
    const stmt = db.prepare(`
      SELECT * FROM transactions 
      WHERE description LIKE ? OR vendor LIKE ? OR category LIKE ?
      ORDER BY date DESC, created_at DESC
      LIMIT ?
    `);
    const searchTerm = `%${query}%`;
    return stmt.all(searchTerm, searchTerm, searchTerm, limit).map(deserializeTransaction);
  },

  getByDateRange: (startDate: Date, endDate: Date) => {
    const stmt = db.prepare(`
      SELECT * FROM transactions 
      WHERE date >= ? AND date <= ?
      ORDER BY date DESC, created_at DESC
    `);
    return stmt.all(startDate.toISOString(), endDate.toISOString()).map(deserializeTransaction);
  },

  getStats: async (startDate?: Date, endDate?: Date) => {
    let whereClause = '';
    const params = [];

    if (startDate && endDate) {
      whereClause = 'WHERE date >= ? AND date <= ?';
      params.push(startDate.toISOString(), endDate.toISOString());
    }

    const stmt = db.prepare(`
      SELECT * FROM transactions
      ${whereClause}
    `);
    const transactions = stmt.all(...params).map(deserializeTransaction);

    const userSettings = userSettingsDb.get() || { defaultCurrency: 'USD' };
    const defaultCurrency = userSettings.defaultCurrency || 'USD';

    let totalIncome = 0;
    let totalExpenses = 0;
    let transactionCount = 0;
    const categoryStats: Array<{ category: string; amount: number; count: number }> = [];
    const categoryMap: Record<string, { amount: number; count: number }> = {};

    const uniqueCurrencies = [...new Set(transactions.map(tx => tx.currency))];
    const exchangeRates: Record<string, number> = {};
    for (const currency of uniqueCurrencies) {
      if (currency !== defaultCurrency) {
        exchangeRates[currency] = await getExchangeRate(currency, defaultCurrency);
      }
    }

    for (const tx of transactions) {
      let amount = tx.amount;
      if (tx.currency !== defaultCurrency) {
        const rate = exchangeRates[tx.currency];
        amount = tx.amount * rate;
      }
      if (tx.type === 'income') totalIncome += amount;
      if (tx.type === 'expense') totalExpenses += Math.abs(amount);
      transactionCount++;
      if (!categoryMap[tx.category]) categoryMap[tx.category] = { amount: 0, count: 0 };
      categoryMap[tx.category].amount += Math.abs(amount);
      categoryMap[tx.category].count++;
    }
    for (const [category, { amount, count }] of Object.entries(categoryMap)) {
      categoryStats.push({ category, amount, count });
    }
    return {
      totalIncome,
      totalExpenses,
      netAmount: totalIncome - totalExpenses,
      transactionCount,
      averageTransaction: transactionCount > 0 ? (totalIncome + totalExpenses) / transactionCount : 0,
      defaultCurrency,
      topCategories: categoryStats.sort((a, b) => b.amount - a.amount).slice(0, 10)
    };
  }
};

// User settings operations
export const userSettingsDb = {
  get: () => {
    const stmt = db.prepare('SELECT * FROM user_settings WHERE id = ?');
    const result = stmt.get('default');
    return result ? deserializeUserSettings(result as Record<string, unknown>) : null;
  },

  update: (settings: { defaultCurrency: string }) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO user_settings (id, default_currency, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run('default', settings.defaultCurrency);
    return userSettingsDb.get();
  },

  initialize: () => {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO user_settings (id, default_currency, created_at, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    stmt.run('default', 'USD');
    return userSettingsDb.get();
  }
};

// Chat operations
export const chatDb = {
  createSession: () => {
    const id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const stmt = db.prepare(`
      INSERT INTO chat_sessions (id, created_at, updated_at)
      VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    stmt.run(id);
    return id;
  },

  addMessage: (sessionId: string, message: Omit<ChatMessage, 'id'>) => {
    const id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const stmt = db.prepare(`
      INSERT INTO chat_messages (id, session_id, content, sender, timestamp, transaction_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      sessionId,
      message.content,
      message.sender,
      message.timestamp.toISOString(),
      message.transactionId || null,
      message.metadata ? JSON.stringify(message.metadata) : null
    );

    return id;
  },

  getMessages: (sessionId: string) => {
    const stmt = db.prepare(`
      SELECT * FROM chat_messages 
      WHERE session_id = ? 
      ORDER BY timestamp ASC
    `);
    return stmt.all(sessionId).map(deserializeChatMessage);
  }
};

// Helper functions
function deserializeTransaction(row: any): Transaction {
  return {
    id: row.id,
    date: new Date(row.date),
    amount: Number(row.amount),
    currency: row.currency || 'USD',
    vendor: row.vendor,
    description: row.description,
    category: row.category,
    type: row.type,
    receiptUrl: row.receipt_url || undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    originalAmount: row.original_amount !== undefined ? Number(row.original_amount) : undefined,
    originalCurrency: row.original_currency || undefined,
    convertedAmount: row.converted_amount !== undefined ? Number(row.converted_amount) : undefined,
    convertedCurrency: row.converted_currency || undefined,
    conversionRate: row.conversion_rate !== undefined ? Number(row.conversion_rate) : undefined,
    conversionFee: row.conversion_fee !== undefined ? Number(row.conversion_fee) : undefined
  };
}

function deserializeUserSettings(row: any): UserSettings {
  return {
    id: row.id,
    defaultCurrency: row.default_currency,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

function deserializeChatMessage(row: any): ChatMessage {
  return {
    id: row.id,
    content: row.content,
    sender: row.sender,
    timestamp: new Date(row.timestamp),
    transactionId: row.transaction_id || undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined
  };
}

// Initialize database on import
if (typeof window === 'undefined') {
  // Only run on server side
  try {
    initDatabase();
  } catch (error) {
    console.error('Failed to initialize database:', error);
  }
} 