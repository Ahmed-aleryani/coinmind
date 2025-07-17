import { Database } from '../db/db';
import { Repositories } from '../domain/repositories';
import { DrizzleTransactionRepository } from './transaction.repository';
import { DrizzleProfileRepository } from './profile.repository';
import { DrizzleCategoryRepository } from './category.repository';
import { DrizzleCurrencyRepository } from './currency.repository';

export class RepositoryFactory {
  private static instance: RepositoryFactory;
  private repositories: Repositories;

  private constructor(private db: Database) {
    this.repositories = {
      transactions: new DrizzleTransactionRepository(db),
      profiles: new DrizzleProfileRepository(db),
      categories: new DrizzleCategoryRepository(db),
      currencies: new DrizzleCurrencyRepository(db),
    };
  }

  static getInstance(db: Database): RepositoryFactory {
    if (!RepositoryFactory.instance) {
      RepositoryFactory.instance = new RepositoryFactory(db);
    }
    return RepositoryFactory.instance;
  }

  getRepositories(): Repositories {
    return this.repositories;
  }

  // Convenience methods for getting individual repositories
  get transactions() {
    return this.repositories.transactions;
  }

  get profiles() {
    return this.repositories.profiles;
  }

  get categories() {
    return this.repositories.categories;
  }

  get currencies() {
    return this.repositories.currencies;
  }
}

// Export individual repositories for direct import
export { DrizzleTransactionRepository } from './transaction.repository';
export { DrizzleProfileRepository } from './profile.repository';
export { DrizzleCategoryRepository } from './category.repository';
export { DrizzleCurrencyRepository } from './currency.repository'; 