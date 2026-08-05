-- ============================================================
-- 21 — FINANCIAL ENTRIES (lançamentos manuais)
--
-- Receitas e despesas lançadas à mão, vinculáveis a cliente, caso e/ou
-- processo. Emissão de cobrança/boleto (ASAAS, InfinityPay) fica para uma
-- fase futura — nada aqui pressupõe gateway.
--
-- `status` guarda apenas 'pendente' | 'pago'. "Atrasado" NÃO é um estado
-- armazenado: é derivado de (status = 'pendente' AND due_date < hoje). Guardar
-- essa terceira opção significaria que um lançamento vencido continuaria
-- eternamente "pendente" até alguém editá-lo à mão — o mesmo tipo de deriva
-- que já corrigimos em outros pontos do schema.
--
-- Os três vínculos são nullable e independentes, no mesmo desenho de
-- events/tasks (migration 16): um lançamento pode nascer de um processo, de um
-- caso do CRM ou direto de um cliente.
-- ============================================================

create table public.financial_entries (
  id                uuid primary key default gen_random_uuid(),
  type              text not null check (type in ('receita', 'despesa')),
  category          text not null default 'outros'
                      check (category in ('honorario', 'custas', 'pericia', 'outros')),
  description       text not null,
  amount            numeric(12,2) not null check (amount >= 0),
  status            text not null default 'pendente' check (status in ('pendente', 'pago')),
  due_date          date not null,
  paid_at           date,

  client_id         uuid references public.clients(id) on delete set null,
  crm_item_id       uuid references public.crm_items(id) on delete set null,
  legal_process_id  uuid references public.legal_processes(id) on delete set null,

  created_by        uuid not null references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_financial_entries_client_id        on public.financial_entries(client_id);
create index idx_financial_entries_crm_item_id      on public.financial_entries(crm_item_id);
create index idx_financial_entries_legal_process_id on public.financial_entries(legal_process_id);
create index idx_financial_entries_due_date         on public.financial_entries(due_date);

create trigger set_updated_at before update on public.financial_entries
  for each row execute function public.set_updated_at();

alter table public.financial_entries enable row level security;
create policy "auth_full" on public.financial_entries
  for all using (auth.role() = 'authenticated');
