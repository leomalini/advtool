-- Fase 5 do plano do Assistente: reservar antes de mandar o lote.
--
-- O envio conferia o que já estava pendente, preparava os pedidos, mandava o
-- lote e só no fim gravava as linhas. Dois envios que se cruzassem nesse
-- intervalo (o webhook e o "Buscar publicações", por exemplo) mandavam os dois
-- o mesmo lote; o segundo batia no índice único ao gravar e o lote dele ficava
-- sem registro — pago e nunca recolhido.
--
-- Agora a linha é gravada ANTES do envio, sem lote, e o índice único de
-- pendentes decide quem fica com cada trabalho: só os pedidos reservados vão
-- para a Anthropic. Depois do envio a linha recebe o lote.

-- ── 1. Pendente sem lote = reserva em andamento ─────────────────────────────

alter table public.ai_batch_items
  alter column batch_id drop not null,
  alter column batch_ref drop not null;

comment on column public.ai_batch_items.batch_id is
  'Lote da Anthropic. Nulo num pendente: reservado, envio em andamento (a coleta dá baixa como falha se passar de 10 min).';


-- ── 2. Reserva ───────────────────────────────────────────────────────────────
--
-- Grava os itens que ainda não têm pendente para o mesmo trabalho e registro e
-- devolve só os gravados. Quem perdeu a corrida não recebe a linha e não manda
-- o pedido. Só a service_role executa, como o resto da tabela.

create or replace function public.reserve_ai_batch_items(items jsonb)
returns setof public.ai_batch_items
language sql
volatile
set search_path = public
as $$
  insert into public.ai_batch_items (id, kind, entity_id, custom_id, input_hash, context)
  select (item->>'id')::uuid,
         item->>'kind',
         (item->>'entity_id')::uuid,
         item->>'custom_id',
         item->>'input_hash',
         nullif(item->'context', 'null'::jsonb)
    from jsonb_array_elements(items) as item
  on conflict (kind, entity_id) where status = 'pending' do nothing
  returning *;
$$;

revoke execute on function public.reserve_ai_batch_items(jsonb) from public, anon, authenticated;
grant execute on function public.reserve_ai_batch_items(jsonb) to service_role;
