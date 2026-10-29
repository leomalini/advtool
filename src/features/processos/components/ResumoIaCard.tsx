'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProcessSummaryRecord, SummarySource } from '../summary/summarySchema'

/** Acima disso o resumo entra recolhido: o card é um resumo, não a peça. */
const COLLAPSE_THRESHOLD = 700

/** Fontes que moram na linha do tempo desta página — o clique leva até elas. */
const TIMELINE_KINDS: ReadonlySet<SummarySource['kind']> = new Set(['movement', 'publication'])

const CHIP_CLASS =
  'ml-1 inline-flex items-center rounded border border-info/40 px-1 align-middle text-[10px] font-semibold leading-4 text-info'

interface ResumoIaCardProps {
  /** O resumo do Claude (`legal_process_summaries`), quando já foi gerado. */
  summary: ProcessSummaryRecord | null
  /** O resumo antigo da BuscaProcessos — só aparece enquanto não há o novo. */
  legacySummary: string | null
  legacyUpdatedAt: string | null
  /** Movimentações e publicações que chegaram depois do resumo. */
  newSinceSummary: number
  /** Gerar grava o resumo: só quem pode editar o processo (`processos:update`). */
  canGenerate: boolean
  onGenerate: () => void
  isGenerating: boolean
  /** A atualização automática ao abrir (fase 2b) está em curso. Aparece só no
   * aviso de novidades: na maior parte das vezes o servidor responde em
   * instantes que não vai refazer, e o card não deve piscar. */
  isRefreshing: boolean
  /** A atualização ao abrir foi para o lote (fase 5): o resumo novo aparece
   * quando o lote for recolhido. */
  refreshQueued: boolean
  /** Leva ao item da linha do tempo que a referência cita. */
  onOpenSource: (source: SummarySource) => void
}

