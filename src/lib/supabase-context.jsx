// src/lib/supabase-context.jsx
// Single Supabase client instance shared across all components
// Eliminates memory waste from duplicate clients and auth listeners

import { createClient } from "@supabase/supabase-js";
import { createContext, useContext } from "react";

const _url = import.meta.env.VITE_SUPABASE_URL;
const _key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!_url || !_key) {
  console.warn("[Supabase Context] Missing env vars - client not initialized");
}

// Module-level singleton — only one GoTrueClient per browser context
export const supabase = (_url && _key)
  ? createClient(_url, _key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: "kh-auth-token",
      },
    })
  : null;

const SupabaseContext = createContext(supabase);

export function SupabaseProvider({ children }) {
  return (
    <SupabaseContext.Provider value={supabase}>
      {children}
    </SupabaseContext.Provider>
  );
}

// Hook to use Supabase anywhere
export function useSupabase() {
  return useContext(SupabaseContext);
}

export default SupabaseContext;
