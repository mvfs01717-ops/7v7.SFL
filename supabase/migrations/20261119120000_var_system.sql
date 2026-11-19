/*
  # Sistema de VAR automático

  1. `game_settings` (chave/valor): configurações globais do jogo. O VAR usa a chave 'var':
     { enabled: boolean, chance: 0..1, annulShare: 0..1, durationSec: número }
     Todo mundo lê (a partida precisa saber se o VAR está ligado); só administradores escrevem.

  2. `var_decisions`: histórico das revisões. O jogo grava uma linha por revisão (quem estava logado na partida),
     o painel admin lê. Só administradores leem. Linhas repetidas (os dois jogadores de uma partida online
     gravam o mesmo lance) são ignoradas pelo índice único.
*/
CREATE TABLE IF NOT EXISTS public.game_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid()
);
ALTER TABLE public.game_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.game_settings FROM anon, authenticated;
GRANT SELECT ON public.game_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.game_settings TO authenticated;

DROP POLICY IF EXISTS "public_read_settings" ON public.game_settings;
DROP POLICY IF EXISTS "admins_insert_settings" ON public.game_settings;
DROP POLICY IF EXISTS "admins_update_settings" ON public.game_settings;
CREATE POLICY "public_read_settings" ON public.game_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins_insert_settings" ON public.game_settings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "admins_update_settings" ON public.game_settings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

INSERT INTO public.game_settings (key, value)
VALUES ('var', '{"enabled": true, "chance": 0.3, "annulShare": 0.25, "durationSec": 5}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.var_decisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  match_key text NOT NULL,
  minute int NOT NULL,
  side text NOT NULL,
  home text,
  away text,
  scorer text,
  outcome text NOT NULL CHECK (outcome IN ('confirmado', 'anulado')),
  reason text,
  user_id uuid DEFAULT auth.uid()
);
CREATE UNIQUE INDEX IF NOT EXISTS var_decisions_unique_idx ON public.var_decisions (match_key, minute, scorer);
CREATE INDEX IF NOT EXISTS var_decisions_created_idx ON public.var_decisions (created_at DESC);
ALTER TABLE public.var_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.var_decisions FROM anon, authenticated;
GRANT SELECT, INSERT ON public.var_decisions TO authenticated;

DROP POLICY IF EXISTS "players_insert_var" ON public.var_decisions;
DROP POLICY IF EXISTS "admins_read_var" ON public.var_decisions;
CREATE POLICY "players_insert_var" ON public.var_decisions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "admins_read_var" ON public.var_decisions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
