import { eq, and, isNull } from 'drizzle-orm';
import { Database } from '../db/db';
import { categories, Category, NewCategory } from '../db/schema';
import { CategoryRepository } from '../domain/repositories';
import logger from '../utils/logger';

export class DrizzleCategoryRepository implements CategoryRepository {
  constructor(private db: Database) {}

  async create(category: NewCategory): Promise<Category> {
    try {
      const [result] = await this.db
        .insert(categories)
        .values(category)
        .returning();

      logger.info({ categoryId: result.categoryId }, 'Category created successfully');
      return result;
    } catch (error) {
      logger.error({ error, category }, 'Failed to create category');
      throw new Error('Failed to create category');
    }
  }

  async findById(id: number): Promise<Category | null> {
    try {
      const [result] = await this.db
        .select()
        .from(categories)
        .where(eq(categories.categoryId, id))
        .limit(1);

      return result || null;
    } catch (error) {
      logger.error({ error, id }, 'Failed to find category by ID');
      return null;
    }
  }

  async findByUserId(userId: string): Promise<Category[]> {
    try {
      const results = await this.db
        .select()
        .from(categories)
        .where(eq(categories.ownerId, userId))
        .orderBy(categories.name);

      return results;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to find categories by user ID');
      return [];
    }
  }

  async findDefaults(): Promise<Category[]> {
    try {
      const results = await this.db
        .select()
        .from(categories)
        .where(and(eq(categories.isDefault, true), isNull(categories.ownerId)))
        .orderBy(categories.name);

      return results;
    } catch (error) {
      logger.error({ error }, 'Failed to find default categories');
      return [];
    }
  }

  async update(id: number, updates: Partial<NewCategory>): Promise<Category | null> {
    try {
      const [result] = await this.db
        .update(categories)
        .set(updates)
        .where(eq(categories.categoryId, id))
        .returning();

      if (result) {
        logger.info({ categoryId: id }, 'Category updated successfully');
      }

      return result || null;
    } catch (error) {
      logger.error({ error, id, updates }, 'Failed to update category');
      throw new Error('Failed to update category');
    }
  }

  async delete(id: number): Promise<boolean> {
    try {
      const result = await this.db
        .delete(categories)
        .where(eq(categories.categoryId, id))
        .returning();

      const success = result.length > 0;
      if (success) {
        logger.info({ categoryId: id }, 'Category deleted successfully');
      }

      return success;
    } catch (error) {
      logger.error({ error, id }, 'Failed to delete category');
      return false;
    }
  }

  async findByName(userId: string, name: string, type: 'income' | 'expense'): Promise<Category | null> {
    try {
      const [result] = await this.db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.ownerId, userId),
            eq(categories.name, name),
            eq(categories.type, type)
          )
        )
        .limit(1);

      return result || null;
    } catch (error) {
      logger.error({ error, userId, name, type }, 'Failed to find category by name');
      return null;
    }
  }
} 