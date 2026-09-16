'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronDown, Landmark, MapPin, Scale } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { PortalProcess } from '@/types/clientPortal.types'
import { PROCESS_STATUS_LABELS, type ProcessStatus } from '@/types/legalProcess.types'
import { usePortalProcessTimeline } from '../hooks/usePortal'

/** Quantas movimentações aparecem antes do "ver todas". Oito cobrem o que
 * aconteceu nos últimos meses na maioria dos processos — o suficiente para a
 * pergunta "andou?" sem transformar um card aberto numa página inteira. */
const MOVEMENTS_PREVIEW = 8

/** Rótulo em português para o cliente; o valor cru do banco ('ativo') nunca
 * aparece na tela. Fora dos três conhecidos, mostra o que veio — melhor que um
 * espaço vazio. */
function statusLabel(status: string): string {
  return PROCESS_STATUS_LABELS[status as ProcessStatus] ?? status
}

function statusVariant(status: string): 'default' | 'secondary' | 'outline' {
  if (status === 'ativo') return 'default'
  if (status === 'suspenso') return 'outline'
  return 'secondary'
}

function formatDate(value: string): string {
  try {
    return format(parseISO(value), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
  } catch {
    return value
  }
}

/** Data curta para o resumo do card fechado, onde o espaço é de uma linha. */
function formatShortDate(value: string): string {
  try {
    return format(parseISO(value), "d 'de' MMM 'de' yyyy", { locale: ptBR })
  } catch {
    return value
  }
}

/**
 * Um processo na lista — fechado por padrão.
 *
 * Antes cada processo vinha aberto, com a timeline inteira. Com três já era
 * ruim; com vinte, a página virava quilômetros de rolagem para encontrar um
 * processo. Fechado, cada um ocupa quatro linhas, e a lista inteira cabe numa
 * tela de celular.
 *
 * O card fechado responde à pergunta que traz o cliente aqui — "andou alguma
 * coisa?" — sem precisar abrir: mostra a data da última movimentação e quantas
 * existem. Abrir é para ler o quê.
 */
export function PortalProcessCard({
  processo,
  token,
  isOpen,
  onToggle,
}: {
  processo: PortalProcess
  token: string
  isOpen: boolean
  onToggle: () => void
}) {
  const heading = processo.title || processo.procedural_class || 'Processo'
  const panelId = `processo-${processo.id}`

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className={cn(
          'flex w-full items-start gap-3 px-4 py-4 text-left transition-colors',
          'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold leading-snug">{heading}</h2>
            <Badge variant={statusVariant(processo.status)}>
              {statusLabel(processo.status)}
            </Badge>
          </div>

          {processo.cnj_number && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {processo.cnj_number}
            </p>
          )}

          <p className="mt-1.5 text-xs text-muted-foreground">
            {processo.last_movement ? (
              <>
                Última movimentação em{' '}
                <span className="text-foreground">
                  {formatShortDate(processo.last_movement.movement_date)}
                </span>
                {processo.movement_count > 1 && ` · ${processo.movement_count} no total`}
              </>
            ) : (
              'Sem movimentações publicadas'
            )}
          </p>
        </div>

        <ChevronDown
          aria-hidden
          className={cn(
            'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div id={panelId} className="border-t px-4 pb-5 pt-4">
          <ProcessDetails processo={processo} />
          <ProcessTimeline token={token} processId={processo.id} />
        </div>
      )}
    </Card>
  )
}

function ProcessDetails({ processo }: { processo: PortalProcess }) {
  const details = [
    processo.court && { icon: Landmark, text: processo.court },
    processo.court_division && { icon: Scale, text: processo.court_division },
    processo.comarca && { icon: MapPin, text: processo.comarca },
  ].filter(Boolean) as { icon: typeof Landmark; text: string }[]

  const hasAny =
    details.length > 0 || Boolean(processo.subject) || Boolean(processo.filing_date)

  if (!hasAny) return null

  return (
    <div className="mb-5 flex flex-col gap-1.5">
      {details.map(({ icon: Icon, text }) => (
        <span key={text} className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-3.5 shrink-0" aria-hidden />
          {text}
        </span>
      ))}

      {processo.subject && (
        <p className="text-sm text-muted-foreground">
          <span className="text-foreground">Assunto: </span>
          {processo.subject}
        </p>
      )}

      {processo.filing_date && (
        <p className="text-sm text-muted-foreground">
          <span className="text-foreground">Distribuído em: </span>
          {formatDate(processo.filing_date)}
        </p>
      )}
    </div>
  )
}

/**
 * A timeline, carregada na abertura do card.
 *
 * O texto do tribunal aparece como é, sem reescrever: o cliente eventualmente
 * compara com o que vê no site do tribunal ou com o que outro advogado diz, e
 * uma paráfrase que divirja vira desconfiança. O que o escritório controla é o
 * que APARECE, pelo `hidden_from_client` — não a redação do que apareceu.
 */
function ProcessTimeline({ token, processId }: { token: string; processId: string }) {
  const [showAll, setShowAll] = useState(false)
  const { data, error, isPending } = usePortalProcessTimeline(token, processId)

  if (isPending) {
    return (
      <div className="flex flex-col gap-3" aria-label="Carregando andamento">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <p className="text-sm text-muted-foreground">
        Não foi possível carregar o andamento agora. Tente recarregar a página.
      </p>
    )
  }

  if (data.movements.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ainda não há movimentações publicadas para este processo.
      </p>
    )
  }

  const visible = showAll ? data.movements : data.movements.slice(0, MOVEMENTS_PREVIEW)
  const hidden = data.movements.length - visible.length

  return (
    <>
      <h3 className="mb-3 text-sm font-medium">Andamento</h3>

      <ol className="flex flex-col gap-4">
        {visible.map((movement) => (
          <li key={movement.id} className="relative flex gap-3">
            {/* Marcador e fio da timeline: puramente decorativos, fora da
                árvore de acessibilidade para o leitor de tela ouvir só a data
                e o texto. */}
            <div className="flex flex-col items-center" aria-hidden>
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
              <span className="mt-1 w-px flex-1 bg-border" />
            </div>

            <div className="flex min-w-0 flex-col gap-1 pb-1">
              <time
                dateTime={movement.movement_date}
                className="text-xs font-medium text-muted-foreground"
              >
                {formatDate(movement.movement_date)}
              </time>
              {movement.title && (
                <p className="text-sm font-medium leading-snug">{movement.title}</p>
              )}
              <p className="text-sm leading-relaxed text-muted-foreground">
                {movement.description}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-4 text-sm font-medium text-primary hover:underline"
        >
          Ver as outras {hidden} movimentações
        </button>
      )}

      {/* Só aparece depois de o cliente ter aberto tudo que veio: dizer antes
          que "há mais" sem ter mostrado estas seria confuso. */}
      {showAll && data.truncated && (
        <p className="mt-4 text-xs text-muted-foreground">
          Mostrando as {data.movements.length} movimentações mais recentes. Para o
          histórico completo, fale com o escritório.
        </p>
      )}
    </>
  )
}
