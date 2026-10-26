-- ============================================================
-- 80 — ASSINATURA PELA D4SIGN (fase 2: o envio de contratos)
--
-- Plano: `docs/integracao-d4sign.md`. Depende da migration 79.
--
-- Quando a D4Sign avisa que todos assinaram (ou que o envio foi cancelado), o
-- servidor muda o envio, os signatários e o contrato. Pela service_role não há
-- `auth.uid()`, e o histórico do contrato ficaria sem autor — por isso as
-- mudanças passam por duas funções, que gravam tudo numa transação e dizem ao
-- trigger do histórico quem mudou:
--
--   · `finish_signature_request`  — todos assinaram: envio `signed`, contrato
--                                    `vigente` com a data da assinatura;
--   · `cancel_signature_request`  — cancelado: envio `canceled`, contrato de
--                                    volta a `rascunho`.
--
-- ⚠️ Escrita ANTES do resto do spike, como a 79: aplicar junto com ela, depois
-- do primeiro envio de verdade (sandbox ou produção com teto).
-- ============================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. Histórico: o autor também pode vir da transação
--
-- A migration 79 ensinou o trigger a gravar `source` ('d4sign'). Falta o caso
-- em que uma pessoa pediu a mudança, mas quem grava é o servidor — cancelar o
-- envio pela tela, por exemplo: a função recebe quem clicou e põe em
-- `app.status_changed_by`. Pelo client de sessão, `auth.uid()` continua
-- valendo e vem primeiro.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.record_contract_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.contract_status_changes
      (contract_id, from_status, to_status, changed_by, source)
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.status end,
      new.status,
      coalesce(
        auth.uid(),
        nullif(current_setting('app.status_changed_by', true), '')::uuid
      ),
      nullif(current_setting('app.status_change_source', true), '')
    );
  end if;
  return new;
end;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Todos assinaram
--
-- Chamada depois de o servidor confirmar na API a fase "Finalizado" e guardar
-- a cópia assinada. Só age sobre envio `sent`: um segundo aviso, ou o
-- "Atualizar status" chegando junto com o webhook, devolve `finished = false`
-- e quem chamou desfaz a cópia que acabou de subir.
--
-- O contrato só vira vigente se ainda estava aguardando assinatura — um
-- aditivo de contrato já vigente só ganha o arquivo. A data da assinatura é a
-- de Brasília, como o resto do sistema.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.finish_signature_request(
  p_request_id         uuid,
  p_signed_document_id uuid,
  p_signed_at          timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request          public.signature_requests%rowtype;
  v_signed_at        timestamptz := coalesce(p_signed_at, now());
  v_contract_updated boolean := false;
begin
  select * into v_request
    from public.signature_requests
   where id = p_request_id
     for update;

  if not found then
    return jsonb_build_object('finished', false, 'reason', 'missing');
  end if;
  if v_request.status <> 'sent' then
    return jsonb_build_object('finished', false, 'reason', v_request.status);
  end if;

  update public.signature_requests
     set status = 'signed',
         finished_at = v_signed_at,
         signed_document_id = p_signed_document_id,
         error = null
   where id = p_request_id;

  update public.signature_signers
     set status = 'signed',
         signed_at = coalesce(signed_at, v_signed_at)
   where request_id = p_request_id
     and status <> 'signed';

  if v_request.contract_id is not null then
    perform set_config('app.status_change_source', 'd4sign', true);
    update public.contracts
       set status = 'vigente',
           signed_at = (v_signed_at at time zone 'America/Sao_Paulo')::date
     where id = v_request.contract_id
       and status = 'aguardando_assinatura';
    v_contract_updated := found;
  end if;

  return jsonb_build_object('finished', true, 'contract_updated', v_contract_updated);
end;
$$;

comment on function public.finish_signature_request(uuid, uuid, timestamptz) is
  'Envio à D4Sign assinado por todos: envio, signatários e contrato numa '
  'transação, com o histórico marcado "pela D4Sign" (migration 80).';


-- ────────────────────────────────────────────────────────────────────────────
-- 3. Cancelado
--
-- `p_source = 'd4sign'` quando a D4Sign cancelou (painel, prazo vencido) e o
-- aviso ou o "Atualizar status" contou; `p_actor` quando uma pessoa cancelou
-- pela tela. O contrato volta a rascunho só se estava aguardando e não sobrou
-- outro envio aberto.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.cancel_signature_request(
  p_request_id uuid,
  p_reason     text,
  p_source     text,
  p_actor      uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request          public.signature_requests%rowtype;
  v_contract_updated boolean := false;
begin
  select * into v_request
    from public.signature_requests
   where id = p_request_id
     for update;

  if not found then
    return jsonb_build_object('canceled', false, 'reason', 'missing');
  end if;
  if v_request.status not in ('preparing', 'sent', 'failed') then
    return jsonb_build_object('canceled', false, 'reason', v_request.status);
  end if;

  update public.signature_requests
     set status = 'canceled',
         failed_step = null,
         canceled_at = now(),
         cancel_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_request_id;

  if v_request.contract_id is not null
     and not exists (
       select 1
         from public.signature_requests r
        where r.contract_id = v_request.contract_id
          and r.id <> p_request_id
          and r.status in ('preparing', 'sent')
     ) then
    if p_source is not null then
      perform set_config('app.status_change_source', p_source, true);
    end if;
    if p_actor is not null then
      perform set_config('app.status_changed_by', p_actor::text, true);
    end if;
    update public.contracts
       set status = 'rascunho'
     where id = v_request.contract_id
       and status = 'aguardando_assinatura';
    v_contract_updated := found;
  end if;

  return jsonb_build_object('canceled', true, 'contract_updated', v_contract_updated);
end;
$$;

comment on function public.cancel_signature_request(uuid, text, text, uuid) is
  'Envio à D4Sign cancelado: envio e contrato numa transação, com o autor ou a '
  'origem no histórico (migration 80).';


-- ────────────────────────────────────────────────────────────────────────────
-- 4. Só o servidor chama
--
-- Mesmo cuidado da migration 71: pela API pública, qualquer sessão poderia
-- marcar um contrato como assinado sem assinatura nenhuma.
-- ────────────────────────────────────────────────────────────────────────────

revoke all on function public.finish_signature_request(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.cancel_signature_request(uuid, text, text, uuid)
  from public, anon, authenticated;
