import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";
import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function getPublicSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables."
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}

export function hasPublicSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

// ─── Browser Client ────────────────────────────────────────────────────────
// Use in Client Components ("use client") only.

export function createBrowserClient() {
  const { supabaseUrl, supabaseAnonKey } = getPublicSupabaseConfig();
  return createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey);
}

// ─── Server Client ─────────────────────────────────────────────────────────
// Use in Server Components and Route Handlers.
// Reads cookies for session management (public anon access only in this app).

export function createServerClient() {
  const { supabaseUrl, supabaseAnonKey } = getPublicSupabaseConfig();
  const cookieStore = (() => {
    try {
      return cookies();
    } catch {
      return null;
    }
  })();
  type CookieSetInput = {
    name: string;
    value: string;
    options?: typeof cookieStore extends null ? undefined : Parameters<NonNullable<typeof cookieStore>["set"]>[2];
  };

  return createSupabaseServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore?.getAll() ?? [];
      },
      setAll(cookiesToSet: CookieSetInput[]) {
        if (!cookieStore) return;
        try {
          cookiesToSet.forEach(({ name, value, options }: CookieSetInput) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // setAll() may be called from a Server Component where cookies
          // are read-only. This is safe to ignore since we don't use auth.
        }
      },
    },
  });
}

// ─── Service Role Client ───────────────────────────────────────────────────
// Use in scripts and trusted server-side code ONLY.
// Bypasses RLS — never expose to the browser.

export function createServiceRoleClient() {
  const { supabaseUrl } = getPublicSupabaseConfig();
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
