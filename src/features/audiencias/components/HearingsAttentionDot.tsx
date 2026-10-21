'use client'

import { useNow } from '@/hooks/useNow'
import { useHearingsForProcess } from '../hooks/useHearings'
import { hearingNeedsAttention } from '../utils/display'

/**
 * O ponto âmbar na aba Audiências do processo: há audiência sem data ou com a
 * data a conferir. Componente próprio para o relógio (`useNow`) re-renderizar
 * só o ponto, e não a página inteira do processo, a cada minuto. Lê a mesma
 * consulta da aba, então abrir a aba não busca de novo.
 */
export function HearingsAttentionDot({ legalProcessId }: { legalProcessId: string }) {
  const { data: hearings = [] } = useHearingsForProcess(legalProcessId)
  const now = useNow()
  const count = hearings.filter((hearing) => hearingNeedsAttention(hearing, now)).length
  if (count === 0) return null

  return (
    <span
      className="h-1.5 w-1.5 rounded-full bg-warning"
      title={count === 1 ? '1 audiência pede atenção' : `${count} audiências pedem atenção`}
    />
  )
}
