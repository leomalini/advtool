'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { RefreshCw, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Acima disso o resumo entra recolhido: o card é um resumo, não a peça. */
const COLLAPSE_THRESHOLD = 420

interface ResumoIaCardProps {
  summary: string | null
  /** Quando a IA gerou o texto, do lado da BuscaProcessos. */
  updatedAt: string | null
  /** Sem CNJ não há o que consultar — o vazio muda de mensagem. */
  hasCnj: boolean
  onSync?: () => void
  isSyncing?: boolean
}

/**
 * Resumo do processo gerado por IA.
 *
 * Tratamento visual próprio de propósito: o texto não foi escrito por ninguém
 * do escritório nem veio do tribunal — é interpretação de máquina, e precisa
 * ser lido como tal. Daí a moldura em degradê e o selo, que nenhum outro
 * bloco da página usa.
 */
export function ResumoIaCard({
  summary,
  updatedAt,
  hasCnj,
  onSync,
  isSyncing = false,
}: ResumoIaCardProps) {
  const [expanded, setExpanded] = useState(false)

  const isLong = (summary?.length ?? 0) > COLLAPSE_THRESHOLD
  const paragraphs = (summary ?? '').split(/\n{2,}/).filter((p) => p.trim())

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-info/30',
        'bg-gradient-to-br from-info/[0.10] via-card to-card',
      )}
    >
      {/* Faixa lateral — a marca visual que separa este bloco dos demais. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-info via-info/70 to-info/20"
      />

      <div className="p-5 pl-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-info/12 text-info">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">Resumo por IA</h2>
              <p className="text-[11px] text-muted-foreground">
                Gerado pela BuscaProcessos
                {updatedAt && ` · ${format(parseISO(updatedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`}
              </p>
            </div>
          </div>

          <span className="shrink-0 rounded-full bg-info px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-info-foreground">
            IA
          </span>
        </div>

        {summary ? (
          <>
            <div
              className={cn(
                'mt-4 space-y-2.5 text-sm leading-relaxed text-foreground/90',
                isLong && !expanded && 'max-h-40 overflow-hidden',
              )}
            >
              {paragraphs.map((paragraph, index) => (
                <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
              ))}
            </div>

            {isLong && (
              <div className="relative">
                {/* Esmaecimento só enquanto recolhido, para o corte não parecer
                    fim de texto. */}
                {!expanded && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -top-10 left-0 h-10 w-full bg-gradient-to-t from-card to-transparent"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-2 text-xs font-semibold text-foreground underline underline-offset-4 decoration-info/50 hover:decoration-info"
                >
                  {expanded ? 'Recolher' : 'Ler resumo completo'}
                </button>
              </div>
            )}

            <p className="mt-4 border-t border-info/20 pt-3 text-[11px] text-muted-foreground">
              Texto gerado automaticamente. Confira nos autos antes de usar em peça ou prazo.
            </p>
          </>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              {hasCnj
                ? 'Resumo ainda não carregado para este processo.'
                : 'Sem número CNJ não há como consultar o resumo.'}
            </p>
            {hasCnj && onSync && (
              <button
                type="button"
                onClick={onSync}
                disabled={isSyncing}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground underline underline-offset-4 decoration-info/50 hover:decoration-info disabled:opacity-60"
              >
                <RefreshCw className={cn('h-3 w-3', isSyncing && 'animate-spin')} />
                {isSyncing ? 'Buscando...' : 'Buscar agora'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
