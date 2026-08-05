import type { CrmItemWithRelations } from './crmItem.types'

// ── Legal Process Types ──────────────────────────────────────────────────────
// A processo can be linked to N CrmItems across workflows (see migration 14),
// its "master" one being the item in the fixed 'wf-processos' workflow.
// Not every CrmItem has a linked LegalProcess — and a LegalProcess may end up
// with no CrmItem at all (see `crm_item` below).

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
  /** The master crm_item (wf-processos), or null when the processo has no
   * linked item left — an integrity anomaly the delete guard in
   * crmItems.service.ts prevents, but that older data may still contain.
   * Consumers must degrade gracefully instead of assuming it exists. */
  crm_item: CrmItemWithRelations | null
  /**
   * Every crm_item linked to this processo, across workflows — needed to find
   * events/tasks that were created from a sibling item (e.g. a Negociação card)
   * and therefore carry `crm_item_id` instead of `legal_process_id`.
   *
   * ⚠️ Complete only in `getLegalProcesses` / `getLegalProcessById`. The queries
   * that embed with `!inner` + a filter (`getLegalProcessesByClient`,
   * `searchLegalProcessesByCnjPrefix`) get a *filtered* array — PostgREST applies
   * the filter to the embedded rows too. Don't build an "all items" query from
   * those.
   */
  crm_items: CrmItemWithRelations[]
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
