import { drizzle } from 'drizzle-orm/postgres-js';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import * as schema from './schema';
import logger from '../utils/logger';

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase configuration');
}

if (!databaseUrl) {
  throw new Error('Missing DATABASE_URL environment variable');
}

// Validate and log configuration
logger.info({
  supabaseUrl,
  hasAnonKey: !!supabaseAnonKey,
  hasServiceKey: !!supabaseServiceKey,
  databaseUrl: databaseUrl?.replace(/:\/\/.*@/, '://***@'), // Hide credentials
}, 'Database configuration loaded');

// Validate Supabase URL format
if (!supabaseUrl.startsWith('https://') || supabaseUrl.includes('/dashboard/')) {
  throw new Error(`Invalid NEXT_PUBLIC_SUPABASE_URL format: ${supabaseUrl}. Should be https://your-project-ref.supabase.co`);
}

// Create Supabase client for auth with better error handling
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      'User-Agent': 'coinmind-app/1.0',
    },
  },
});

// Create admin Supabase client for server-side operations
export const supabaseAdmin = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// Create PostgreSQL connection with better error handling
let client: postgres.Sql<any>;
let db: ReturnType<typeof drizzle>;

try {
  // Clean up the DATABASE_URL if it has trailing characters
  const cleanDatabaseUrl = databaseUrl.replace(/%$/, '');
  
  client = postgres(cleanDatabaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // Disable prepared statements for better compatibility
    onnotice: () => {}, // Suppress PostgreSQL notices
  });

  // Create Drizzle instance
  db = drizzle(client, { schema });
  
  logger.info('Database connection initialized successfully');
} catch (error) {
  logger.error({ error: error instanceof Error ? error.message : error }, 'Failed to initialize database connection');
  throw error;
}

export { db };

// Cache for anonymous users to avoid repeated sign-ins
let anonymousUserCache: { user: any; expiresAt: number } | null = null;

// Helper function to get current user
export async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      logger.warn({ error: error.message }, 'Error getting user');
      return null;
    }
    return user;
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Failed to get current user');
    return null;
  }
}

// Helper function to sign in anonymously with retry logic
export async function signInAnonymously(retries = 3): Promise<any> {
  // Check cache first (cache for 5 minutes)
  const now = Date.now();
  if (anonymousUserCache && now < anonymousUserCache.expiresAt) {
    logger.debug('Using cached anonymous user');
    return { user: anonymousUserCache.user };
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.info({ attempt, retries }, 'Attempting anonymous sign-in');
      
      // Test connection first with a simple health check
      try {
        const healthCheck = await fetch(`${supabaseUrl}/health`);
        if (!healthCheck.ok) {
          logger.warn('Supabase health check failed, but continuing with sign-in attempt');
        }
      } catch (healthError) {
        logger.warn({ error: healthError }, 'Health check failed, but continuing');
      }
      
      const { data, error } = await supabase.auth.signInAnonymously();
      
      if (error) {
        logger.warn({ 
          error: error.message, 
          code: error.status,
          attempt, 
          retries 
        }, 'Anonymous sign-in failed');
        
        // Check if this is a rate limit or configuration error
        if (error.message.includes('rate limit') || error.message.includes('too many requests')) {
          logger.error('Rate limit exceeded for anonymous sign-ins. Consider implementing user sessions.');
          throw new Error('Anonymous sign-in rate limit exceeded. Please try again later.');
        }
        
        if (error.message.includes('anonymous sign-ins are disabled')) {
          logger.error('Anonymous sign-ins are disabled in Supabase project settings');
          throw new Error('Anonymous authentication is not enabled. Please enable it in your Supabase project settings.');
        }
        
        // For JSON parsing errors, try again with longer delay
        if (error.message.includes('Unexpected end of JSON input') && attempt < retries) {
          logger.warn({ attempt }, 'JSON parsing error, retrying...');
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Longer exponential backoff
          continue;
        }
        
        // For network errors, try again
        if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
          logger.warn({ attempt }, 'Network error, retrying...');
          await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
          continue;
        }
        
        throw error;
      }
      
      if (data?.user) {
        // Cache the user for 5 minutes
        anonymousUserCache = {
          user: data.user,
          expiresAt: now + (5 * 60 * 1000)
        };
        
        logger.info({ 
          userId: data.user.id,
          attempt 
        }, 'Anonymous sign-in successful');
        
        return data;
      }
      
      throw new Error('No user data returned from anonymous sign-in');
      
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : error,
        attempt,
        retries 
      }, 'Anonymous sign-in attempt failed');
      
      if (attempt === retries) {
        throw error;
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
  
  throw new Error('All anonymous sign-in attempts failed');
}

// Helper function to create a fallback user ID for testing/development
function createFallbackUserId(): string {
  const fallbackId = `fallback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  logger.warn({ fallbackId }, 'Using fallback user ID - this should not happen in production');
  return fallbackId;
}

// Helper function to ensure user is authenticated (sign in anonymously if not)
export async function ensureAuthenticated() {
  try {
    let user = await getCurrentUser();
    
    if (!user) {
      logger.info('No current user, attempting anonymous sign-in');
      const { user: anonUser } = await signInAnonymously();
      user = anonUser;
    }
    
    return user;
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : error 
    }, 'Failed to ensure authentication');
    
    // In development, we might want to continue with a fallback
    if (process.env.NODE_ENV === 'development') {
      logger.warn('Development mode: continuing with fallback authentication');
      return {
        id: createFallbackUserId(),
        email: 'fallback@example.com',
        is_anonymous: true
      };
    }
    
    throw error;
  }
}

// Helper function to get user ID (creates anonymous user if needed)
export async function getUserId(): Promise<string> {
  try {
    const user = await ensureAuthenticated();
    if (!user) {
      throw new Error('Unable to authenticate user');
    }
    return user.id;
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : error 
    }, 'Failed to get user ID');
    throw error;
  }
}

export type Database = typeof db;
export default db; 