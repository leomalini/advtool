-- ============================================================
-- 18 — BUCKET DE ANEXOS (formalizado como migration)
-- O bucket 'attachments' só existia via criação manual no Supabase Studio
-- (ver supabase/README.md) e num schema.sql fora do fluxo de migrations —
-- um ambiente novo criado só com `supabase db reset` ficava sem ele.
--
-- Idempotente de propósito: em bases onde o bucket/policies já foram criados
-- à mão, esta migration não deve falhar.
-- ============================================================

insert into storage.buckets (id, name, public)
  values ('attachments', 'attachments', false)
  on conflict (id) do nothing;

drop policy if exists "auth_upload" on storage.objects;
drop policy if exists "auth_read"   on storage.objects;
drop policy if exists "auth_delete" on storage.objects;

create policy "auth_upload" on storage.objects
  for insert with check (bucket_id = 'attachments' and auth.role() = 'authenticated');
create policy "auth_read" on storage.objects
  for select using (bucket_id = 'attachments' and auth.role() = 'authenticated');
create policy "auth_delete" on storage.objects
  for delete using (bucket_id = 'attachments' and auth.role() = 'authenticated');
