import { pgTable, serial, char, varchar, integer, boolean, timestamp, text, decimal, date, uuid, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Currencies table
export const currencies = pgTable('currencies', {
  currencyCode: char('currency_code', { length: 3 }).primaryKey(),
  currencyName: varchar('currency_name', { length: 50 }).notNull(),
  symbol: varchar('symbol', { length: 5 }),
  decimalPlaces: integer('decimal_places').notNull().default(2),
});

// Profiles table (linked to Supabase auth.users)
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(), // References auth.users.id
  defaultCurrency: char('default_currency', { length: 3 }).notNull().references(() => currencies.currencyCode),
  emailVerified: boolean('email_verified').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Categories table
export const categories = pgTable('categories', {
  categoryId: serial('category_id').primaryKey(),
  ownerId: uuid('owner_id').references(() => profiles.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 50 }).notNull(),
  type: varchar('type', { length: 10 }).notNull(), // 'expense' or 'income'
  isDefault: boolean('is_default').notNull().default(false),
  parentCategoryId: integer('parent_category_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  uniqueOwnerNameType: unique().on(table.ownerId, table.name, table.type),
}));

// Transactions table
export const transactions = pgTable('transactions', {
  transactionId: serial('transaction_id').primaryKey(),
  ownerId: uuid('owner_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  categoryId: integer('category_id').notNull().references(() => categories.categoryId),
  currencyCode: char('currency_code', { length: 3 }).notNull().references(() => currencies.currencyCode),
  originalCurrency: char('original_currency', { length: 3 }).references(() => currencies.currencyCode),
  originalAmount: decimal('original_amount', { precision: 14, scale: 4 }),
  amount: decimal('amount', { precision: 14, scale: 4 }).notNull(),
  conversionRate: decimal('conversion_rate', { precision: 18, scale: 8 }).notNull(),
  convertedAmount: decimal('converted_amount', { precision: 14, scale: 4 }).notNull(),
  transactionDate: date('transaction_date').notNull(),
  description: text('description'),
  vendor: varchar('vendor', { length: 100 }), // Add vendor field
  type: varchar('type', { length: 10 }).notNull().default('expense'), // 'income' or 'expense'
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// User auth providers table (optional)
export const userAuthProviders = pgTable('user_auth_providers', {
  authId: serial('auth_id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 20 }).notNull(),
  providerUserId: varchar('provider_user_id', { length: 100 }).notNull(),
  providerEmail: varchar('provider_email', { length: 100 }).notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  uniqueProviderUser: unique().on(table.provider, table.providerUserId),
}));

// Define relations
export const profilesRelations = relations(profiles, ({ one, many }) => ({
  defaultCurrencyRelation: one(currencies, {
    fields: [profiles.defaultCurrency],
    references: [currencies.currencyCode],
  }),
  categories: many(categories),
  transactions: many(transactions),
  authProviders: many(userAuthProviders),
}));

export const currenciesRelations = relations(currencies, ({ many }) => ({
  profiles: many(profiles),
  transactions: many(transactions),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  owner: one(profiles, {
    fields: [categories.ownerId],
    references: [profiles.id],
  }),
  parent: one(categories, {
    fields: [categories.parentCategoryId],
    references: [categories.categoryId],
  }),
  children: many(categories),
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  owner: one(profiles, {
    fields: [transactions.ownerId],
    references: [profiles.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.categoryId],
  }),
  currency: one(currencies, {
    fields: [transactions.currencyCode],
    references: [currencies.currencyCode],
  }),
}));

export const userAuthProvidersRelations = relations(userAuthProviders, ({ one }) => ({
  user: one(profiles, {
    fields: [userAuthProviders.userId],
    references: [profiles.id],
  }),
}));

// Type definitions
export type Currency = typeof currencies.$inferSelect;
export type NewCurrency = typeof currencies.$inferInsert;

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

export type UserAuthProvider = typeof userAuthProviders.$inferSelect;
export type NewUserAuthProvider = typeof userAuthProviders.$inferInsert; 