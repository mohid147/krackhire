// src/lib/supabase-context.jsx
// Single Supabase client instance shared across all components
// Eliminates memory waste from duplicate clients and auth listeners

import { createClient } from "@supabase/supabase-js";
import { createContext, useContext, useMemo } from "react";

const SupabaseContext = createContext(null);

export function SupabaseProvider({ children }) {
  // Create single Supabase client instance (memoized)
  const sb = useMemo(() => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (!url || !key) {
      console.warn("[Supabase Context] Missing env vars - client not initialized");
      return null;
    }
    
    return createClient(url, key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: "kh-auth-token", // Custom storage key for security
      },
    });
  }, []);

  return (
    <SupabaseContext.Provider value={sb}>
      {children}
    </SupabaseContext.Provider>
  );
}

// Hook to use Supabase anywhere
export function useSupabase() {
  const sb = useContext(SupabaseContext);
  if (!sb) {
    console.warn("[useSupabase] Supabase not initialized - ensure SupabaseProvider wraps your app");
  }
  return sb;
}

export default SupabaseContext;
