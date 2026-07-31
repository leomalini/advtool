-- ============================================================
-- 19 — profiles.oab_number
-- Número da OAB do advogado, exibido no card de advogados do Dashboard.
-- Nullable: nem todo profile é advogado (role 'admin' pode ser secretaria).
-- ============================================================

alter table public.profiles add column oab_number text;
