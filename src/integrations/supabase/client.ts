// This file is automatically generated. Do not edit it directly.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Missing Supabase environment variables');
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// Add debug info
console.log("Initializing Supabase client with URL:", SUPABASE_URL);

export const supabase = createClient<Database>(
  SUPABASE_URL, 
  SUPABASE_PUBLISHABLE_KEY,
  {
    db: {
      schema: 'public',
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      debug: true, // Enable auth debugging
    },
    global: {
      headers: {
        'Content-Type': 'application/json',
        'Accept': '*/*',
      }
    },
  }
);

// Check if the client was created successfully
if (!supabase) {
  console.error("Failed to create Supabase client!");
} else {
  console.log("Supabase client created successfully");
  
  // Add a simple health check function
  (supabase as any).healthCheck = async () => {
    try {
      // Try a simple query to test connection
      const start = Date.now();
      const { data, error } = await supabase.from('teams').select('count', { count: 'exact', head: true });
      const elapsed = Date.now() - start;
      
      return {
        success: !error,
        elapsed,
        error: error ? error.message : null,
        data
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
        elapsed: 0,
        data: null
      };
    }
  };
}