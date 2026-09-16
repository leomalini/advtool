'use client'

import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Landmark, MapPin, Scale } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { PortalProcess } from '@/types/clientPortal.types'
import {
  PROCESS_STATUS_LABELS,
  type ProcessStatus,
} from '@/types/legalProcess.types'

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

/**
 * Um processo e seu andamento.
 *
 * A timeline mostra o texto do tribunal como ele é, sem reescrever: o cliente
 * eventualmente compara com o que vê no site do tribunal ou com o que outro
 * advogado diz, e uma paráfrase que divirja vira desconfiança. O que o
 * escritório controla é o que APARECE, pelo `hidden_from_client` — não a
 * redação do que apareceu.
 */
export function PortalProcessCard({ processo }: { processo: PortalProcess }) {
  const heading = processo.title || processo.procedural_class || 'Processo'
  const details = [
    processo.court && { icon: Landmark, text: processo.court },
    processo.court_division && { icon: Scale, text: processo.court_division },
    processo.comarca && { icon: MapPin, text: processo.comarca },
  ].filter(Boolean) as { icon: typeof Landmark; text: string }[]

  return (
    <Card className="gap-4 py-5">
      <div className="flex flex-col gap-3 px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-base font-semibold leading-tight">{heading}</h2>
          <Badge variant={statusVariant(processo.status)}>
            {statusLabel(processo.status)}
          </Badge>
        </div>

        {processo.cnj_number && (
          <p className="font-mono text-xs text-muted-foreground">{processo.cnj_number}</p>
        )}

        {details.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {details.map(({ icon: Icon, text }) => (
              <span
                key={text}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                {text}
              </span>
            ))}
          </div>
        )}

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

      <div className="border-t px-5 pt-4">
        <h3 className="mb-3 text-sm font-medium">Andamento</h3>

        {processo.movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ainda não há movimentações publicadas para este processo.
          </p>
        ) : (
          <ol className="flex flex-col gap-4">
            {processo.movements.map((movement) => (
              <li key={movement.id} className="relative flex gap-3">
                {/* Marcador e fio da timeline: puramente decorativos, fora da
                    árvore de acessibilidade para o leitor de tela ouvir só a
                    data e o texto. */}
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
        )}
      </div>
    </Card>
  )
}
