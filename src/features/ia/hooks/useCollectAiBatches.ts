'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { publicationKeys } from '@/features/publicacoes/hooks/usePublications'
import type { CollectSummary } from '../batch/collect'

/** O servidor também segura: no máximo uma consulta à Anthropic por minuto. */
const COLLECT_STALE_MS = 60_000

async function collect(): Promise<CollectSummary> {
  const response = await fetch('/api/ia/lotes/coletar', { method: 'POST' })
  if (!response.ok) throw new Error(`coleta dos lotes: ${response.status}`)
  return (await response.json()) as CollectSummary
}

/**
 * Recolhe os lotes de IA prontos ao abrir uma tela que mostra o resultado
 * (fase 5) — a triagem não espera o cron diário. Quando algo foi gravado, as
 * publicações são relidas. Falha aqui não aparece: o cron recolhe depois.
 */
export function useCollectAiBatches(): void {
  const queryClient = useQueryClient()
  useQuery({
    queryKey: ['ia', 'collect-batches'],
    queryFn: async () => {
      const summary = await collect()
      if (summary.applied > 0) {
        await queryClient.invalidateQueries({ queryKey: publicationKeys.all })
      }
      return summary
    },
    staleTime: COLLECT_STALE_MS,
    refetchOnWindowFocus: false,
    retry: false,
  })
}
