// src/lib/supabase.js
// Single shared Supabase client — import this everywhere instead of calling createClient directly.
// Using one instance per browser context prevents the "Multiple GoTrueClient instances" warning.

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL || "";
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const supabase = url && key
  ? createClient(url, key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: "kh-auth-token",
      },
    })
  : null;

export default supabase;
