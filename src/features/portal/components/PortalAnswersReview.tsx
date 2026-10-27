'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronDown, Eye, EyeOff, Loader2, Pencil, RefreshCw, Sparkles, Undo2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  PORTAL_QUESTIONS,
  type PortalAnswersRecord,
  type PortalQuestionKey,
} from '../answers/portalAnswersSchema'
import {
  useOfficePortalAnswers,
  usePrepareOfficePortalAnswers,
  useReviewPortalAnswer,
} from '../hooks/usePortalAnswersOffice'

function formatStamp(iso: string): string {
  return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {text
        .split(/\n{2,}/)
        .filter((paragraph) => paragraph.trim())
        .map((paragraph, index) => (
          <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
        ))}
    </div>
  )
}

/**
 * A revisão do escritório das respostas do portal (fase 3, D6), na página do
 * processo.
 *
 * As respostas vão ao cliente sozinhas, com o selo de IA. Aqui o escritório lê
 * o que o cliente lê e, pergunta a pergunta, corrige o texto, volta ao da IA,
 * oculta ou mostra. Quando chega movimentação e a resposta é refeita, a
 * correção antiga sai do ar e aparece aqui como aviso.
 *
 * Recolhido por padrão e sem busca até abrir: a maior parte das visitas à
 * página do processo não é para isto.
 */
export function PortalAnswersReview({
  legalProcessId,
  canEdit,
}: {
  legalProcessId: string
  canEdit: boolean
}) {
  const [open, setOpen] = useState(false)
  const { data, isPending, error } = useOfficePortalAnswers(legalProcessId, open)
  const prepare = usePrepareOfficePortalAnswers(legalProcessId)
  const review = useReviewPortalAnswer(legalProcessId)

  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
      >
        <span className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 text-info" aria-hidden />
          <span>
            <span className="block text-sm font-semibold">Portal do cliente: respostas por IA</span>
            <span className="block text-[11px] text-muted-foreground">
              O que o cliente lê nas perguntas fixas deste processo
            </span>
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="border-t px-5 py-4 text-sm">
          {isPending ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
            </p>
          ) : error || !data ? (
            <p className="text-muted-foreground">
              {error instanceof Error ? error.message : 'Não foi possível ler as respostas.'}
            </p>
          ) : !data.enabled ? (
            <p className="text-muted-foreground">
              A IA do portal está desligada neste ambiente (PORTAL_ASSISTANT_ENABLED=false): o
              cliente não vê as perguntas.
            </p>
          ) : !data.record?.generated_at ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted-foreground">
                Ainda não preparadas. Elas são preparadas quando o cliente escolhe este processo
                no chat de dúvidas do portal.
              </p>
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => prepare.mutate()} disabled={prepare.isPending}>
                  {prepare.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Preparar agora
                </Button>
              )}
            </div>
          ) : (
            <ReviewList
              record={data.record}
              stale={data.stale}
              canEdit={canEdit}
              isPreparing={prepare.isPending}
              onPrepare={() => prepare.mutate()}
              isSaving={review.isPending}
              onReview={(change) => review.mutateAsync(change)}
            />
          )}
        </div>
      )}
    </div>
  )
}

type ReviewChange = Parameters<ReturnType<typeof useReviewPortalAnswer>['mutateAsync']>[0]

function ReviewList({
  record,
  stale,
  canEdit,
  isPreparing,
  onPrepare,
  isSaving,
  onReview,
}: {
  record: PortalAnswersRecord
  stale: boolean
  canEdit: boolean
  isPreparing: boolean
  onPrepare: () => void
  isSaving: boolean
  onReview: (change: ReviewChange) => Promise<unknown>
}) {
  const [editing, setEditing] = useState<PortalQuestionKey | null>(null)
  const [draft, setDraft] = useState('')
  // Revisar resposta desatualizada não adianta: a próxima abertura do cliente
  // a refaz e a correção sai do ar.
  const canReview = canEdit && !stale

  async function saveCorrection(question: PortalQuestionKey) {
    await onReview({ action: 'correct', question, text: draft })
    setEditing(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          Geradas em {record.generated_at ? formatStamp(record.generated_at) : '—'}
          {record.model ? ` · ${record.model}` : ''}
        </span>
      </div>

      {stale && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-info/10 px-3 py-2 text-xs">
          <span>
            Mudou o que o portal mostra (movimentação nova, ocultada ou liberada). Estas respostas
            não aparecem mais; o cliente verá as novas na próxima vez que abrir.
          </span>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={onPrepare} disabled={isPreparing}>
              {isPreparing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Atualizar agora
            </Button>
          )}
        </div>
      )}

      {PORTAL_QUESTIONS.map(({ key, label }) => {
        const correction = record.corrections[key]
        const superseded = record.superseded[key]
        const isHidden = record.hidden.includes(key)
        const text = correction?.text ?? record.answers[key] ?? ''

        return (
          <div key={key} className={cn('rounded-lg border p-3', isHidden && 'opacity-60')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{label}</p>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
                {isHidden && <span className="rounded bg-muted px-1.5 py-0.5">Oculta</span>}
                {correction && (
                  <span className="rounded bg-info/15 px-1.5 py-0.5 text-info">Corrigida</span>
                )}
              </div>
            </div>

            {superseded && (
              <div className="mt-2 flex items-start justify-between gap-3 rounded-md bg-warning/10 px-3 py-2 text-xs">
                <span>
                  A correção de {formatStamp(superseded.at)} foi substituída em{' '}
                  {formatStamp(superseded.superseded_at)}, quando chegou novidade. Texto antigo:
                  “{superseded.text}”
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onReview({ action: 'dismiss_superseded', question: key })}
                    disabled={isSaving}
                    aria-label="Dispensar aviso"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            {editing === key ? (
              <div className="mt-2 flex flex-col gap-2">
                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={5}
                  maxLength={2000}
                  aria-label={`Correção para: ${label}`}
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => saveCorrection(key)}
                    disabled={isSaving || !draft.trim()}
                  >
                    Salvar correção
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-muted-foreground">
                {text ? <Paragraphs text={text} /> : <p>(sem resposta)</p>}
                {correction && (
                  <p className="mt-1.5 text-[11px]">Corrigida pelo escritório em {formatStamp(correction.at)}.</p>
                )}
              </div>
            )}

            {canReview && editing !== key && (
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(text)
                    setEditing(key)
                  }}
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  <Pencil className="h-3 w-3" /> Corrigir
                </button>
                {correction && (
                  <button
                    type="button"
                    onClick={() => onReview({ action: 'clear_correction', question: key })}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    <Undo2 className="h-3 w-3" /> Voltar ao texto da IA
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onReview({ action: 'set_hidden', question: key, hidden: !isHidden })}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  {isHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  {isHidden ? 'Mostrar ao cliente' : 'Ocultar do cliente'}
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
