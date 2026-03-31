// src/lib/supabase.js
// Single shared Supabase client instance for the entire app.
// Import `sb` from this file instead of calling createClient() in each component.

import { createClient } from "@supabase/supabase-js";

const SUPA_URL  = import.meta.env.VITE_SUPABASE_URL  || "";
const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const sb = SUPA_URL && SUPA_ANON
  ? createClient(SUPA_URL, SUPA_ANON, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;
