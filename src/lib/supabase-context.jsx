// src/lib/supabase-context.jsx
// Provides the shared Supabase client via React context.
// Components that need the client via hooks can use useSupabase().

import { createContext, useContext } from "react";
import { sb } from "./supabase.js";

const SupabaseContext = createContext(null);

export function SupabaseProvider({ children }) {
  return (
    <SupabaseContext.Provider value={sb}>
      {children}
    </SupabaseContext.Provider>
  );
}

// Hook to use Supabase anywhere
export function useSupabase() {
  const client = useContext(SupabaseContext);
  if (client === null) {
    console.warn("[useSupabase] Supabase not initialized - ensure SupabaseProvider wraps your app");
  }
  return client;
}

export default SupabaseContext;
