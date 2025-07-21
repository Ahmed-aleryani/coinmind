import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Client-side Supabase client
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// Client-side auth functions
export async function signInAnonymouslyClient(retries = 3): Promise<any> {
  // Check cache first (cache for 5 minutes)
  const now = Date.now();
  const cacheKey = 'anonymousUserCache';
  const cached = localStorage.getItem(cacheKey);
  
  if (cached) {
    const cache = JSON.parse(cached);
    if (now < cache.expiresAt) {
      console.debug('Using cached anonymous user');
      return { user: cache.user };
    }
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.info({ attempt, retries }, 'Attempting anonymous sign-in');
      
      const { data, error } = await supabaseClient.auth.signInAnonymously();
      
      if (error) {
        console.warn({ 
          error: error.message, 
          code: error.status,
          attempt, 
          retries 
        }, 'Anonymous sign-in failed');
        
        // Check if this is a rate limit or configuration error
        if (error.message.includes('rate limit') || error.message.includes('too many requests')) {
          console.error('Rate limit exceeded for anonymous sign-ins. Consider implementing user sessions.');
          throw new Error('Anonymous sign-in rate limit exceeded. Please try again later.');
        }
        
        if (error.message.includes('anonymous sign-ins are disabled')) {
          console.error('Anonymous sign-ins are disabled in Supabase project settings');
          throw new Error('Anonymous authentication is not enabled. Please enable it in your Supabase project settings.');
        }
        
        // For JSON parsing errors, try again with longer delay
        if (error.message.includes('Unexpected end of JSON input') && attempt < retries) {
          console.warn({ attempt }, 'JSON parsing error, retrying...');
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Longer exponential backoff
          continue;
        }
        
        // For network errors, try again
        if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
          console.warn({ attempt }, 'Network error, retrying...');
          await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
          continue;
        }
        
        throw error;
      }
      
      if (data?.user) {
        // Cache the user for 5 minutes
        const cache = {
          user: data.user,
          expiresAt: now + (5 * 60 * 1000)
        };
        localStorage.setItem(cacheKey, JSON.stringify(cache));
        
        console.info({ 
          userId: data.user.id,
          attempt 
        }, 'Anonymous sign-in successful');
        
        return data;
      }
      
      throw new Error('No user data returned from anonymous sign-in');
      
    } catch (error) {
      console.error({ 
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