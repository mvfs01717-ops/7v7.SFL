/*
# Restringir grants anônimos das imagens de jogadores

1. Alteração
- Remove INSERT, UPDATE e DELETE de `storage.objects` para o papel `anon`.
- Mantém SELECT para `anon` e `authenticated`, conforme o bucket público.
- Mantém escrita para `authenticated`, controlada pelas políticas administrativas do bucket `player-images`.

2. Segurança
- Acesso anônimo a arquivos continua somente leitura.
- Nenhum dado ou arquivo é excluído.
*/

REVOKE INSERT, UPDATE, DELETE ON storage.objects FROM anon;
GRANT SELECT ON storage.objects TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
