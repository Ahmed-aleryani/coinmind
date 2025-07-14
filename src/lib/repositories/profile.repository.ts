import { eq } from 'drizzle-orm';
import { Database } from '../db/db';
import { profiles, Profile, NewProfile } from '../db/schema';
import { ProfileRepository } from '../domain/repositories';
import { DrizzleCategoryRepository } from './category.repository';
import logger from '../utils/logger';

export class DrizzleProfileRepository implements ProfileRepository {
  constructor(private db: Database) {}

  async create(profile: NewProfile): Promise<Profile> {
    try {
      const [result] = await this.db
        .insert(profiles)
        .values(profile)
        .returning();

      logger.info({ profileId: result.id }, 'Profile created successfully');
      return result;
    } catch (error) {
      logger.error({ error, profile }, 'Failed to create profile');
      throw new Error('Failed to create profile');
    }
  }

  async findById(id: string): Promise<Profile | null> {
    try {
      const [result] = await this.db
        .select()
        .from(profiles)
        .where(eq(profiles.id, id))
        .limit(1);

      return result || null;
    } catch (error) {
      logger.error({ error, id }, 'Failed to find profile by ID');
      return null;
    }
  }

  async update(id: string, updates: Partial<NewProfile>): Promise<Profile | null> {
    try {
      const [result] = await this.db
        .update(profiles)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, id))
        .returning();

      if (result) {
        logger.info({ profileId: id }, 'Profile updated successfully');
      }

      return result || null;
    } catch (error) {
      logger.error({ error, id, updates }, 'Failed to update profile');
      throw new Error('Failed to update profile');
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(profiles)
        .where(eq(profiles.id, id))
        .returning();

      const success = result.length > 0;
      if (success) {
        logger.info({ profileId: id }, 'Profile deleted successfully');
      }

      return success;
    } catch (error) {
      logger.error({ error, id }, 'Failed to delete profile');
      return false;
    }
  }

  async ensureExists(id: string, defaultCurrency = 'USD'): Promise<Profile> {
    try {
      // First try to find existing profile
      const existingProfile = await this.findById(id);
      if (existingProfile) {
        logger.info({ profileId: id }, 'Profile already exists');
        return existingProfile;
      }

      // Determine default currency based on user context or system default
      const userDefaultCurrency = await this.detectUserDefaultCurrency() || defaultCurrency;

      // Create new profile if it doesn't exist
      const newProfile: NewProfile = {
        id,
        defaultCurrency: userDefaultCurrency,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      logger.info({ profileId: id, defaultCurrency: userDefaultCurrency }, 'Creating new profile for user');
      const profile = await this.create(newProfile);
      
      // Create default categories for the new user
      await this.createDefaultCategories(id);
      
      return profile;
    } catch (error) {
      logger.error({ error, id, defaultCurrency }, 'Failed to ensure profile exists');
      throw new Error('Failed to ensure profile exists');
    }
  }

  private async detectUserDefaultCurrency(): Promise<string | null> {
    // This could be enhanced to detect currency based on:
    // - User's location/IP
    // - Browser locale
    // - Previous user preferences
    // For now, we'll use a simple fallback with some basic detection
    
    try {
      // Check if we're in a development environment and can access headers
      if (process.env.NODE_ENV === 'development') {
        // In development, you could check for any locale preferences
        // For now, just return null to use system default
        return null;
      }
      
      // In production, you could implement IP-based location detection
      // or browser locale detection here
      return null;
    } catch (error) {
      logger.debug({ error }, 'Could not detect user default currency');
      return null;
    }
  }

  private async createDefaultCategories(userId: string): Promise<void> {
    try {
      const defaultCategories = [
        { name: 'Food & Dining', type: 'expense' as const, isDefault: true },
        { name: 'Shopping', type: 'expense' as const, isDefault: true },
        { name: 'Transportation', type: 'expense' as const, isDefault: true },
        { name: 'Entertainment', type: 'expense' as const, isDefault: true },
        { name: 'Bills & Utilities', type: 'expense' as const, isDefault: true },
        { name: 'Healthcare', type: 'expense' as const, isDefault: true },
        { name: 'Education', type: 'expense' as const, isDefault: true },
        { name: 'Travel', type: 'expense' as const, isDefault: true },
        { name: 'Other Expenses', type: 'expense' as const, isDefault: true },
        { name: 'Salary', type: 'income' as const, isDefault: true },
        { name: 'Business', type: 'income' as const, isDefault: true },
        { name: 'Investment', type: 'income' as const, isDefault: true },
        { name: 'Gift', type: 'income' as const, isDefault: true },
        { name: 'Other Income', type: 'income' as const, isDefault: true },
      ];

      // Use the category repository to create default categories
      const categoryRepo = new DrizzleCategoryRepository(this.db);
      
      for (const category of defaultCategories) {
        try {
          await categoryRepo.create({
            ownerId: userId,
            name: category.name,
            type: category.type,
            isDefault: category.isDefault,
            parentCategoryId: null,
            createdAt: new Date(),
          });
        } catch (error) {
          // If category already exists, that's fine
          logger.debug({ categoryName: category.name, userId }, 'Category may already exist');
        }
      }

      logger.info({ userId }, 'Default categories created successfully');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to create default categories');
      // Don't throw here - profile creation should still succeed
    }
  }
} 