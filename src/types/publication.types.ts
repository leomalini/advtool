/** Espelha `public.publications` e `public.publication_parties` (migration 44). */

export type PublicationSource = 'busca_processos' | 'manual'
export type PublicationPartyRole = 'destinatario' | 'advogado'

export interface PublicationParty {
  id: string
  publication_id: string
  name: string
  role: PublicationPartyRole
  oab: string | null
  position: number
}

export interface Publication {
  id: string
  /** Numeração exibida na tela ("#495"). */
  sequence_number: number
  /** Nulo quando o processo ainda não está cadastrado — o CNJ fica em
   * `cnj_number` de qualquer forma. */
  legal_process_id: string | null
  cnj_number: string | null
  source: PublicationSource
  external_id: string | null
  /** Chave de deduplicação ENTRE fontes — ver src/lib/publicacoes/fingerprint.ts.
   * Nula quando a publicação não tem conteúdo. */
  content_fingerprint: string | null
  /** Preenchida quando a mesma publicação já tinha entrado por outra fonte.
   * Linha marcada não aparece na fila: a sobrevivente é quem a representa. */
  duplicate_of_id: string | null
  court: string | null
  diario_name: string | null
  diario_sigla: string | null
  oab_state: string | null
  oab_number: string | null
  publication_date: string
  availability_date: string | null
  /** Calculado pelo motor em `src/lib/prazos`. */
  deadline_start_at: string | null
  /** Sem correspondente na API: preenchidos por quem lê. */
  publication_type: string | null
  subject: string | null
  title: string | null
  excerpt: string | null
  /** Cru, como veio. A tela não renderiza isto. */
  content_html: string | null
  /** Normalizado na ingestão — é o que a tela mostra. */
  content_text: string | null
  external_url: string | null
  read_at: string | null
  handled_at: string | null
  created_at: string
  updated_at: string
}

export interface PublicationWithRelations extends Publication {
  parties: PublicationParty[]
  /** Presente só quando a publicação está vinculada a um processo cadastrado.
   * As partes vêm daqui: a API de intimações não informa destinatários. */
  legal_process: {
    id: string
    cnj_number: string | null
    court: string | null
    plaintiff: string | null
    defendant: string | null
    parties: {
      id: string
      name: string
      polo: 'ativo' | 'passivo'
      party_type: string | null
      position: number
    }[]
  } | null
  /** A triagem por IA (fase 5; migration 85), quando já foi feita. */
  triage: PublicationTriage | null
}

export type TriageUrgency = 'alta' | 'media' | 'baixa'

export const TRIAGE_URGENCY_LABELS: Record<TriageUrgency, string> = {
  alta: 'Urgente',
  media: 'Atenção',
  baixa: 'Rotina',
}

/** Uma linha de `publication_triage` (migration 85). */
export interface PublicationTriage {
  publication_id: string
  act_type: string
  urgency: TriageUrgency
  needs_action: boolean
  summary: string
  /** A providência como título de tarefa; nula quando não pede nada. */
  suggested_task: string | null
  /** Prazo que o texto dá; a data sai do motor de prazos. */
  deadline_days: number | null
  deadline_counting: 'uteis' | 'corridos' | null
  probable_process_id: string | null
  probable_reason: string | null
  model: string | null
  triaged_at: string
  suggestion_status: 'open' | 'task_created' | 'dismissed'
  task_id: string | null
  /** O processo provável, para o link e o "Vincular". */
  probable_process?: { id: string; cnj_number: string | null } | null
}

export interface PublicationFilters {
  /** A fila de trabalho: só o que ainda não foi lido. */
  onlyUnread?: boolean
  search?: string
  court?: string | null
  /** Só as que não têm processo cadastrado. */
  onlyOrphans?: boolean
}
