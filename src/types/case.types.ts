// ── Case Types ───────────────────────────────────────────────────────────────

export interface Case {
  id: string
  client_id: string | null
  title: string | null
  cnj_number: string | null
  court: string | null
  court_division: string | null
  legal_area: string | null
  workflow_id: string
  column_id: string
  position: number
  assigned_to: string | null
  tags: string[]
  next_deadline: string | null
  next_task_summary: string | null
  plaintiff: string | null
  defendant: string | null
  opposing_counsel: string | null
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface CaseClientSummary {
  id: string
  type: 'individual' | 'company'
  name: string | null
  company_name: string | null
  trade_name: string | null
  phone: string | null
  email: string | null
  legal_area: string | null
}

export interface CaseProfileSummary {
  id: string
  full_name: string
  avatar_url: string | null
  role: string
  created_at: string
}

export interface CaseMovement {
  id: string
  case_id: string
  movement_date: string
  description: string
  source: 'manual' | 'busca_processos'
  raw_data: Record<string, unknown> | null
  created_at: string
}

export interface CaseWithRelations extends Case {
  client: CaseClientSummary | null
  assigned_profile: CaseProfileSummary | null
  movements: CaseMovement[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getCaseClientName(c: CaseWithRelations): string {
  if (c.client) {
    if (c.client.type === 'individual') return c.client.name ?? '(sem nome)'
    return c.client.trade_name ?? c.client.company_name ?? '(sem nome)'
  }
  return c.title ?? '(sem cliente)'
}

export function getCaseDisplayTitle(c: CaseWithRelations): string {
  const clientName = getCaseClientName(c)
  return c.title ? `${c.title} — ${clientName}` : clientName
}

// ── CNJ API Types ─────────────────────────────────────────────────────────────

export interface CnjLookupResult {
  cnj_number: string
  court: string | null
  court_division: string | null
  plaintiff: string | null
  defendant: string | null
  subject: string | null
  last_movement: string | null
  last_movement_date: string | null
}
