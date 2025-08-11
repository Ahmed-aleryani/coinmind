import { db, getUserId } from '../db/db';
import { RepositoryFactory } from '../repositories';
import { TransactionService } from './transaction.service';
import { GeminiService } from './gemini.service';

export class ServiceFactory {
  private static instance: ServiceFactory;
  private repositoryFactory: RepositoryFactory;
  private transactionService: TransactionService;
  private geminiService: GeminiService;

  private constructor() {
    this.repositoryFactory = RepositoryFactory.getInstance(db);
    
    // Initialize services with repositories
    this.transactionService = new TransactionService(
      this.repositoryFactory.transactions,
      this.repositoryFactory.profiles,
      this.repositoryFactory.categories,
      this.repositoryFactory.currencies
    );

    // Initialize Gemini service
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY is not set in environment variables');
    }
    
    this.geminiService = new GeminiService(
      this.repositoryFactory.transactions,
      this.repositoryFactory.profiles,
      this.repositoryFactory.categories,
      geminiApiKey
    );
  }

  static getInstance(): ServiceFactory {
    if (!ServiceFactory.instance) {
      ServiceFactory.instance = new ServiceFactory();
    }
    return ServiceFactory.instance;
  }

  get transactions(): TransactionService {
    return this.transactionService;
  }

  get gemini(): GeminiService {
    return this.geminiService;
  }

  get repositories(): RepositoryFactory {
    return this.repositoryFactory;
  }
}

// Helper function to get services with user context
export async function getServices(userIdOverride?: string) {
  const userId = userIdOverride || (await getUserId());
  const services = ServiceFactory.getInstance();
  
  // One-time ensure for currencies per process
  if (!(global as any).__cm_currenciesEnsured) {
    await services.repositories.currencies.ensureDefaultCurrencies();
    (global as any).__cm_currenciesEnsured = true;
  }
  
  // Ensure user profile exists (cache per user for process lifetime)
  const ensuredProfiles: Set<string> = (global as any).__cm_ensuredProfiles || new Set<string>();
  let profile;
  if (!ensuredProfiles.has(userId)) {
    profile = await services.repositories.profiles.ensureExists(userId, 'USD');
    ensuredProfiles.add(userId);
    (global as any).__cm_ensuredProfiles = ensuredProfiles;
  } else {
    profile = await services.repositories.profiles.findById(userId);
  }
  
  return {
    services,
    userId,
    profile,
  };
}

// Export individual services for convenience
export { TransactionService } from './transaction.service';
export { GeminiService } from './gemini.service'; 