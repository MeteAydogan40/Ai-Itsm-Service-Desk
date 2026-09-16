import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    "VITE_SUPABASE_URL ve VITE_SUPABASE_PUBLISHABLE_KEY tanımlı değil. .env.example dosyasını kopyalayıp .env olarak doldurun.",
  );
}

// Publishable anahtar tarayıcıya iner; erişim kontrolü RLS ile sağlanır.
// Gizli (secret) anahtar buraya asla yazılmaz.
export const supabase = createClient(url, key);
