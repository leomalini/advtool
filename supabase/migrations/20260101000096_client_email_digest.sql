-- ============================================================
-- 96 — RESUMO DIÁRIO DOS PROCESSOS POR E-MAIL
--
-- Plano: docs/emails-clientes.md, PR 2.
--
-- Todo fim de dia, o cliente que o escritório ligou recebe um e-mail com os
-- atos relevantes que chegaram nos processos dele (decisão, audiência,
-- recurso, encerramento), só os visíveis no portal, e o link para o portal.
--
-- ── Duas datas em `clients`, não um booleano ──
--
--   · `email_updates_enabled_at` — desde quando o resumo está ligado. Só entram
--     atos que chegaram DEPOIS dela: ligar o resumo de um cliente com duzentas
--     movimentações antigas não pode mandar as duzentas. Nula = desligado.
--   · `email_updates_opted_out_at` — quando o PRÓPRIO CLIENTE pediu para sair,
--     pelo link do e-mail. É o que impede a ativação em lote de reinscrever
--     quem saiu, e o que a ficha mostra antes de alguém religar à mão.
--
-- O pedido do cliente não vai para `activities`: `actor_id` é obrigatório lá
-- (migration 06) e quem age é o cliente, que não tem perfil. A coluna é o
-- registro.
--
-- ── `email_message_movements` ──
-- Quais atos cada resumo levou. É a definição de "ainda não enviado": ato
-- ligado a um resumo que saiu (qualquer status menos `failed` e `suppressed`)
-- não entra no próximo. Uma linha por e-mail e ato, porque o mesmo processo
-- pode ser de dois clientes, e cada um recebe o seu.
-- ============================================================


-- ── 1. As duas datas ────────────────────────────────────────────────────────

alter table public.clients
  add column if not exists email_updates_enabled_at   timestamptz,
  add column if not exists email_updates_opted_out_at timestamptz;

comment on column public.clients.email_updates_enabled_at is
  'Desde quando o cliente recebe o resumo diário dos processos por e-mail. '
  'Só atos que chegaram depois entram. Nula = desligado. Gravada pela rota '
  '/api/clientes/[id]/resumo-email, que confere os requisitos.';

comment on column public.clients.email_updates_opted_out_at is
  'Quando o próprio cliente pediu para não receber o resumo (link do e-mail). '
  'A ativação em lote pula quem tem esta data; religar à mão a apaga.';

-- O cron lê só quem tem o resumo ligado — poucos entre todos os cadastros.
create index if not exists idx_clients_email_updates
  on public.clients(email_updates_enabled_at)
  where email_updates_enabled_at is not null;


-- ── 2. Quais atos cada resumo levou ─────────────────────────────────────────

create table if not exists public.email_message_movements (
  email_message_id  uuid not null references public.email_messages(id) on delete cascade,
  movement_id       uuid not null references public.legal_process_movements(id) on delete cascade,
  primary key (email_message_id, movement_id)
);

comment on table public.email_message_movements is
  'Os atos que cada resumo diário levou. Escrita só pela service_role '
  '(src/lib/email/digest.ts).';

-- A pergunta do cron é "este ato já foi?": por ato, não por e-mail.
create index if not exists idx_email_message_movements_movement
  on public.email_message_movements(movement_id);

select public.apply_rbac_policies(
  'email_message_movements',
  'clientes:view', null, null, null
);

grant select on public.email_message_movements to authenticated;
grant select, insert, update, delete on public.email_message_movements to service_role;
