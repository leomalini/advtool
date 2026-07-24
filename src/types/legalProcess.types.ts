import type { CrmItemWithRelations } from './crmItem.types'

// ── Legal Process Types ──────────────────────────────────────────────────────
// A processo is always linked 1:1 to a CrmItem (joined-table inheritance —
// legal_processes.id === crm_items.id), always living in the fixed
// 'wf-processos' workflow. Not every CrmItem has a linked LegalProcess.

export interface LegalProcess {
  id: string
  cnj_number: string | null
  court: string | null
  court_division: string | null
  plaintiff: string | null
  defendant: string | null
  opposing_counsel: string | null
  created_at: string
  updated_at: string
}

export interface LegalProcessMovement {
  id: string
  legal_process_id: string
  movement_date: string
  description: string
  source: 'manual' | 'busca_processos'
  raw_data: Record<string, unknown> | null
  created_at: string
}

export interface LegalProcessWithRelations extends LegalProcess {
  crm_item: CrmItemWithRelations
  movements: LegalProcessMovement[]
}

/** Movement joined with enough context to render in a cross-processo feed. */
export interface LegalProcessMovementWithContext extends LegalProcessMovement {
  legal_process: {
    id: string
    cnj_number: string | null
    crm_items: {
      id: string
      workflow_id: string
      title: string | null
      client: {
        type: 'individual' | 'company'
        name: string | null
        company_name: string | null
        trade_name: string | null
      } | null
    }[]
  }
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
