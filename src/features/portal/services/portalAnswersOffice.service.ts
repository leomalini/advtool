import type {
  OfficePortalAnswers,
  PortalAnswersRecord,
  PortalQuestionKey,
} from '../answers/portalAnswersSchema'

/** Uma ação de revisão do escritório (D6) — o corpo do PATCH. */
export type PortalAnswerReview =
  | { action: 'correct'; question: PortalQuestionKey; text: string }
  | { action: 'clear_correction'; question: PortalQuestionKey }
  | { action: 'set_hidden'; question: PortalQuestionKey; hidden: boolean }
  | { action: 'dismiss_superseded'; question: PortalQuestionKey }

async function failure(response: Response, fallback: string): Promise<Error> {
  const body: unknown = await response.json().catch(() => null)
  const message =
    body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : fallback
  return new Error(message)
}

function endpoint(legalProcessId: string): string {
  return `/api/processos/${legalProcessId}/portal-respostas`
}

export async function getOfficePortalAnswers(legalProcessId: string): Promise<OfficePortalAnswers> {
  const response = await fetch(endpoint(legalProcessId), { cache: 'no-store' })
  if (!response.ok) throw await failure(response, 'Não foi possível ler as respostas do portal.')
  return (await response.json()) as OfficePortalAnswers
}

/** Prepara agora — gera só se o que o portal mostra mudou. */
export async function prepareOfficePortalAnswers(
  legalProcessId: string,
): Promise<PortalAnswersRecord> {
  const response = await fetch(endpoint(legalProcessId), { method: 'POST' })
  if (!response.ok) throw await failure(response, 'Não foi possível preparar as respostas.')
  return (await response.json()) as PortalAnswersRecord
}

export async function reviewPortalAnswer(
  legalProcessId: string,
  review: PortalAnswerReview,
): Promise<PortalAnswersRecord> {
  const response = await fetch(endpoint(legalProcessId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(review),
  })
  if (!response.ok) throw await failure(response, 'Não foi possível salvar a revisão.')
  return (await response.json()) as PortalAnswersRecord
}
