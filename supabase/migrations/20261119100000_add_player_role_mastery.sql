/*
# Domínio de funções dos jogadores

1. Alteração
- Adiciona `players.role_mastery` (jsonb, padrão `{}`) com as funções do jogador e o nível de domínio:
  `{ "df-mark": { "lv": 2, "style": "Defender" } }` onde lv 0 = Básico, 1 = Avançado (+), 2 = Especialista (++).

2. Segurança
- Nenhuma política nova: INSERT/UPDATE em `players` continuam restritos a administradores (RLS existente).
- Leitura pública continua igual. Nenhum dado existente é alterado.
*/

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS role_mastery jsonb NOT NULL DEFAULT '{}'::jsonb;
