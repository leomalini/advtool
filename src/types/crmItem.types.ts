// ── CRM Item Types ───────────────────────────────────────────────────────────
// Generic pipeline entity — workflows/columns are user-configurable, so a
// CrmItem can represent anything (a negotiation lead, a legal process, or any
// other flow the office defines). Judicial-specific data lives on the linked
// LegalProcess (see legalProcess.types.ts), not here.

export interface CrmItem {
  id: string
  client_id: string | null
  title: string | null
  legal_area: string | null
  workflow_id: string
  column_id: string
  position: number
  assigned_to: string | null
  tags: string[]
  next_deadline: string | null
  next_task_summary: string | null
  notes: string | null
  legal_process_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface CrmItemClientSummary {
  id: string
  type: 'individual' | 'company'
  name: string | null
  company_name: string | null
  trade_name: string | null
  phone: string | null
  email: string | null
  legal_area: string | null
}

export interface CrmItemProfileSummary {
  id: string
  full_name: string
  avatar_url: string | null
  role: string
  created_at: string
}

export interface CrmItemColumnHistory {
  id: string
  crm_item_id: string
  from_column_id: string | null   // null = criação do item
  to_column_id: string
  moved_by: string | null
  moved_at: string
  moved_by_profile: {
    full_name: string
    avatar_url: string | null
  } | null
}

/** Light summary of the linked processo, if this item has one (workflow wf-processos). */
export interface CrmItemLegalProcessSummary {
  id: string
  cnj_number: string | null
  court: string | null
}

export interface CrmItemWithRelations extends CrmItem {
  client: CrmItemClientSummary | null
  assigned_profile: CrmItemProfileSummary | null
  legal_process: CrmItemLegalProcessSummary | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getCrmItemClientName(c: CrmItemWithRelations): string {
  if (c.client) {
    if (c.client.type === 'individual') return c.client.name ?? '(sem nome)'
    return c.client.trade_name ?? c.client.company_name ?? '(sem nome)'
  }
  return c.title ?? '(sem cliente)'
}

export function getCrmItemDisplayTitle(c: CrmItemWithRelations): string {
  const clientName = getCrmItemClientName(c)
  return c.title ? `${c.title} — ${clientName}` : clientName
}
