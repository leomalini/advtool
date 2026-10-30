import type { SyncBlock, SyncResult } from '@/lib/buscaprocessos/sync'
import type { OfficeClientsResult } from '@/lib/clientes/officeClients'

export type { SyncBlock, SyncResult }

export interface SyncResponse extends SyncResult {
  /** Cliente cadastrado ou vinculado pela capa que acabou de chegar. Null
   * quando a capa não veio nesta chamada ou o cadastro automático falhou. */
  officeClients: OfficeClientsResult | null
}

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
}: SyncArgs): Promise<SyncResponse> {
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

  return json as SyncResponse
}
