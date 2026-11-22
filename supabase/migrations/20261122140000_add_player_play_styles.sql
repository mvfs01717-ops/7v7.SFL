/*
# PlayStyles dos jogadores

1. Alteração
- Adiciona `players.play_styles` (jsonb, padrão `{}`) com os PlayStyles do jogador, o nível e a raridade:
  `{ "passeCirurgico": { "lv": 2, "tier": "gold" } }` onde lv 0 = Normal, 1 = +, 2 = ++ e tier = gold (ao lado da carta) ou silver (no verso).

2. Segurança
- Nenhuma política nova: INSERT/UPDATE em `players` continuam restritos a administradores (RLS existente).
- Leitura pública continua igual. Nenhum dado existente é alterado.
*/

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS play_styles jsonb NOT NULL DEFAULT '{}'::jsonb;
