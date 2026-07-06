import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Client service_role : contourne la RLS. À n'utiliser QUE côté serveur
 * (server actions / route handlers), jamais importé dans du code client.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
