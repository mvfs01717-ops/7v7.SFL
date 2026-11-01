/*
# Criar armazenamento público para imagens de jogadores

1. Bucket
- Cria o bucket público `player-images`.
- Arquivos podem ser lidos por visitantes e usuários autenticados.

2. Coluna de jogadores
- Garante que `players.image_url` exista como `text` anulável.

3. Segurança do Storage
- Leitura dos objetos do bucket liberada para `anon` e `authenticated`.
- INSERT, UPDATE e DELETE de objetos permitidos somente a usuários autenticados cujo perfil tenha `role = 'admin'`.
- A verificação administrativa usa `EXISTS` em `profiles` com `profiles.id = auth.uid()`.

4. Observações
- Políticas anteriores deste bucket são removidas antes da recriação para evitar regras duplicadas ou conflitantes.
- Nenhum arquivo ou registro existente é excluído.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('player-images', 'player-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

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

GRANT SELECT ON storage.objects TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON storage.objects TO authenticated;

DROP POLICY IF EXISTS "player_images_public_read" ON storage.objects;
DROP POLICY IF EXISTS "player_images_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "player_images_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "player_images_admin_delete" ON storage.objects;

CREATE POLICY "player_images_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'player-images');

CREATE POLICY "player_images_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'player-images'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
);

CREATE POLICY "player_images_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'player-images'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
)
WITH CHECK (
  bucket_id = 'player-images'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
);

CREATE POLICY "player_images_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'player-images'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
);
