'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { MoonStar } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { STALE_MOVEMENT_DAYS } from '@/types/legalProcess.types'
import type { ProcessSilenceRow } from '../services/movements.service'

/**
 * O lado invertido do módulo: um feed de movimentações diz o que andou, nunca
 * onde nada acontece. Para um escritório, a segunda pergunta é a de risco.
 *
 * Promove o `stale_movements` de uma linha binária de pendência
 * (legalProcesses.service.ts:673) para distribuição com drill-down,
 * reusando a MESMA constante de fronteira — as duas telas nunca discordam.
 */

type SilenceBucket = 'recente' | 'atencao' | 'parado' | 'critico' | 'nunca'

const CRITICAL_DAYS = 90

interface BucketMeta {
  label: string
  /** Texto do tooltip/aria — o rótulo curto não diz a unidade. */
  description: string
  /**
   * Rampa ordinal de uma só família (verde → âmbar → vermelho), e não cores
   * categóricas: `docs/dashboard-visual.md` registra que âmbar ao lado de
   * vermelho exige azul no meio quando as faixas são categóricas. Aqui a
   * variável é ordinal, então a intensidade crescente é a codificação certa e
   * o problema de adjacência não aparece.
   */
  className: string
}

const BUCKETS: Record<SilenceBucket, BucketMeta> = {
  recente: {
    label: 'até 7 dias',
    description: 'movimentou na última semana',
    className: 'bg-success/50',
  },
  atencao: {
    label: `8–${STALE_MOVEMENT_DAYS} dias`,
    description: `sem movimentação entre 8 e ${STALE_MOVEMENT_DAYS} dias`,
    className: 'bg-warning/35',
  },
  parado: {
    label: `${STALE_MOVEMENT_DAYS + 1}–${CRITICAL_DAYS} dias`,
    description: `parado há mais de ${STALE_MOVEMENT_DAYS} dias`,
    className: 'bg-warning',
  },
  critico: {
    label: `+${CRITICAL_DAYS} dias`,
    description: `parado há mais de ${CRITICAL_DAYS} dias`,
    className: 'bg-destructive/70',
  },
  nunca: {
    label: 'nunca',
    description: 'nenhuma movimentação registrada',
    className: 'bg-destructive',
  },
}

const BUCKET_ORDER: readonly SilenceBucket[] = [
  'recente',
  'atencao',
  'parado',
  'critico',
  'nunca',
]

function bucketOf(row: ProcessSilenceRow): SilenceBucket {
  if (row.days_since === null) return 'nunca'
  if (row.days_since <= 7) return 'recente'
  if (row.days_since <= STALE_MOVEMENT_DAYS) return 'atencao'
  if (row.days_since <= CRITICAL_DAYS) return 'parado'
  return 'critico'
}

interface ProcessosEmSilencioProps {
  rows: ProcessSilenceRow[]
  isLoading: boolean
  isError: boolean
}

export function ProcessosEmSilencio({ rows, isLoading, isError }: ProcessosEmSilencioProps) {
  const [selected, setSelected] = useState<SilenceBucket | null>(null)

  const grouped = useMemo(() => {
    const byBucket = new Map<SilenceBucket, ProcessSilenceRow[]>()
    for (const bucket of BUCKET_ORDER) byBucket.set(bucket, [])
    for (const row of rows) byBucket.get(bucketOf(row))?.push(row)
    return byBucket
  }, [rows])

  const total = rows.length
  // O RPC já devolve do mais parado para o menos, e `nunca` primeiro.
  const shown = selected ? (grouped.get(selected) ?? []) : []

  return (
    <aside className="hidden w-80 shrink-0 flex-col border-l bg-card lg:flex">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <MoonStar aria-hidden className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Processos em silêncio</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isError && (
          <p className="p-4 text-xs text-muted-foreground">
            Não foi possível carregar os processos parados.
          </p>
        )}

        {!isError && isLoading && (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        )}

        {!isError && !isLoading && total === 0 && (
          <p className="p-4 text-xs text-muted-foreground">
            Nenhum processo ativo com CNJ cadastrado. Sem número não há o que monitorar.
          </p>
        )}

        {!isError && !isLoading && total > 0 && (
          <>
            <div className="border-b p-4">
              <div className="flex h-2 w-full gap-0.5" role="group" aria-label="Distribuição por tempo sem movimentação">
                {BUCKET_ORDER.map((bucket) => {
                  const count = grouped.get(bucket)?.length ?? 0
                  if (count === 0) return null
                  const meta = BUCKETS[bucket]
                  return (
                    <button
                      key={bucket}
                      type="button"
                      onClick={() => setSelected(selected === bucket ? null : bucket)}
                      aria-label={`${count} ${count === 1 ? 'processo' : 'processos'} ${meta.description}`}
                      aria-pressed={selected === bucket}
                      style={{ width: `${(count / total) * 100}%` }}
                      className={cn(
                        'block h-full min-w-1 first:rounded-l-full last:rounded-r-full',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        meta.className,
                        selected && selected !== bucket && 'opacity-35',
                      )}
                    />
                  )
                })}
              </div>

              <ul className="mt-3 space-y-1">
                {BUCKET_ORDER.map((bucket) => {
                  const count = grouped.get(bucket)?.length ?? 0
                  const meta = BUCKETS[bucket]
                  const isSelected = selected === bucket
                  return (
                    <li key={bucket}>
                      <button
                        type="button"
                        disabled={count === 0}
                        onClick={() => setSelected(isSelected ? null : bucket)}
                        aria-pressed={isSelected}
                        className={cn(
                          'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors',
                          'disabled:cursor-default disabled:opacity-40',
                          isSelected ? 'bg-accent font-medium' : 'hover:bg-accent/60',
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn('h-2 w-2 shrink-0 rounded-full', meta.className)}
                        />
                        <span className="flex-1 truncate text-muted-foreground">{meta.label}</span>
                        <span className="tabular-nums">{count}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>

            {selected === null && (
              <p className="p-4 text-xs text-muted-foreground">
                Clique numa faixa para ver os processos.
              </p>
            )}

            {selected !== null && (
              <ul className="divide-y divide-border">
                {shown.map((row) => (
                  <li key={row.legal_process_id}>
                    <Link
                      href={`/processos/${row.legal_process_id}`}
                      className="block px-4 py-2.5 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    >
                      <p className="truncate font-mono text-[12px] font-medium">
                        {row.cnj_number ?? 'sem CNJ'}
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                        {[
                          row.court,
                          row.days_since === null
                            ? 'nunca movimentou'
                            : `há ${row.days_since} ${row.days_since === 1 ? 'dia' : 'dias'}`,
                          `${row.movement_count} ato${row.movement_count === 1 ? '' : 's'}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
