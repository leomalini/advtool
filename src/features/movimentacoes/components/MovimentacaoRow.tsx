'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Gavel,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { LegalProcessMovementWithContext } from '@/types/legalProcess.types'
import { MovementCategoryChip } from './MovementCategoryChip'
import {
  formatMovementDay,
  movementClientName,
  movementProcessLabel,
  movementText,
  suggestedTaskTitle,
} from '../utils/display'

const RECEIVED_VIA_LABELS: Record<string, string> = {
  webhook: 'Monitoramento',
  sync: 'Sincronização',
  manual: 'Lançada à mão',
}

/**
 * O corpo expandido alinha com o texto da linha fechada, e não com a borda:
 * as duas partes têm de ler como uma coluna só.
 *
 * `px-4` (16) + chevron `w-3.5` (14) + `gap-3` (12) + data (78) + `gap-3` (12)
 * = 132. Valor arbitrário com aritmética, como o `w-[92px]` da timeline de
 * Processos — a escala do Tailwind não tem um passo que case com a soma.
 *
 * O corpo usa `pl-[132px] pr-4` em vez de `px-4 pl-[132px]`: `padding-inline`
 * e `padding-left` têm a mesma especificidade, e quem ganha é a ordem na folha
 * gerada, não a ordem no atributo.
 */
const DATE_COL = 'w-[78px]'
const BODY_INDENT = 'pl-[132px] pr-4'

interface MovimentacaoRowProps {
  movimentacao: LegalProcessMovementWithContext
  expanded: boolean
  onToggle: () => void
  onFocus: () => void
  registerRef: (el: HTMLButtonElement | null) => void
  onToggleHandled: (movimentacao: LegalProcessMovementWithContext) => void
  onToggleVisibility: (movimentacao: LegalProcessMovementWithContext) => void
  onCreateTask: (movimentacao: LegalProcessMovementWithContext, title: string) => void
  canUpdate: boolean
  canCreateTask: boolean
  isMutating: boolean
}

/**
 * A linha EXPANDE no lugar — não existe página de detalhe neste módulo. Tudo
 * que a pessoa precisa ler e decidir está aqui: o texto integral do ato e as
 * quatro providências possíveis.
 */
export function MovimentacaoRow({
  movimentacao,
  expanded,
  onToggle,
  onFocus,
  registerRef,
  onToggleHandled,
  onToggleVisibility,
  onCreateTask,
  canUpdate,
  canCreateTask,
  isMutating,
}: MovimentacaoRowProps) {
  const [taskTitle, setTaskTitle] = useState(() => suggestedTaskTitle(movimentacao))

  const handled = Boolean(movimentacao.handled_at)
  const pending = movimentacao.requires_action && !handled
  const processo = movementProcessLabel(movimentacao)
  const clientName = movementClientName(movimentacao)
  const { headline, detail } = movementText(movimentacao)

  // Só vale mostrar a descrição inteira quando ela diz algo além do título. No
  // formato TPU ela diz: é o registro verbatim da origem, com os códigos — a
  // linha fechada mostra o legível, a aberta mostra o que veio.
  const showFullText = movimentacao.description.trim() !== headline.trim()
  const paragraphs = movimentacao.description.split(/\n{2,}/).filter((p) => p.trim() !== '')

  return (
    <li className={cn('bg-card', pending && 'bg-warning/[0.04]')}>
      <button
        type="button"
        ref={registerRef}
        onClick={onToggle}
        onFocus={onFocus}
        aria-expanded={expanded}
        className={cn(
          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
          'hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
        )}
      >
        {expanded ? (
          <ChevronDown aria-hidden className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight aria-hidden className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}

        <span className={cn(DATE_COL, 'shrink-0 pt-px text-[11px] font-medium tabular-nums')}>
          {formatMovementDay(movimentacao.movement_date)}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <MovementCategoryChip category={movimentacao.category} />

            <span
              className={cn(
                'truncate text-[11px] text-muted-foreground',
                processo.isCnj && 'font-mono',
              )}
            >
              {processo.label}
            </span>

            {movimentacao.event_number != null && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                #{movimentacao.event_number}
              </span>
            )}

            {pending && (
              <span className="rounded-full bg-warning/12 px-2 py-0.5 text-[10px] font-semibold text-warning">
                Pede providência
              </span>
            )}

            {handled && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[10px] font-semibold text-success">
                <Check aria-hidden className="h-2.5 w-2.5" />
                Tratada
              </span>
            )}

            {movimentacao.hidden_from_client && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                <EyeOff aria-hidden className="h-2.5 w-2.5" />
                Oculta
              </span>
            )}
          </span>

          <span
            className={cn(
              'mt-1 block text-sm leading-relaxed',
              expanded ? '' : 'line-clamp-2',
              pending && 'font-medium',
            )}
          >
            {headline}
          </span>

          {detail && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {detail}
            </span>
          )}

          {clientName && (
            <span className="mt-0.5 block truncate text-[10.5px] text-muted-foreground">
              {clientName}
            </span>
          )}
        </span>
      </button>

      {expanded && (
        <div className={cn('border-t border-dashed pb-4 pt-3', BODY_INDENT)}>
          {showFullText && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Texto da origem
              </p>
              {paragraphs.map((paragraph, index) => (
                <p key={index} className="text-sm leading-relaxed text-foreground/90">
                  {paragraph}
                </p>
              ))}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {movimentacao.author && (
              <span className="inline-flex items-center gap-1.5">
                <Gavel aria-hidden className="h-3 w-3" />
                Magistrado(a) · {movimentacao.author}
              </span>
            )}
            {movimentacao.received_via && (
              <span>{RECEIVED_VIA_LABELS[movimentacao.received_via] ?? movimentacao.received_via}</span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canUpdate && (
              <Button
                size="sm"
                variant={handled ? 'outline' : 'default'}
                className="h-7 text-xs"
                disabled={isMutating}
                onClick={() => onToggleHandled(movimentacao)}
              >
                <Check className="mr-1 h-3 w-3" />
                {handled ? 'Desmarcar' : 'Tratar'}
              </Button>
            )}

            <Button asChild size="sm" variant="outline" className="h-7 text-xs">
              <Link href={`/processos/${movimentacao.legal_process_id}`}>
                <ArrowUpRight className="mr-1 h-3 w-3" />
                Abrir processo
              </Link>
            </Button>

            {canUpdate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground"
                    disabled={isMutating}
                    onClick={() => onToggleVisibility(movimentacao)}
                  >
                    {movimentacao.hidden_from_client ? (
                      <EyeOff className="mr-1 h-3 w-3" />
                    ) : (
                      <Eye className="mr-1 h-3 w-3" />
                    )}
                    {movimentacao.hidden_from_client ? 'Oculto do cliente' : 'Visível ao cliente'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {movimentacao.hidden_from_client
                    ? 'Mostrar este ato no link de acompanhamento'
                    : 'Esconder este ato do link de acompanhamento'}
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {canCreateTask && (
            <div className="mt-3 flex items-center gap-2">
              <Input
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="Tarefa a partir deste ato"
                className="h-7 text-xs"
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || !taskTitle.trim()) return
                  event.preventDefault()
                  onCreateTask(movimentacao, taskTitle.trim())
                }}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 text-xs"
                disabled={!taskTitle.trim()}
                onClick={() => onCreateTask(movimentacao, taskTitle.trim())}
              >
                <Plus className="mr-1 h-3 w-3" />
                Criar tarefa
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
