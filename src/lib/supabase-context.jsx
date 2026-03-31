// src/lib/supabase-context.jsx
// Supabase context — wraps the shared singleton client so any component
// can call useSupabase() without prop-drilling.

import { createContext, useContext } from "react";
import supabase from "./supabase.js";

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
  const sb = useContext(SupabaseContext);
  if (!sb) {
    console.warn("[useSupabase] Supabase not initialized - ensure SupabaseProvider wraps your app");
  }
  return sb;
}

export default SupabaseContext;

