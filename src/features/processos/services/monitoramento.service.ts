import type { MonitoringFrequency } from '@/types/legalProcess.types'

/**
 * Monitoramento de processo na BuscaProcessos, visto pelo navegador.
 *
 * A API key só existe no servidor: tudo passa pelas rotas em
 * `/api/buscaprocessos/monitoramentos`, que também gravam o vínculo
 * (`monitoring_id`) no processo — sem ele o monitor fica órfão e a cobrança
 * mensal segue sem meio de cancelamento.
 */

interface CreateProcessMonitoringArgs {
  legalProcessId: string
  cnj: string
  frequencia: MonitoringFrequency
  tribunal?: string | null
}

/** O que a rota devolve do monitoramento criado. Só o que a tela usa. */
export interface ProcessMonitoring {
  id: string
  frequencia: string
  status: string | null
}

/** 202 = a BuscaProcessos aceitou mas ainda está processando; o monitoramento
 * existirá, só não neste retorno. Distinguir isso de sucesso evita anunciar um
 * id que não veio. */
export interface PendingProcessMonitoring {
  pending: true
  message: string
}

export type CreateProcessMonitoringResult = ProcessMonitoring | PendingProcessMonitoring

export function isPendingMonitoring(
  result: CreateProcessMonitoringResult,
): result is PendingProcessMonitoring {
  return 'pending' in result
}

/** A rota aceita no máximo 50 caracteres em `tribunal`, e `court` guarda tanto
 * a sigla ("TJSP") quanto — no fallback de `mapCapa` e no que for digitado à
 * mão — o nome por extenso, que estoura esse limite. `tribunal` é opcional na
 * API (só `numero_cnj` é exigido), então o que não cabe é omitido: melhor um
 * monitoramento sem a dica do tribunal do que um 422 que cancela a criação. */
function tribunalParam(court: string | null | undefined): string | undefined {
  const value = court?.trim()
  return value && value.length <= 50 ? value : undefined
}

export async function createProcessMonitoring({
  legalProcessId,
  cnj,
  frequencia,
  tribunal,
}: CreateProcessMonitoringArgs): Promise<CreateProcessMonitoringResult> {
  const res = await fetch('/api/buscaprocessos/monitoramentos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      numero_cnj: cnj,
      frequencia,
      tribunal: tribunalParam(tribunal),
      legal_process_id: legalProcessId,
    }),
  })

  const json = await res.json()

  if (res.status === 202) {
    return {
      pending: true,
      message: json.message ?? 'Monitoramento em processamento na BuscaProcessos.',
    }
  }

  if (!res.ok) throw new Error(json.error ?? 'Falha ao criar o monitoramento.')

  return json as ProcessMonitoring
}

/** Cancela o monitoramento e interrompe a cobrança mensal. */
export async function deleteProcessMonitoring(monitoringId: string): Promise<void> {
  const res = await fetch(
    `/api/buscaprocessos/monitoramentos/${encodeURIComponent(monitoringId)}`,
    { method: 'DELETE' },
  )

  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json.error ?? 'Falha ao cancelar o monitoramento.')
  }
}
