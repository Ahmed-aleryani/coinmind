import Database from 'better-sqlite3';
import { Transaction, TransactionInput } from '../types/transaction';
import { ChatMessage } from '../types/chat';

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
  // Transactions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      vendor TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      receipt_url TEXT,
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

  create: (transaction: TransactionInput) => {
    const id = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    const stmt = db.prepare(`
      INSERT INTO transactions (id, date, amount, vendor, description, category, type, receipt_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      (transaction.date || new Date()).toISOString(),
      transaction.amount,
      transaction.vendor || 'Unknown',
      transaction.description,
      transaction.category || 'Other',
      transaction.type || (transaction.amount > 0 ? 'income' : 'expense'),
      transaction.receiptUrl || null,
      now,
      now
    );

    return transactionDb.getById(id);
  },

  update: (id: string, updates: Partial<TransactionInput>) => {
    const fields = [];
    const values = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        if (key === 'date') {
          fields.push('date = ?');
          values.push((value as Date).toISOString());
        } else if (key === 'receiptUrl') {
          fields.push('receipt_url = ?');
          values.push(value);
        } else {
          fields.push(`${key} = ?`);
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

  getStats: (startDate?: Date, endDate?: Date) => {
    let whereClause = '';
    const params = [];

    if (startDate && endDate) {
      whereClause = 'WHERE date >= ? AND date <= ?';
      params.push(startDate.toISOString(), endDate.toISOString());
    }

    const stmt = db.prepare(`
      SELECT 
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END) as total_expenses,
        COUNT(*) as transaction_count,
        category,
        SUM(ABS(amount)) as category_total,
        COUNT(*) as category_count
      FROM transactions
      ${whereClause}
      GROUP BY category
    `);

    const results = stmt.all(...params);
    
    // Process results to calculate stats
    let totalIncome = 0;
    let totalExpenses = 0;
    let transactionCount = 0;
    const categoryStats: Array<{ category: string; amount: number; count: number }> = [];

    results.forEach((row: any) => {
      totalIncome += Number(row.total_income) || 0;
      totalExpenses += Number(row.total_expenses) || 0;
      transactionCount += Number(row.category_count) || 0;
      
      if (row.category) {
        categoryStats.push({
          category: row.category,
          amount: Number(row.category_total) || 0,
          count: Number(row.category_count) || 0
        });
      }
    });

    return {
      totalIncome,
      totalExpenses,
      netAmount: totalIncome - totalExpenses,
      transactionCount,
      averageTransaction: transactionCount > 0 ? (totalIncome + totalExpenses) / transactionCount : 0,
      topCategories: categoryStats.sort((a, b) => b.amount - a.amount).slice(0, 10)
    };
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
    vendor: row.vendor,
    description: row.description,
    category: row.category,
    type: row.type,
    receiptUrl: row.receipt_url || undefined,
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