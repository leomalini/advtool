-- ============================================================
-- 53 — Mais de uma área jurídica por cliente
--
-- `legal_area` (migration 8) tratava a área como propriedade fixa do cliente,
-- e não é: o mesmo cliente tem uma reclamatória trabalhista e um inventário.
-- Quem cadastrava escolhia uma e perdia a outra, ou abria dois cadastros para
-- a mesma pessoa — que é o que faz a busca por CPF devolver dois resultados.
--
-- Vira `text[]`, como `tags` na migration 30: o array é a forma que o resto do
-- cadastro já usa, e a lista de áreas é pequena e fechada.
--
-- ⚠️ NÃO confundir com `crm_items.legal_area` (a mesma coluna que a migration 9
-- criou em `cases`, renomeada na 13). Aquela é a área DO CASO, continua
-- singular e não é tocada aqui — o gráfico do dashboard depende dela.
-- ============================================================

alter table public.clients
  add column if not exists legal_areas text[] not null default '{}';

-- Backfill. O `= '{}'` impede que uma segunda execução sobrescreva áreas que
-- alguém já tenha cadastrado pela tela nova.
update public.clients
   set legal_areas = array[legal_area]
 where legal_area is not null
   and legal_areas = '{}';

-- CHECK em comando separado, com drop antes: `add column ... check` inline não
-- é idempotente entre execuções (mesmo motivo da migration 30). `<@` exige que
-- todo elemento do array esteja na lista — array vazio passa, que é o cadastro
-- sem área definida.
alter table public.clients
  drop constraint if exists chk_clients_legal_areas;
alter table public.clients
  add constraint chk_clients_legal_areas
  check (
    legal_areas <@ array[
      'trabalhista', 'civel', 'familia', 'tributario',
      'criminal', 'previdenciario', 'consumidor'
    ]::text[]
  );

-- Mesmo índice de `tags`: a lista de clientes filtra por área.
create index if not exists idx_clients_legal_areas
  on public.clients using gin(legal_areas);

-- A coluna antiga sai junto: mantê-la criaria duas respostas para "qual é a
-- área deste cliente", e a tela passaria a escrever só numa delas.
alter table public.clients
  drop column if exists legal_area;
