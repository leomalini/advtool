'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FileWarning,
  Flame,
  Loader2,
  Pencil,
  Scale,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { PublicacaoAtividades } from './PublicacaoAtividades'
import {
  usePublication,
  usePublicationQueue,
  useUnreadPublicationCount,
  useMarkPublicationRead,
  useSetPublicationHandled,
  useUpdatePublicationFields,
} from '../hooks/usePublications'

/** Acima disso o texto entra recolhido — publicação de diário passa fácil de
 * duas mil palavras e a tela vira um paredão. */
const COLLAPSE_THRESHOLD = 600

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return '—'
  }
}

// ── Peças ─────────────────────────────────────────────────────────────────────

function DateBlock({
  icon: Icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ElementType
  label: string
  value: string
  tone?: 'deadline'
  /** Fundamento legal da data derivada. As duas datas calculadas trazem o
   * artigo: quem confere prazo precisa saber de onde saiu o número, e não
   * aceitar a conta porque a tela mandou. */
  hint?: string
}) {
  const block = (
    <div className={cn('flex items-center gap-2.5', hint && 'cursor-help')}>
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          tone === 'deadline' ? 'bg-warning/12 text-warning' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div>
        <p
          className={cn(
            'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
            hint && 'underline decoration-dotted underline-offset-2',
          )}
        >
          {label}
        </p>
        <p className="text-sm font-medium tabular-nums">{value}</p>
      </div>
    </div>
  )

  if (!hint) return block

  return (
    <Tooltip>
      <TooltipTrigger asChild>{block}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-72 text-xs leading-relaxed">
        {hint}
      </TooltipContent>
    </Tooltip>
  )
}

/** Tipo e assunto não vêm da API: são texto livre nosso, editável no lugar. */
function EditableField({
  value,
  placeholder,
  onSave,
}: {
  value: string | null
  placeholder: string
  onSave: (next: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  // O rascunho é semeado ao entrar em edição, não sincronizado por efeito: ele
  // só existe enquanto o campo está aberto, e sincronizar a cada mudança da
  // prop provocaria render em cascata.
  function startEditing() {
    setDraft(value ?? '')
    setEditing(true)
  }

  function commit() {
    setEditing(false)
    const next = draft.trim() || null
    if (next !== value) onSave(next)
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setDraft(value ?? '')
            setEditing(false)
          }
        }}
        placeholder={placeholder}
        className="h-6 w-48 px-2 py-0 text-xs"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className="group inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {value ?? placeholder}
      <Pencil className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}

// ── Tela ──────────────────────────────────────────────────────────────────────

