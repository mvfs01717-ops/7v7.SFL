/*
# Criar a base do 7v7 Brasil

1. Novas tabelas
- `teams`: clubes disponíveis, sigla e cores visuais.
- `players`: cartas de jogadores, overall, posição principal e posições alternativas.
- `profiles`: perfil ligado ao usuário de autenticação, apelido e papel de acesso.
- `leaderboard`: vitórias e derrotas acumuladas por usuário.

2. Dados iniciais
- Fluminense e Santos são inseridos com siglas e cores do clube.
- Os 14 apelidos fornecidos são inseridos com overall 80 e uma posição principal.

3. Segurança
- RLS é ativado em todas as tabelas.
- Leitura pública para times, jogadores e ranking.
- Escrita de jogadores e times somente para perfis com role `admin`.
- Cada usuário autenticado pode ler e editar apenas seu próprio perfil.
- Ranking permite leitura pública e atualização somente do próprio registro.

4. Observações
- A estrutura usa posições em texto controlado: GK, LB, RB, CM, LF, RF e CF.
- O goleiro não recebe posições alternativas nos dados iniciais.
*/

CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  abbreviation text NOT NULL UNIQUE CHECK (char_length(abbreviation) BETWEEN 2 AND 4),
  primary_color text NOT NULL,
  secondary_color text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  overall integer NOT NULL CHECK (overall BETWEEN 40 AND 99),
  primary_position text NOT NULL CHECK (primary_position IN ('GK','LB','RB','CM','LF','RF','CF')),
  alternate_positions text[] NOT NULL DEFAULT '{}',
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname text NOT NULL UNIQUE CHECK (char_length(nickname) BETWEEN 2 AND 24),
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('player','admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leaderboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  wins integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses integer NOT NULL DEFAULT 0 CHECK (losses >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS players_team_id_idx ON public.players(team_id);
CREATE INDEX IF NOT EXISTS players_position_idx ON public.players(primary_position);
CREATE INDEX IF NOT EXISTS leaderboard_wins_idx ON public.leaderboard(wins DESC);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.teams, public.players TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams, public.players TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.leaderboard TO authenticated;
GRANT SELECT ON public.leaderboard TO anon;

DROP POLICY IF EXISTS "public_read_teams" ON public.teams;
CREATE POLICY "public_read_teams" ON public.teams FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "admins_insert_teams" ON public.teams;
CREATE POLICY "admins_insert_teams" ON public.teams FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "admins_update_teams" ON public.teams;
CREATE POLICY "admins_update_teams" ON public.teams FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "admins_delete_teams" ON public.teams;
CREATE POLICY "admins_delete_teams" ON public.teams FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "public_read_players" ON public.players;
CREATE POLICY "public_read_players" ON public.players FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "admins_insert_players" ON public.players;
CREATE POLICY "admins_insert_players" ON public.players FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "admins_update_players" ON public.players;
CREATE POLICY "admins_update_players" ON public.players FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "admins_delete_players" ON public.players;
CREATE POLICY "admins_delete_players" ON public.players FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "users_read_own_profile" ON public.profiles;
CREATE POLICY "users_read_own_profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id OR EXISTS (SELECT 1 FROM public.profiles AS admin_profile WHERE admin_profile.id = auth.uid() AND admin_profile.role = 'admin'));
DROP POLICY IF EXISTS "users_insert_own_profile" ON public.profiles;
CREATE POLICY "users_insert_own_profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
CREATE POLICY "users_update_own_profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id OR EXISTS (SELECT 1 FROM public.profiles AS admin_profile WHERE admin_profile.id = auth.uid() AND admin_profile.role = 'admin')) WITH CHECK (auth.uid() = id OR EXISTS (SELECT 1 FROM public.profiles AS admin_profile WHERE admin_profile.id = auth.uid() AND admin_profile.role = 'admin'));

DROP POLICY IF EXISTS "public_read_leaderboard" ON public.leaderboard;
CREATE POLICY "public_read_leaderboard" ON public.leaderboard FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "users_insert_leaderboard" ON public.leaderboard;
CREATE POLICY "users_insert_leaderboard" ON public.leaderboard FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);
DROP POLICY IF EXISTS "users_update_leaderboard" ON public.leaderboard;
CREATE POLICY "users_update_leaderboard" ON public.leaderboard FOR UPDATE TO authenticated USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);

INSERT INTO public.teams (name, abbreviation, primary_color, secondary_color)
VALUES ('Fluminense', 'FLU', '#7B1637', '#2E8B57'), ('Santos', 'SAN', '#F4F4F0', '#15191F')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.players (name, overall, primary_position, alternate_positions, team_id)
SELECT seed.name, 80, seed.position, '{}', teams.id
FROM (VALUES
  ('ynoel4x','CF','Santos'), ('xxbrenobloxx','RF','Santos'), ('razaryn','LF','Santos'), ('heenriii13','CM','Santos'), ('zhx1v','RB','Santos'), ('ygouzinn','LB','Santos'), ('umbra445i','GK','Santos'),
  ('jvkingfootball','CF','Fluminense'), ('HyperXGamer21','RF','Fluminense'), ('pepe021739','LF','Fluminense'), ('camelo3O','CM','Fluminense'), ('jplegadosteel35','LB','Fluminense'), ('bryan_legendario','RB','Fluminense'), ('seiadz','GK','Fluminense')
) AS seed(name, position, club)
JOIN public.teams ON teams.name = seed.club
ON CONFLICT (name) DO NOTHING;
