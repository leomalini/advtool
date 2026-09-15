-- ============================================================
-- 55 — LINK DA PUBLICAÇÃO: A PÁGINA DO TRIBUNAL, NÃO A API
--
-- O webhook de diário manda três endereços parecidos no mesmo corpo:
--
--   · `link` e `link_api`            → a API da BuscaProcessos. Exigem
--                                      `x-api-key`; no navegador respondem
--                                      {"error":{"code":"API_KEY_REQUIRED"}}.
--   · `link_publicacao_tribunal`     → a página pública no tribunal (PJe,
--                                      eproc). É a única que alguém consegue
--                                      abrir.
--
-- O mapeamento guardava o primeiro. O efeito na tela é pior que a falta do
-- link: o botão "abrir publicação" aparece igual e leva a um JSON de erro.
--
-- `mapPublicacao.ts` passou a escolher o endereço navegável; esta migration
-- corrige as linhas que já entraram. Ambos os updates são idempotentes — rodar
-- de novo não muda mais nada.
-- ============================================================

-- 1. Onde existe a página do tribunal, é ela que fica.
update public.publications
   set external_url = raw_data ->> 'link_publicacao_tribunal'
 where external_url like 'https://api.buscaprocessos.app.br/%'
   and coalesce(raw_data ->> 'link_publicacao_tribunal', '') <> '';

-- 2. O que sobrou aponta só para a API. Sem link é melhor que com link quebrado:
--    a tela esconde o botão quando `external_url` é nulo, e o conteúdo da
--    publicação está guardado em `content_html`/`content_text` de todo jeito.
update public.publications
   set external_url = null
 where external_url like 'https://api.buscaprocessos.app.br/%';
