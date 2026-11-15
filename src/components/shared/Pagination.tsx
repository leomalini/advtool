'use client'

import { useId, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  PAGE_SIZE_OPTIONS,
  getPageCount,
  getPageItems,
  parsePageSize,
  type PageSize,
} from '@/lib/pagination'

const numberFormat = new Intl.NumberFormat('pt-BR')

export interface PaginationItemLabel {
  singular: string
  plural: string
}

interface PaginationProps {
  pageIndex: number
  pageSize: PageSize
  /** Total que casa o filtro — não o tamanho da página. */
  total: number
  /** Como o total é lido: "213 processos", "1 movimentação". */
  itemLabel: PaginationItemLabel
  onPageChange: (index: number) => void
  onPageSizeChange: (size: PageSize) => void
  /** Chamado ao passar o cursor (ou o foco) num botão de página: a tela
   * pré-carrega aquela página, e o clique já a encontra pronta. */
  onPrefetchPage?: (index: number) => void
  /** Depois da contagem, separado por "·" — ex.: "3 selecionados". */
  summaryExtra?: ReactNode
  className?: string
}

/**
 * O rodapé de toda listagem (docs/paginacao.md): à esquerda, o que está na
 * tela ("51–100 de 213 processos"); à direita, o tamanho da página e a
 * navegação `‹ 1 … 4 5 6 … 12 ›`.
 *
 * Com uma página só, a navegação some, mas a contagem e o seletor ficam: o
 * rodapé não aparece e desaparece conforme o filtro, e o seletor continua
 * alcançável para quem quer ver mais por página.
 */
export function Pagination({
  pageIndex,
  pageSize,
  total,
  itemLabel,
  onPageChange,
  onPageSizeChange,
  onPrefetchPage,
  summaryExtra,
  className,
}: PaginationProps) {
  const sizeLabelId = useId()
  const pageCount = getPageCount(total, pageSize)
  const first = total === 0 ? 0 : pageIndex * pageSize + 1
  const last = Math.min((pageIndex + 1) * pageSize, total)
  const isFirstPage = pageIndex === 0
  const isLastPage = pageIndex >= pageCount - 1

  function prefetchHandlers(index: number) {
    if (!onPrefetchPage) return {}
    return {
      onPointerEnter: () => onPrefetchPage(index),
      onFocus: () => onPrefetchPage(index),
    }
  }

  function handleSizeChange(value: string) {
    const size = parsePageSize(value)
    if (size) onPageSizeChange(size)
  }

  return (
    <div
      className={cn(
        'flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t bg-card px-6 py-2',
        className,
      )}
    >
      <p className="text-xs tabular-nums text-muted-foreground">
        <span className="font-medium text-foreground">
          {first === last
            ? numberFormat.format(first)
            : `${numberFormat.format(first)}–${numberFormat.format(last)}`}
        </span>{' '}
        de {numberFormat.format(total)} {total === 1 ? itemLabel.singular : itemLabel.plural}
        {summaryExtra && <> · {summaryExtra}</>}
      </p>

      {/* No celular o seletor e a navegação não cabem lado a lado: quebram em
          duas linhas em vez de empurrar a seta "próxima" para fora da tela. */}
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
          <span id={sizeLabelId}>Por página</span>
          <Select value={String(pageSize)} onValueChange={handleSizeChange}>
            <SelectTrigger
              size="sm"
              aria-labelledby={sizeLabelId}
              className="w-[68px] px-2 text-xs tabular-nums data-[size=sm]:h-7"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)} className="text-xs tabular-nums">
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {pageCount > 1 && (
          <nav aria-label="Paginação" className="flex items-center gap-0.5">
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Página anterior"
              disabled={isFirstPage}
              onClick={() => onPageChange(pageIndex - 1)}
              {...(isFirstPage ? {} : prefetchHandlers(pageIndex - 1))}
            >
              <ChevronLeft />
            </Button>

            {getPageItems(pageIndex, pageCount).map((item) =>
              item.kind === 'gap' ? (
                <span
                  key={`gap-${item.key}`}
                  aria-hidden
                  className="w-6 select-none text-center text-xs text-muted-foreground"
                >
                  …
                </span>
              ) : (
                <Button
                  key={item.index}
                  size="xs"
                  variant={item.index === pageIndex ? 'default' : 'ghost'}
                  aria-label={`Página ${item.index + 1}`}
                  aria-current={item.index === pageIndex ? 'page' : undefined}
                  className="min-w-6 px-1.5 tabular-nums"
                  onClick={() => onPageChange(item.index)}
                  {...(item.index === pageIndex ? {} : prefetchHandlers(item.index))}
                >
                  {item.index + 1}
                </Button>
              ),
            )}

            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Próxima página"
              disabled={isLastPage}
              onClick={() => onPageChange(pageIndex + 1)}
              {...(isLastPage ? {} : prefetchHandlers(pageIndex + 1))}
            >
              <ChevronRight />
            </Button>
          </nav>
        )}
      </div>
    </div>
  )
}
