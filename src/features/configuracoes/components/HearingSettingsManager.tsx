'use client'

import { useState } from 'react'
import { AlertCircle, ClipboardList, Landmark, ListTodo, Loader2, Package, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Can } from '@/components/shared/Can'
import { usePermissions } from '@/hooks/usePermissions'
import { AREAS_JURIDICAS } from '@/data/mock'
import {
  useChecklistTemplates,
  useDeleteChecklistTemplate,
  useDeleteHearingKind,
  useHearingKindUsage,
  useHearingKinds,
  useSaveChecklistTemplate,
  useSaveHearingKind,
} from '@/features/audiencias/hooks/useHearings'
import { checklistTemplateSchema, hearingKindSchema } from '@/schemas/hearing.schema'
import {
  LEGAL_AREAS,
  type HearingChecklistTemplate,
  type HearingKind,
  type LegalArea,
} from '@/types/hearing.types'

const ALL = '__all__'

function areaLabel(area: LegalArea): string {
  return AREAS_JURIDICAS[area]?.label ?? area
}

function offsetLabel(offset: number | null): string {
  if (offset === null) return 'sem prazo'
  return offset === 0 ? 'no dia' : `D-${offset}`
}

// ── Tipos ────────────────────────────────────────────────────────────────────

function KindDialog({ kind, open, onClose }: { kind: HearingKind | null; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        {/* Montado só aberto: cada abertura nasce dos dados do tipo. */}
        {open && <KindForm kind={kind} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function KindForm({ kind, onClose }: { kind: HearingKind | null; onClose: () => void }) {
  const save = useSaveHearingKind()
  const [label, setLabel] = useState(kind?.label ?? '')
  const [eventTitle, setEventTitle] = useState(kind?.event_title ?? '')
  const [duration, setDuration] = useState(String(kind?.default_duration_minutes ?? 60))
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = hearingKindSchema.safeParse({
      label,
      event_title: eventTitle,
      default_duration_minutes: Number(duration),
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Confira os campos.')
      return
    }
    setError(null)
    save.mutate({ id: kind?.id ?? null, input: parsed.data }, { onSuccess: onClose })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>{kind ? 'Editar tipo de audiência' : 'Novo tipo de audiência'}</DialogTitle>
        <DialogDescription>
          A duração é a sugerida ao agendar e a que o compromisso ganha quando a data vem do andamento.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1">
        <Label htmlFor="kind-label" className="text-xs">
          Nome
        </Label>
        <Input id="kind-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Conciliação" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="kind-title" className="text-xs">
          Título na Agenda
        </Label>
        <Input
          id="kind-title"
          value={eventTitle}
          onChange={(e) => setEventTitle(e.target.value)}
          placeholder={label ? `Audiência — ${label}` : 'Ex.: Audiência de Conciliação'}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="kind-duration" className="text-xs">
          Duração padrão (minutos)
        </Label>
        <Input
          id="kind-duration"
          type="number"
          inputMode="numeric"
          min={5}
          max={1440}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className="w-32"
        />
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={save.isPending}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {kind ? 'Salvar' : 'Criar tipo'}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Exclusão com o custo à vista, como em Tipos de Evento: a FK de
 * `hearings.kind_id` é RESTRICT, então um tipo em uso não sai. */
function DeleteKindDialog({ kind, onClose }: { kind: HearingKind | null; onClose: () => void }) {
  const remove = useDeleteHearingKind()
  const { data: usage, isLoading } = useHearingKindUsage(kind?.id ?? null)
  if (!kind) return null
  const inUse = (usage ?? 0) > 0

  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            Remover tipo de audiência
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : inUse ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{kind.label}</span> está em uso por{' '}
            <span className="font-medium text-foreground">{usage} audiência(s)</span>. Troque o tipo
            delas antes de remover.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Remover <span className="font-medium text-foreground">{kind.label}</span>? Os itens de
            checklist só deste tipo saem junto.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {inUse ? 'Entendi' : 'Cancelar'}
          </Button>
          {!inUse && !isLoading && (
            <Button
              variant="destructive"
              size="sm"
              disabled={remove.isPending}
              onClick={() => remove.mutate(kind.id, { onSuccess: onClose })}
            >
              Remover
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Modelos de checklist ─────────────────────────────────────────────────────

function TemplateDialog({
  template,
  defaultKindId,
  open,
  onClose,
}: {
  template: HearingChecklistTemplate | null
  defaultKindId: string | null
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        {open && <TemplateForm template={template} defaultKindId={defaultKindId} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function TemplateForm({
  template,
  defaultKindId,
  onClose,
}: {
  template: HearingChecklistTemplate | null
  defaultKindId: string | null
  onClose: () => void
}) {
  const save = useSaveChecklistTemplate()
  const { data: kinds = [] } = useHearingKinds()
  const [label, setLabel] = useState(template?.label ?? '')
  const [kindId, setKindId] = useState<string | null>(template ? template.kind_id : defaultKindId)
  const [area, setArea] = useState<LegalArea | null>(template?.legal_area ?? null)
  const [offset, setOffset] = useState(template?.offset_days == null ? '' : String(template.offset_days))
  const [createsTask, setCreatesTask] = useState(template?.creates_task ?? true)
  const [clientBrings, setClientBrings] = useState(template?.client_brings ?? false)
  const [error, setError] = useState<string | null>(null)

  const hasOffset = offset.trim() !== ''

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = checklistTemplateSchema.safeParse({
      kind_id: kindId,
      legal_area: area,
      label,
      offset_days: hasOffset ? Number(offset) : null,
      creates_task: hasOffset && createsTask,
      client_brings: clientBrings,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Confira os campos.')
      return
    }
    setError(null)
    save.mutate({ id: template?.id ?? null, input: parsed.data }, { onSuccess: onClose })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>{template ? 'Editar item do checklist' : 'Novo item do checklist'}</DialogTitle>
        <DialogDescription>
          Vale para as audiências cujo checklist ainda vai nascer. As que já têm checklist não mudam.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1">
        <Label htmlFor="template-label" className="text-xs">
          Item
        </Label>
        <Input
          id="template-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex.: Confirmar a presença do cliente"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Tipo de audiência</Label>
          <Select value={kindId ?? ALL} onValueChange={(value) => setKindId(value === ALL ? null : value)}>
            <SelectTrigger className="h-9 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os tipos</SelectItem>
              {kinds.map((kind) => (
                <SelectItem key={kind.id} value={kind.id}>
                  {kind.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Área do caso</Label>
          <Select value={area ?? ALL} onValueChange={(value) => setArea(value === ALL ? null : (value as LegalArea))}>
            <SelectTrigger className="h-9 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as áreas</SelectItem>
              {LEGAL_AREAS.map((option) => (
                <SelectItem key={option} value={option}>
                  {areaLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="template-offset" className="text-xs">
          Dias antes da audiência
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="template-offset"
            type="number"
            inputMode="numeric"
            min={0}
            max={365}
            value={offset}
            onChange={(e) => setOffset(e.target.value)}
            placeholder="vazio = sem prazo"
            className="w-40"
          />
          <span className="text-xs text-muted-foreground">0 = no dia</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="template-task"
            checked={hasOffset && createsTask}
            disabled={!hasOffset}
            onCheckedChange={(checked) => setCreatesTask(checked === true)}
          />
          <Label htmlFor="template-task" className="text-xs font-normal">
            Criar tarefa com esse prazo
            {!hasOffset && <span className="text-muted-foreground"> (precisa de prazo)</span>}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="template-brings"
            checked={clientBrings}
            onCheckedChange={(checked) => setClientBrings(checked === true)}
          />
          <Label htmlFor="template-brings" className="text-xs font-normal">
            É algo que o cliente leva à audiência
          </Label>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={save.isPending}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {template ? 'Salvar' : 'Acrescentar'}
        </Button>
      </DialogFooter>
    </form>
  )
}

// ── Aba ──────────────────────────────────────────────────────────────────────

/**
 * Configurações → Audiências: os tipos (nome, título na Agenda, duração) e o
 * checklist-padrão de cada um. O checklist de uma audiência é a soma dos itens
 * de "Todos os tipos", dos do tipo dela e dos da área do caso.
 */
export function HearingSettingsManager() {
  const { can } = usePermissions()
  const canManage = can('configuracoes', 'manage')
  const { data: kinds = [], isLoading: loadingKinds } = useHearingKinds()
  const { data: templates = [], isLoading: loadingTemplates } = useChecklistTemplates()
  const deleteTemplate = useDeleteChecklistTemplate()

  const [kindDialog, setKindDialog] = useState<{ open: boolean; kind: HearingKind | null }>({ open: false, kind: null })
  const [deletingKind, setDeletingKind] = useState<HearingKind | null>(null)
  const [templateDialog, setTemplateDialog] = useState<{
    open: boolean
    template: HearingChecklistTemplate | null
    kindId: string | null
  }>({ open: false, template: null, kindId: null })

  // Grupos: "Todos os tipos" primeiro, depois cada tipo na ordem da lista.
  const groups: { kindId: string | null; title: string }[] = [
    { kindId: null, title: 'Todos os tipos' },
    ...kinds.map((kind) => ({ kindId: kind.id, title: kind.label })),
  ]

  return (
    <div className="space-y-8">
      {/* ── Tipos ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Tipos de audiência</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              O título do compromisso na Agenda e a duração sugerida ao agendar
            </p>
          </div>
          <Can resource="configuracoes" action="manage">
            <Button size="sm" onClick={() => setKindDialog({ open: true, kind: null })}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Novo tipo
            </Button>
          </Can>
        </div>

        {loadingKinds ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_4.5rem_4rem] gap-4 border-b bg-muted/30 px-5 py-2.5 text-xs font-medium text-muted-foreground">
              <span>Tipo</span>
              <span>Título na Agenda</span>
              <span className="text-right">Duração</span>
              <span />
            </div>
            <div className="divide-y">
              {kinds.map((kind) => (
                <div key={kind.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_4.5rem_4rem] items-center gap-4 px-5 py-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <Landmark aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">{kind.label}</span>
                    {kind.is_system && <span className="shrink-0 text-[10px] text-muted-foreground">padrão</span>}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {kind.event_title ?? `Audiência — ${kind.label}`}
                  </span>
                  <span className="text-right text-xs tabular-nums text-muted-foreground">{kind.default_duration_minutes} min</span>
                  {canManage ? (
                    <span className="flex items-center gap-1">
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Editar ${kind.label}`}
                        onClick={() => setKindDialog({ open: true, kind })}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Remover ${kind.label}`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeletingKind(kind)}
                      >
                        <Trash2 />
                      </Button>
                    </span>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Checklist ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Checklist de preparação</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Copiado para a audiência quando a data é conferida. Itens com prazo viram tarefas relativas à
            data da audiência, que andam junto se ela for remarcada.
          </p>
        </div>

        {loadingTemplates ? (
          <Skeleton className="h-60 w-full rounded-xl" />
        ) : (
          <div className="space-y-4">
            {groups.map((group) => {
              const items = templates.filter((template) => template.kind_id === group.kindId)
              if (items.length === 0 && group.kindId !== null && !canManage) return null
              return (
                <div key={group.kindId ?? 'all'} className="overflow-hidden rounded-xl border">
                  <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-5 py-2">
                    <span className="flex items-center gap-2 text-xs font-semibold">
                      <ClipboardList aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
                      {group.title}
                      <span className="font-normal text-muted-foreground">· {items.length}</span>
                    </span>
                    {canManage && (
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setTemplateDialog({ open: true, template: null, kindId: group.kindId })}
                      >
                        <Plus />
                        Item
                      </Button>
                    )}
                  </div>
                  {items.length === 0 ? (
                    <p className="px-5 py-3 text-xs text-muted-foreground">Sem itens próprios deste tipo.</p>
                  ) : (
                    <ul className="divide-y">
                      {items.map((template) => (
                        <li key={template.id} className="flex items-center gap-3 px-5 py-2.5">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{template.label}</span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
                              <span className="tabular-nums">{offsetLabel(template.offset_days)}</span>
                              {template.creates_task && (
                                <span className="inline-flex items-center gap-1">
                                  <ListTodo aria-hidden className="h-3 w-3" />
                                  cria tarefa
                                </span>
                              )}
                              {template.client_brings && (
                                <span className="inline-flex items-center gap-1">
                                  <Package aria-hidden className="h-3 w-3" />
                                  cliente leva
                                </span>
                              )}
                              {template.legal_area && <span>só {areaLabel(template.legal_area)}</span>}
                            </span>
                          </span>
                          {canManage && (
                            <span className="flex items-center gap-1">
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                aria-label={`Editar ${template.label}`}
                                onClick={() => setTemplateDialog({ open: true, template, kindId: template.kind_id })}
                              >
                                <Pencil />
                              </Button>
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                aria-label={`Remover ${template.label}`}
                                className="text-muted-foreground hover:text-destructive"
                                disabled={deleteTemplate.isPending}
                                onClick={() => deleteTemplate.mutate(template.id)}
                              >
                                <Trash2 />
                              </Button>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <KindDialog
        open={kindDialog.open}
        kind={kindDialog.kind}
        onClose={() => setKindDialog({ open: false, kind: null })}
      />
      <DeleteKindDialog kind={deletingKind} onClose={() => setDeletingKind(null)} />
      <TemplateDialog
        open={templateDialog.open}
        template={templateDialog.template}
        defaultKindId={templateDialog.kindId}
        onClose={() => setTemplateDialog({ open: false, template: null, kindId: null })}
      />
    </div>
  )
}
