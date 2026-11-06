import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Evita o erro "Acquiring an exclusive Navigator LockManager lock immediately failed",
    // que derruba as consultas ao banco em alguns navegadores (Firefox) e com várias abas abertas.
    lock: async (_name, _acquireTimeout, fn) => await fn(),
  },
});
