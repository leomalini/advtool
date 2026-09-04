import type { BpMovimentacao } from './types'

/**
 * Chave estável de uma movimentação.
 *
 * A API não devolve id de movimentação. Sem chave, sincronizar de novo
 * duplicaria o histórico — o hash de data + conteúdo faz esse papel, e é o
 * alvo do índice único `(legal_process_id, external_hash)` da migration 43.
 *
 * Vive num módulo próprio porque tanto a sincronização (`sync.ts`) quanto o
 * webhook (`webhook.ts`) precisam do MESMO valor: era exatamente isso que
 * faltava, e por isso a movimentação que chegava pelas duas portas entrava
 * duas vezes.
 */
export async function movementHash(
  mov: Pick<BpMovimentacao, 'data' | 'conteudo'>,
): Promise<string> {
  const raw = `${mov.data}\n${mov.conteudo ?? ''}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}
