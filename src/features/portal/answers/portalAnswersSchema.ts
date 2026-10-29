import { z } from 'zod'

/**
 * As perguntas fixas do portal do cliente (docs/assistente-claude.md, fase 3).
 * A ordem é a da página. Mudar o texto de uma pergunta aqui muda o que o
 * cliente lê; mudar a CHAVE exige regerar tudo — é ela que fica no banco.
 */
export const PORTAL_QUESTIONS = [
  { key: 'ultimo_ato', label: 'O que aconteceu por último?' },
  { key: 'significado', label: 'O que isso significa?' },
  { key: 'fase', label: 'Em que fase o processo está?' },
  { key: 'datas', label: 'Tem alguma data marcada?' },
] as const

export type PortalQuestionKey = (typeof PORTAL_QUESTIONS)[number]['key']

/** O que o modelo devolve: uma resposta por pergunta, em texto simples. */
export const portalAnswersSchema = z.object({
  ultimo_ato: z.string(),
  significado: z.string(),
  fase: z.string(),
  datas: z.string(),
})

export type PortalAnswers = z.infer<typeof portalAnswersSchema>

export interface PortalAnswerCorrection {
  text: string
  by: string | null
  at: string
}

/** Uma linha de `client_portal_answers` (migration 84). */
export interface PortalAnswersRecord {
  legal_process_id: string
  /** Vazio enquanto a primeira geração não terminou. */
  answers: Partial<PortalAnswers>
  corrections: Partial<Record<PortalQuestionKey, PortalAnswerCorrection>>
  hidden: PortalQuestionKey[]
  superseded: Partial<Record<PortalQuestionKey, PortalAnswerCorrection & { superseded_at: string }>>
  source_hash: string
  model: string | null
  generated_at: string | null
  refreshing_since: string | null
}

/** Uma resposta como o cliente a vê. */
export interface PortalVisibleAnswer {
  key: PortalQuestionKey
  label: string
  text: string
}

/** O que `POST /api/portal/<token>/processos/<id>/respostas` devolve. */
export type PortalAnswersResponse =
  | { status: 'ready'; answers: PortalVisibleAnswer[] }
  /** Outra geração do mesmo processo está em curso: a página pergunta de novo. */
  | { status: 'preparing' }
  /** Desligado, teto do mês ou falha: a página segue sem a seção. */
  | { status: 'unavailable' }

/** O que a tela do escritório recebe de `GET /api/processos/<id>/portal-respostas`. */
export interface OfficePortalAnswers {
  /** `PORTAL_ASSISTANT_ENABLED` não está em `false`. */
  enabled: boolean
  record: PortalAnswersRecord | null
  /** As respostas gravadas não batem com o que o portal mostra agora: o
   * cliente verá respostas novas na próxima abertura. */
  stale: boolean
}

/** As respostas que o cliente vê: a correção do escritório quando existe, e
 * nada do que o escritório ocultou. */
export function visibleAnswers(record: PortalAnswersRecord): PortalVisibleAnswer[] {
  return PORTAL_QUESTIONS.flatMap(({ key, label }) => {
    if (record.hidden.includes(key)) return []
    const text = (record.corrections[key]?.text ?? record.answers[key] ?? '').trim()
    return text ? [{ key, label, text }] : []
  })
}