export function PublicacaoDetailPage({ publicacaoId }: { publicacaoId: string }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [onlyUnreadQueue, setOnlyUnreadQueue] = useState(true)

  const { data: publicacao, isLoading } = usePublication(publicacaoId)
  const { data: queue = [] } = usePublicationQueue(onlyUnreadQueue)
  const { data: unreadCount = 0 } = useUnreadPublicationCount()

  const markRead = useMarkPublicationRead()
  const setHandled = useSetPublicationHandled()
  const updateFields = useUpdatePublicationFields(publicacaoId)

  // Abrir é ler: o carimbo sai daqui, não de um botão. A mutation ignora quem
  // já tem `read_at`, então reabrir não reescreve a data original.
  useEffect(() => {
    if (publicacao && !publicacao.read_at) markRead.mutate(publicacao.id)
    // markRead muda de identidade a cada render do hook; incluí-lo aqui
    // dispararia a marcação em laço.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicacao?.id, publicacao?.read_at])

  const { previousId, nextId } = useMemo(() => {
    const index = queue.indexOf(publicacaoId)
    if (index === -1) return { previousId: null, nextId: queue[0] ?? null }
    return {
      previousId: index > 0 ? queue[index - 1] : null,
      nextId: index < queue.length - 1 ? queue[index + 1] : null,
    }
  }, [queue, publicacaoId])

  function goTo(id: string | null) {
    if (id) router.push(`/publicacoes/${id}`)
  }

  function handleAndNext() {
    if (!publicacao) return
    setHandled.mutate(
      { id: publicacao.id, handled: true },
      { onSuccess: () => goTo(nextId) },
    )
  }

  // Atalhos do print: k anterior, j próxima, e tratar e próxima.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === 'k') goTo(previousId)
      if (event.key === 'j') goTo(nextId)
      if (event.key === 'e') handleAndNext()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previousId, nextId, publicacao?.id])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!publicacao) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">Publicação não encontrada.</p>
        <Button variant="outline" onClick={() => router.push('/publicacoes')}>
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Voltar para a lista
        </Button>
      </div>
    )
  }

  const text = publicacao.content_text ?? ''
  const isLong = text.length > COLLAPSE_THRESHOLD
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim())
  const orphan = !publicacao.legal_process_id

  return (
    <div className="-m-6 flex h-full flex-col">
      {/* ── Barra da fila ── */}
      <div className="shrink-0 border-b bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-6 py-2.5">
        <Link
          href="/publicacoes"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Lista
        </Link>

        {!publicacao.read_at && (
          <span className="rounded-full bg-warning/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
            Não lida
          </span>
        )}

        <span className="text-sm font-semibold tabular-nums">
          {unreadCount} não lidas restantes
        </span>

        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={onlyUnreadQueue}
            onChange={(e) => setOnlyUnreadQueue(e.target.checked)}
            className="h-3.5 w-3.5 accent-current"
          />
          Apenas não lidas
        </label>

        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" disabled={!previousId} onClick={() => goTo(previousId)}>
            <ChevronLeft className="mr-1 h-3.5 w-3.5" />
            Anterior
            <kbd className="ml-1.5 rounded border border-border px-1 text-[10px]">k</kbd>
          </Button>
          <Button size="sm" variant="outline" disabled={!nextId} onClick={() => goTo(nextId)}>
            Próxima
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
            <kbd className="ml-1.5 rounded border border-border px-1 text-[10px]">j</kbd>
          </Button>
          <Button size="sm" onClick={handleAndNext} disabled={setHandled.isPending}>
            <Check className="mr-1 h-3.5 w-3.5" />
            Tratar e próxima
            <kbd className="ml-1.5 rounded border border-primary-foreground/30 px-1 text-[10px]">
              e
            </kbd>
          </Button>
        </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl space-y-4 px-6 py-6">
          {/* ── Cabeçalho ── */}
          <div
            className={cn(
              'rounded-xl border bg-card',
              publicacao.read_at ? 'border-border' : 'border-warning/40',
            )}
          >
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                #{publicacao.sequence_number}
              </span>
              {publicacao.diario_sigla && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                  {publicacao.diario_sigla}
                </span>
              )}
              {publicacao.legal_process_id && publicacao.cnj_number ? (
                <Link
                  href={`/processos/${publicacao.legal_process_id}`}
                  className="font-mono text-xs text-info underline-offset-4 hover:underline"
                >
                  {publicacao.cnj_number}
                </Link>
              ) : (
                <span className="font-mono text-xs text-info">
                  {publicacao.cnj_number ?? 'sem CNJ'}
                </span>
              )}
              <span className="text-muted-foreground">·</span>
              <EditableField
                value={publicacao.publication_type}
                placeholder="definir tipo"
                onSave={(publication_type) => updateFields.mutate({ publication_type })}
              />
              <span className="text-muted-foreground">·</span>
              <EditableField
                value={publicacao.subject}
                placeholder="definir assunto"
                onSave={(subject) => updateFields.mutate({ subject })}
              />

              <div className="ml-auto flex items-center gap-2">
                {orphan ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link
                      href={`/processos?create=1${
                        publicacao.cnj_number
                          ? `&cnj=${encodeURIComponent(publicacao.cnj_number)}`
                          : ''
                      }`}
                    >
                      <FileWarning className="mr-1.5 h-3.5 w-3.5" />
                      Cadastrar processo
                    </Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/processos/${publicacao.legal_process_id}`}>
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Abrir processo
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
              <Button
                size="sm"
                variant={publicacao.handled_at ? 'outline' : 'default'}
                className={cn(
                  publicacao.handled_at
                    ? 'border-success/40 bg-success/10 text-success hover:bg-success/15'
                    : 'bg-success text-success-foreground hover:bg-success/90',
                )}
                onClick={() =>
                  setHandled.mutate({
                    id: publicacao.id,
                    handled: !publicacao.handled_at,
                  })
                }
                disabled={setHandled.isPending}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                {publicacao.handled_at ? 'Tratada' : 'Marcar como tratada'}
              </Button>

              {publicacao.external_url && (
                <Button size="sm" variant="outline" asChild>
                  <a href={publicacao.external_url} target="_blank" rel="noopener noreferrer">
                    <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                    Abrir publicação {publicacao.diario_sigla ? `no ${publicacao.diario_sigla}` : ''}
                  </a>
                </Button>
              )}

              <div className="ml-auto flex flex-wrap items-center gap-5">
                <DateBlock
                  icon={Calendar}
                  label="Disponibilização"
                  value={formatDate(publicacao.availability_date)}
                />
                <DateBlock
                  icon={BookOpen}
                  label="Publicação"
                  value={formatDate(publicacao.publication_date)}
                  hint="Primeiro dia útil seguinte à data da disponibilização cf. art. 4º, §3º da Lei 11.419/2006"
                />
                <DateBlock
                  icon={Flame}
                  label="Início do prazo"
                  value={formatDate(publicacao.deadline_start_at)}
                  tone="deadline"
                  hint="Primeiro dia útil seguinte à data da publicação cf. art. 4º, §4º da Lei 11.419/2006"
                />
              </div>
            </div>

            {/* ── Texto integral ── */}
            <div className="p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Scale className="h-3.5 w-3.5 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">
                    Texto integral
                    {publicacao.title && (
                      <span className="font-normal text-muted-foreground"> · {publicacao.title}</span>
                    )}
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {text.length} caracteres
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(text)
                      toast.success('Texto copiado.')
                    }}
                  >
                    <Copy className="mr-1 h-3 w-3" />
                    Copiar texto
                  </Button>
                </div>
              </div>

              <div
                className={cn(
                  'space-y-3 text-sm leading-relaxed text-foreground/90',
                  isLong && !expanded && 'max-h-48 overflow-hidden',
                )}
              >
                {paragraphs.length === 0 ? (
                  <p className="text-muted-foreground">Publicação sem texto.</p>
                ) : (
                  paragraphs.map((paragraph, index) => (
                    <p key={`${index}-${paragraph.slice(0, 24)}`} className="whitespace-pre-wrap">
                      {paragraph}
                    </p>
                  ))
                )}
              </div>

              {isLong && (
                <div className="relative">
                  {!expanded && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -top-12 left-0 h-12 w-full bg-gradient-to-t from-card to-transparent"
                    />
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 h-7 text-xs"
                    onClick={() => setExpanded((v) => !v)}
                  >
                    {expanded ? 'Recolher' : 'Ler texto completo'}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <PublicacaoAtividades publicacao={publicacao} />
        </div>
      </div>
    </div>
  )
}
