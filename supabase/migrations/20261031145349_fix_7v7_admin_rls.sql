/*
# Corrigir políticas RLS do 7v7 Brasil

1. Tabelas alteradas
- `players`: mantém leitura pública e limita INSERT, UPDATE e DELETE a administradores autenticados.
- `teams`: mantém leitura pública e limita INSERT, UPDATE e DELETE a administradores autenticados.
- `profiles`: permite SELECT somente na própria linha do usuário autenticado.

2. Integridade dos jogadores
- Garante que `players.image_url` exista como `text` anulável.
- Garante índice único para `players.name`, evitando nomes repetidos.

3. Segurança e limpeza
- Remove as políticas anteriores dessas três tabelas antes de recriá-las.
- Remove grants de escrita do papel `anon` em `players` e `teams`.
- Cada política administrativa usa a mesma verificação `EXISTS` contra `profiles.role = 'admin'`.
- UPDATE usa a verificação administrativa em `USING` e `WITH CHECK`.

4. Observações
- Nenhum dado é excluído ou alterado.
- A leitura pública de jogadores e times continua disponível para `anon` e `authenticated`.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'players'
      AND column_name = 'image_url'
  ) THEN
    ALTER TABLE public.players ADD COLUMN image_url text;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS players_name_unique_idx ON public.players (name);

REVOKE INSERT, UPDATE, DELETE ON public.players, public.teams FROM anon;
REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT ON public.players, public.teams TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.players, public.teams TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "public_read_players" ON public.players;
DROP POLICY IF EXISTS "admins_insert_players" ON public.players;
DROP POLICY IF EXISTS "admins_update_players" ON public.players;
DROP POLICY IF EXISTS "admins_delete_players" ON public.players;
DROP POLICY IF EXISTS "public_read_teams" ON public.teams;
DROP POLICY IF EXISTS "admins_insert_teams" ON public.teams;
DROP POLICY IF EXISTS "admins_update_teams" ON public.teams;
DROP POLICY IF EXISTS "admins_delete_teams" ON public.teams;
DROP POLICY IF EXISTS "users_read_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "users_insert_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;

CREATE POLICY "public_read_players"
ON public.players FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "admins_insert_players"
ON public.players FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "admins_update_players"
ON public.players FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "admins_delete_players"
ON public.players FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "public_read_teams"
ON public.teams FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "admins_insert_teams"
ON public.teams FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "admins_update_teams"
ON public.teams FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "admins_delete_teams"
ON public.teams FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "users_read_own_profile"
ON public.profiles FOR SELECT
TO authenticated
USING (id = auth.uid());