function formatStamp(iso: string): string {
  return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

function SourceChips({
  refs,
  sources,
  onOpen,
}: {
  refs: string[]
  sources: Map<string, SummarySource>
  onOpen: (source: SummarySource) => void
}) {
  return refs.map((ref) => {
    const source = sources.get(ref)
    if (!source) return null
    const title = source.date ? `${source.date} — ${source.label}` : source.label

    if (TIMELINE_KINDS.has(source.kind) && source.id) {
      return (
        <button
          key={ref}
          type="button"
          title={title}
          onClick={() => onOpen(source)}
          className={cn(CHIP_CLASS, 'hover:bg-info/10')}
        >
          {ref}
        </button>
      )
    }
    return (
      <span key={ref} title={title} className={cn(CHIP_CLASS, 'cursor-help')}>
        {ref}
      </span>
    )
  })
}

/**
 * Resumo do processo gerado por IA.
 *
 * Tratamento visual próprio de propósito: o texto não foi escrito por ninguém
 * do escritório nem veio do tribunal — é interpretação de máquina, e precisa
 * ser lido como tal. Daí a moldura em degradê e o selo, que nenhum outro
 * bloco da página usa.
 *
 * Cada afirmação traz as referências que a sustentam (M3, P1…): passar o mouse
 * mostra a fonte; clicar nas de movimentação e publicação leva ao item.
 */
export function ResumoIaCard({
  summary,
  legacySummary,
  legacyUpdatedAt,
  newSinceSummary,
  canGenerate,
  onGenerate,
  isGenerating,
  isRefreshing,
  refreshQueued,
  onOpenSource,
}: ResumoIaCardProps) {
  const [expanded, setExpanded] = useState(false)

  const content = summary?.summary
  const sources = new Map((summary?.sources ?? []).map((source) => [source.ref, source]))
  const bodyLength = content
    ? [...content.resumo, ...content.pontos_de_atencao].reduce((sum, item) => sum + item.texto.length, 0)
    : (legacySummary?.length ?? 0)
  const isLong = bodyLength > COLLAPSE_THRESHOLD

  const subtitle = summary
    ? `Gerado pelo Claude em ${formatStamp(summary.generated_at)}`
    : legacySummary
      ? `Resumo antigo da BuscaProcessos${legacyUpdatedAt ? ` · ${formatStamp(legacyUpdatedAt)}` : ''}`
      : 'Ainda não gerado'

  const generateLabel = isGenerating ? 'Gerando…' : summary ? 'Atualizar' : 'Gerar resumo'

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
              <p className="text-[11px] text-muted-foreground">{subtitle}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {canGenerate && (
              <button
                type="button"
                onClick={onGenerate}
                disabled={isGenerating || isRefreshing}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground underline underline-offset-4 decoration-info/50 hover:decoration-info disabled:opacity-60"
              >
                {isGenerating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                {generateLabel}
              </button>
            )}
            <span className="rounded-full bg-info px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-info-foreground">
              IA
            </span>
          </div>
        </div>

        {isGenerating && (
          <p className="mt-3 text-xs text-muted-foreground">
            Lendo capa, movimentações e publicações. Leva de 10 a 30 segundos.
          </p>
        )}

        {summary && newSinceSummary > 0 && !isGenerating && (
          <p className="mt-3 flex items-center gap-1.5 rounded-md bg-info/10 px-3 py-2 text-xs text-foreground">
            {isRefreshing ? (
              <>
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                Atualizando o resumo com as novidades…
              </>
            ) : (
              <span>
                {newSinceSummary === 1
                  ? '1 movimentação ou publicação chegou depois deste resumo.'
                  : `${newSinceSummary} movimentações ou publicações chegaram depois deste resumo.`}
                {refreshQueued
                  ? ' A atualização foi pedida em lote e aparece aqui quando ficar pronta.'
                  : null}
                {canGenerate && (refreshQueued ? ' Para agora, use “Atualizar”.' : ' Use “Atualizar” para incluí-las.')}
              </span>
            )}
          </p>
        )}

        {content ? (
          <>
            <div
              className={cn(
                'mt-4 space-y-2.5 text-sm leading-relaxed text-foreground/90',
                isLong && !expanded && 'max-h-56 overflow-hidden',
              )}
            >
              <p className="font-semibold text-foreground">
                {content.fase_atual.texto}
                <SourceChips refs={content.fase_atual.fontes} sources={sources} onOpen={onOpenSource} />
              </p>
              <p>
                <span className="text-muted-foreground">Último ato:</span> {content.ultimo_ato.data} —{' '}
                {content.ultimo_ato.descricao}
                <SourceChips refs={[content.ultimo_ato.fonte]} sources={sources} onOpen={onOpenSource} />
              </p>
              {content.resumo.map((paragraph) => (
                <p key={paragraph.texto.slice(0, 40)}>
                  {paragraph.texto}
                  <SourceChips refs={paragraph.fontes} sources={sources} onOpen={onOpenSource} />
                </p>
              ))}

              {content.pontos_de_atencao.length > 0 && (
                <div>
                  <h3 className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Pontos de atenção
                  </h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {content.pontos_de_atencao.map((point) => (
                      <li key={point.texto.slice(0, 40)}>
                        {point.texto}
                        <SourceChips refs={point.fontes} sources={sources} onOpen={onOpenSource} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {content.proximos_passos_registrados.length > 0 && (
                <div>
                  <h3 className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Próximos passos registrados
                  </h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {content.proximos_passos_registrados.map((step) => (
                      <li key={`${step.fonte}-${step.descricao.slice(0, 30)}`}>
                        {step.data ?? 'Sem data'} — {step.descricao}
                        <SourceChips refs={[step.fonte]} sources={sources} onOpen={onOpenSource} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
              Gerado por IA com os dados deste processo no AdvTool — títulos das movimentações e texto
              das publicações, não os autos. As referências (M3, P1…) mostram a fonte de cada
              afirmação. Confira antes de usar em peça ou prazo.
            </p>
          </>
        ) : legacySummary ? (
          <>
            <div className="mt-4 space-y-2.5 text-sm leading-relaxed text-foreground/90">
              {legacySummary
                .split(/\n{2,}/)
                .filter((paragraph) => paragraph.trim())
                .map((paragraph, index) => (
                  <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
                ))}
            </div>
            <p className="mt-4 border-t border-info/20 pt-3 text-[11px] text-muted-foreground">
              Resumo antigo, sem fontes, e pode estar desatualizado.
              {canGenerate && ' “Gerar resumo” faz um novo com os dados de hoje e a fonte de cada afirmação.'}
            </p>
          </>
        ) : (
          !isGenerating && (
            <p className="mt-4 text-sm text-muted-foreground">
              Nenhum resumo ainda.
              {canGenerate &&
                ' “Gerar resumo” lê a capa, as movimentações e as publicações deste processo.'}
            </p>
          )
        )}
      </div>
    </div>
  )
}
