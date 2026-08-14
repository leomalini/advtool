import type { CrmItemWithRelations } from './crmItem.types'

// ── Legal Process Types ──────────────────────────────────────────────────────
// A processo can be linked to N CrmItems across workflows (see migration 14),
// its "master" one being the item in the fixed 'wf-processos' workflow.
// Not every CrmItem has a linked LegalProcess — and a LegalProcess may end up
// with no CrmItem at all (see `crm_item` below).

export type ProcessType = 'judicial' | 'administrativo'
export type ProcessStatus = 'ativo' | 'arquivado' | 'suspenso'

export const PROCESS_TYPE_LABELS: Record<ProcessType, string> = {
  judicial: 'Judicial',
  administrativo: 'Administrativo',
}

export const PROCESS_STATUS_LABELS: Record<ProcessStatus, string> = {
  ativo: 'Ativo',
  arquivado: 'Arquivado',
  suspenso: 'Suspenso',
}

export interface LegalProcess {
  id: string
  cnj_number: string | null
  court: string | null
  /** Vara / câmara / gabinete. */
  court_division: string | null
  /** Primeira parte de cada polo. Legado: a fonte agora é
   * `legal_process_parties`; estes seguem como fallback para processos antigos. */
  plaintiff: string | null
  defendant: string | null
  opposing_counsel: string | null
  /** Valor da causa. */
  case_value: number | null
  /** Data de ajuizamento/distribuição — não confundir com `next_deadline`,
   * que é o próximo prazo no CRM. */
  filing_date: string | null
  comarca: string | null
  procedural_class: string | null
  subject: string | null
  process_type: ProcessType
  status: ProcessStatus
  created_at: string
  updated_at: string
}

/** Natureza do ato — independente de `source`, que é a origem do registro.
 * Uma movimentação importada da API continua sendo movimentação. */
export type MovementKind = 'movimentacao' | 'publicacao'

export interface LegalProcessMovement {
  id: string
  legal_process_id: string
  movement_date: string
  description: string
  kind: MovementKind
  /** Título curto; quando ausente, a UI cai para `description`. */
  title: string | null
  /** Magistrado/serventuário, quando a origem informa. */
  author: string | null
  /** Numeração do evento no tribunal. */
  event_number: number | null
  read_at: string | null
  /** Providência tomada — distinto de apenas ter lido. */
  handled_at: string | null
  source: 'manual' | 'busca_processos'
  raw_data: Record<string, unknown> | null
  created_at: string
}

export type PartyPolo = 'ativo' | 'passivo'

/** O mínimo para exibir o cliente vinculado a uma parte sem carregar o
 * cadastro inteiro. */
export interface PartyClient {
  id: string
  type: 'individual' | 'company'
  name: string | null
  company_name: string | null
  trade_name: string | null
}

export interface LegalProcessParty {
  id: string
  legal_process_id: string
  name: string
  document: string | null
  polo: PartyPolo
  party_type: string | null
  position: number
  /** Cliente cadastrado que corresponde a esta parte. Null é o caso normal:
   * as partes chegam da API como texto puro e a maioria nunca será cliente
   * nosso (a parte contrária, por exemplo). */
  client_id: string | null
  client: PartyClient | null
  created_at: string
}

/** Parte ainda não persistida — o que vem do lookup por CNJ ou do formulário. */
export interface LegalProcessPartyInput {
  name: string
  /** Opcional além de nulável: o schema do formulário deixa o campo ausente
   * quando nunca foi tocado, e o insert normaliza para null. */
  document?: string | null
  polo: PartyPolo
  party_type?: string | null
  position: number
  /** Preservado no replace: reescrever as partes pelo formulário não pode
   * desfazer um vínculo com cliente feito na tela de detalhes. */
  client_id?: string | null
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
  parties: LegalProcessParty[]
}

/** Parte como a tela a consome, já com o cliente resolvido. */
export interface DisplayParty {
  /** Null nas partes-legado: elas vêm de `plaintiff`/`defendant` e não existem
   * como linha em `legal_process_parties`, então não há o que vincular. */
  id: string | null
  name: string
  document: string | null
  party_type: string | null
  client: PartyClient | null
}

/** Partes agrupadas por polo, já ordenadas — o formato que a tela consome. */
export function groupPartiesByPolo(
  processo: Pick<LegalProcessWithRelations, 'parties' | 'plaintiff' | 'defendant'>
): Record<PartyPolo, DisplayParty[]> {
  const byPolo: Record<PartyPolo, LegalProcessParty[]> = { ativo: [], passivo: [] }
  for (const party of processo.parties ?? []) byPolo[party.polo].push(party)

  const sorted = (list: LegalProcessParty[]): DisplayParty[] =>
    [...list]
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
      .map((p) => ({
        id: p.id,
        name: p.name,
        document: p.document,
        party_type: p.party_type,
        client: p.client ?? null,
      }))

  // Fallback para processos cadastrados antes da tabela de partes existir.
  const fallback = (name: string | null): DisplayParty[] =>
    name ? [{ id: null, name, document: null, party_type: null, client: null }] : []

  return {
    ativo: byPolo.ativo.length > 0 ? sorted(byPolo.ativo) : fallback(processo.plaintiff),
    passivo: byPolo.passivo.length > 0 ? sorted(byPolo.passivo) : fallback(processo.defendant),
  }
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

// ── Pendências ────────────────────────────────────────────────────────────────

/** Quanto tempo sem movimentação até o processo virar pendência. */
export const STALE_MOVEMENT_DAYS = 30
/** Janela em que um prazo já exige tarefa ou evento preparando-o. */
export const DEADLINE_WARNING_DAYS = 15

export type ProcessoIssueKind =
  | 'missing_cnj'
  | 'deadline_without_work'
  | 'stale_movements'
  | 'missing_client'
  | 'missing_assignee'

export interface ProcessoIssue {
  kind: ProcessoIssueKind
  label: string
  /** 'high' aparece primeiro na lista — é o que pode custar um prazo. */
  severity: 'high' | 'medium'
}

export interface ProcessoPendency {
  legalProcessId: string
  displayName: string
  cnjNumber: string | null
  issues: ProcessoIssue[]
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
  procedural_class: string | null
  case_value: number | null
  filing_date: string | null
  status: ProcessStatus | null
  /** Todas as partes, não só a primeira de cada polo. */
  parties: LegalProcessPartyInput[]
}
