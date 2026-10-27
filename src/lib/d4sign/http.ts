// Server-side. A tradução dos erros da D4Sign para a resposta das rotas.
import { NextResponse } from 'next/server'
import { D4SignApiError, type D4SignErrorKind } from './client'

/**
 * Chave recusada é problema da configuração do servidor, não de quem pediu:
 * 502, e não 401 — a tela não deve achar que a sessão caiu.
 */
const STATUS_BY_KIND: Record<D4SignErrorKind, number> = {
  not_configured: 503,
  auth: 502,
  rate_limit: 429,
  quota: 409,
  rejected: 502,
  unavailable: 502,
  invalid_response: 502,
}

/** `action` completa "Não foi possível … agora." e identifica o log. */
export function d4signErrorResponse(error: unknown, action: string): NextResponse {
  if (error instanceof D4SignApiError) {
    console.error(`[d4sign] ${action}:`, error.kind, error.status, error.message)
    return NextResponse.json(
      { error: error.message, kind: error.kind },
      { status: STATUS_BY_KIND[error.kind] },
    )
  }

  console.error(`[d4sign] ${action}:`, error)
  return NextResponse.json({ error: `Não foi possível ${action} agora.` }, { status: 500 })
}
