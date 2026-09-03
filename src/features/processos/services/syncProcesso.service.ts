import type { SyncBlock, SyncResult } from '@/lib/buscaprocessos/sync'

export type { SyncBlock, SyncResult }

interface SyncArgs {
  legalProcessId: string
  cnj: string
  blocks?: SyncBlock[]
  force?: boolean | SyncBlock[]
  /** Blocos que outro caminho já buscou — evita pagar duas vezes pelo mesmo. */
  assumeFresh?: SyncBlock[]
}

/**
 * Pede ao servidor que popule o processo com os dados da BuscaProcessos.
 *
 * Só o servidor tem a API key. Blocos já sincronizados voltam em `skipped` sem
 * gastar crédito — é o que evita reconsultar a cada abertura da tela.
 */
export async function syncProcessoFromApi({
  legalProcessId,
  cnj,
  blocks,
  force,
  assumeFresh,
}: SyncArgs): Promise<SyncResult> {
  const res = await fetch('/api/buscaprocessos/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      legal_process_id: legalProcessId,
      cnj,
      blocks,
      force,
      assume_fresh: assumeFresh,
    }),
  })

  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Falha ao sincronizar o processo.')

  return json as SyncResult
}
