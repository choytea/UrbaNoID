import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
 console.warn("VITE_SUPABASE_URL atau VITE_SUPABASE_ANON_KEY belum diisi.");
}

export const supabase = createClient(
 supabaseUrl || "https://example.supabase.co",
 supabaseAnonKey || "missing-anon-key"
);
