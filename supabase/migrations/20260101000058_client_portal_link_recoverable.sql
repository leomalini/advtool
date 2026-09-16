-- ============================================================
-- 58 — O LINK VOLTA A SER EXIBÍVEL
--
-- A migration 57 guardava só o SHA-256 do token: o link aparecia uma vez, na
-- emissão, e nem o escritório o recuperava depois. O uso real derrubou a
-- decisão — reabrir o cadastro para reenviar a mensagem ao cliente é rotina, e
-- ser obrigado a emitir outro link (invalidando o que o cliente já tem) só
-- para poder copiá-lo transforma uma tarefa de 5 segundos numa confusão.
--
-- A coluna guarda o token CIFRADO (AES-GCM), não em claro. O que a cifragem
-- preserva é exatamente o caso que motivou o hash: um vazamento apenas do
-- banco — dump, backup, réplica — continua não entregando link utilizável,
-- porque a chave sai do ambiente do servidor e não está em coluna nenhuma.
-- Ver `src/lib/clientPortal/vault.ts`.
--
-- `token_hash` FICA e continua sendo o que a validação do acesso consulta: o
-- cliente entrando no portal nunca decifra nada. A coluna nova serve só à tela
-- do escritório.
-- ============================================================

alter table public.client_portal_links
  add column if not exists token_sealed text;

comment on column public.client_portal_links.token_sealed is
  'Token cifrado com AES-GCM (base64 de iv||ciphertext), para o escritório '
  'poder reexibir o link. A chave é derivada do ambiente, nunca do banco. '
  'NULL em links emitidos antes desta migration: a tela oferece reemitir.';
