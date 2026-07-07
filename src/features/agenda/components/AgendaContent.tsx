'use client'

import { useState, useMemo } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  isToday,
  addDays,
  parseISO,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  AlertCircle,
  CalendarDays,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { CASOS, ADVOGADOS } from '@/data/mock'
import type { Evento } from '@/data/mock'

// ── Constantes de tipo ─────────────────────────────────────────

const TIPO_CONFIG: Record<
  Evento['tipo'],
  { label: string; color: string; bg: string; text: string }
> = {
  audiencia: { label: 'Audiência', color: '#ef4444', bg: 'bg-red-50', text: 'text-red-700' },
  prazo: { label: 'Prazo', color: '#f59e0b', bg: 'bg-amber-50', text: 'text-amber-700' },
  reuniao: { label: 'Reunião', color: '#6366f1', bg: 'bg-indigo-50', text: 'text-indigo-700' },
  compromisso: { label: 'Compromisso', color: '#10b981', bg: 'bg-emerald-50', text: 'text-emerald-700' },
}

// ── Tipos ──────────────────────────────────────────────────────

interface EventoEnriquecido extends Evento {
  clienteNome: string
}

// ── Helpers ────────────────────────────────────────────────────

function useEventosMock(): EventoEnriquecido[] {
  return useMemo(() => {
    return CASOS.flatMap((caso) =>
      caso.eventos.map((ev) => ({
        ...ev,
        clienteNome: caso.clienteNome,
      })),
    )
  }, [])
}

function formatHora(hora: string, horaFim?: string): string {
  if (horaFim) return `${hora} – ${horaFim}`
  return hora
}

function toDateInput(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

// ── Modal de Detalhe de Evento ─────────────────────────────────

interface EventoDetailProps {
  evento: EventoEnriquecido | null
  open: boolean
  onClose: () => void
}

function EventoDetailModal({ evento, open, onClose }: EventoDetailProps) {
  if (!evento) return null
  const cfg = TIPO_CONFIG[evento.tipo]

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton={false} className="sm:max-w-[460px] p-0 gap-0 overflow-hidden">
        <div className="flex flex-col">
          <div
            className="relative px-6 pt-5 pb-4 border-b"
            style={{ backgroundColor: cfg.color + '0D' }}
          >
            <div
              className="absolute inset-x-0 top-0 h-[3px] rounded-t-xl"
              style={{ backgroundColor: cfg.color }}
            />
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3.5 right-4 p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-black/5 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <span
              className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-white mb-2"
              style={{ backgroundColor: cfg.color }}
            >
              {cfg.label}
            </span>
            <p className="text-[17px] font-medium leading-snug pr-8">{evento.titulo}</p>
            <div className="flex items-center gap-1.5 mt-2.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>
                {format(parseISO(evento.data), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                {' · '}
                {formatHora(evento.hora, evento.horaFim)}
              </span>
            </div>
          </div>

          <div className="px-6 py-5 space-y-3">
            {evento.local && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground/60 mt-0.5 shrink-0" />
                <p className="text-sm">{evento.local}</p>
              </div>
            )}
            {evento.descricao && (
              <div className="flex items-start gap-3">
                <CalendarDays className="h-4 w-4 text-muted-foreground/60 mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">{evento.descricao}</p>
              </div>
            )}
            {(evento.isFatalPrazo || evento.isUrgente) && (
              <div className="flex gap-2 pt-1">
                {evento.isFatalPrazo && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border bg-red-50 text-red-600 border-red-200">
                    <AlertCircle className="h-3 w-3" />
                    Prazo Fatal
                  </span>
                )}
                {evento.isUrgente && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border bg-amber-50 text-amber-600 border-amber-200">
                    <AlertCircle className="h-3 w-3" />
                    Urgente
                  </span>
                )}
              </div>
            )}
            <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Cliente</span>
                <span className="font-medium">{evento.clienteNome}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Responsável</span>
                <span className="font-medium">{evento.responsavel}</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Formulário de Novo Evento ──────────────────────────────────

interface NovoEventoFormData {
  titulo: string
  tipo: Evento['tipo']
  data: string
  hora: string
  horaFim: string
  local: string
  descricao: string
  casoId: string
  responsavelIds: string[]
  isFatalPrazo: boolean
  isUrgente: boolean
}

const FORM_DEFAULTS: NovoEventoFormData = {
  titulo: '',
  tipo: 'reuniao',
  data: '',
  hora: '09:00',
  horaFim: '',
  local: '',
  descricao: '',
  casoId: '',
  responsavelIds: [],
  isFatalPrazo: false,
  isUrgente: false,
}

interface NovoEventoModalProps {
  open: boolean
  defaultData?: string
  onClose: () => void
  onSave: (evento: EventoEnriquecido) => void
}

function NovoEventoModal({ open, defaultData, onClose, onSave }: NovoEventoModalProps) {
  const [form, setForm] = useState<NovoEventoFormData>({
    ...FORM_DEFAULTS,
    data: defaultData ?? '',
  })
  const [errors, setErrors] = useState<Partial<Record<'titulo' | 'data' | 'hora' | 'responsavelIds', string>>>({})
  // Busca de processo/caso
  const [casoSearch, setCasoSearch] = useState('')
  const [casoDropdownOpen, setCasoDropdownOpen] = useState(false)

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setForm({ ...FORM_DEFAULTS, data: defaultData ?? '' })
      setErrors({})
      setCasoSearch('')
      setCasoDropdownOpen(false)
    } else {
      onClose()
    }
  }

  function set<K extends keyof NovoEventoFormData>(key: K, value: NovoEventoFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (key in errors) setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  // Filtra casos por nome do cliente OU número CNJ
  const casosFiltrados = casoSearch.trim().length > 0
    ? CASOS.filter((c) => {
        const q = casoSearch.toLowerCase()
        return (
          c.clienteNome.toLowerCase().includes(q) ||
          (c.numeroCNJ ?? '').toLowerCase().includes(q)
        )
      })
    : []

  function selectCaso(casoId: string) {
    setForm((prev) => ({ ...prev, casoId }))
    setCasoSearch('')
    setCasoDropdownOpen(false)
  }

  function clearCaso() {
    setForm((prev) => ({ ...prev, casoId: '' }))
    setCasoSearch('')
  }

  function addResponsavel(advId: string) {
    if (!advId || form.responsavelIds.includes(advId)) return
    setForm((prev) => ({ ...prev, responsavelIds: [...prev.responsavelIds, advId] }))
    setErrors((prev) => ({ ...prev, responsavelIds: undefined }))
  }

  function removeResponsavel(advId: string) {
    setForm((prev) => ({
      ...prev,
      responsavelIds: prev.responsavelIds.filter((id) => id !== advId),
    }))
  }

  function validate(): boolean {
    const next: typeof errors = {}
    if (!form.titulo.trim()) next.titulo = 'Título obrigatório'
    if (!form.data) next.data = 'Data obrigatória'
    if (!form.hora) next.hora = 'Hora obrigatória'
    if (form.responsavelIds.length === 0) next.responsavelIds = 'Selecione ao menos um responsável'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    const advogados = ADVOGADOS.filter((a) => form.responsavelIds.includes(a.id))
    const primeiroAdv = advogados[0] ?? ADVOGADOS[0]
    const caso = CASOS.find((c) => c.id === form.casoId)

    const novoEvento: EventoEnriquecido = {
      id: `ev-local-${Date.now()}`,
      titulo: form.titulo.trim(),
      tipo: form.tipo,
      data: form.data,
      hora: form.hora,
      horaFim: form.horaFim || undefined,
      local: form.local || undefined,
      descricao: form.descricao || '',
      casoId: form.casoId || undefined,
      clienteId: caso?.clienteId,
      responsavel: advogados.map((a) => a.nome).join(' · '),
      responsavelIniciais: primeiroAdv.iniciais,
      isFatalPrazo: form.isFatalPrazo,
      isUrgente: form.isUrgente,
      clienteNome: caso?.clienteNome ?? '—',
    }

    onSave(novoEvento)
    onClose()
  }

  const casoSelecionado = CASOS.find((c) => c.id === form.casoId)
  // Advogados ainda não selecionados (para o select de adição)
  const advDisponiveis = ADVOGADOS.filter((a) => !form.responsavelIds.includes(a.id))

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      {/* flex-col + max-h garante que header e footer fiquem fixos */}
      <DialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden flex flex-col max-h-[90vh]">

        {/* ── Header fixo ── */}
        <div className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogHeader className="p-0">
            <DialogTitle className="text-base font-semibold">Novo Evento</DialogTitle>
          </DialogHeader>
        </div>

        {/* ── Corpo com scroll ── */}
        <form
          id="novo-evento-form"
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 min-h-0"
        >
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

            {/* Título */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Título *</label>
              <Input
                placeholder="Ex: Audiência de instrução — Silva x Empresa"
                value={form.titulo}
                onChange={(e) => set('titulo', e.target.value)}
                className={cn(errors.titulo && 'border-destructive')}
                autoFocus
              />
              {errors.titulo && <p className="text-xs text-destructive">{errors.titulo}</p>}
            </div>

            {/* Tipo */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Tipo *</label>
              <div className="grid grid-cols-4 gap-1.5">
                {(Object.entries(TIPO_CONFIG) as [Evento['tipo'], typeof TIPO_CONFIG[Evento['tipo']]][]).map(
                  ([tipo, config]) => (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => set('tipo', tipo)}
                      className={cn(
                        'rounded-lg border px-2 py-2 text-xs font-medium transition-all',
                        form.tipo === tipo
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                      )}
                    >
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
                        style={{ backgroundColor: config.color }}
                      />
                      {config.label}
                    </button>
                  ),
                )}
              </div>
            </div>

            {/* Data + Hora */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Data *</label>
                <Input
                  type="date"
                  value={form.data}
                  onChange={(e) => set('data', e.target.value)}
                  className={cn('text-sm', errors.data && 'border-destructive')}
                />
                {errors.data && <p className="text-xs text-destructive">{errors.data}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Início *</label>
                <Input
                  type="time"
                  value={form.hora}
                  onChange={(e) => set('hora', e.target.value)}
                  className={cn('text-sm', errors.hora && 'border-destructive')}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Fim</label>
                <Input
                  type="time"
                  value={form.horaFim}
                  onChange={(e) => set('horaFim', e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            {/* Processo / Caso — busca por texto */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Processo / Caso</label>

              {casoSelecionado ? (
                /* Chip do caso selecionado */
                <div className="flex items-center gap-2.5 rounded-lg border bg-muted/40 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{casoSelecionado.clienteNome}</p>
                    {casoSelecionado.numeroCNJ && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                        {casoSelecionado.numeroCNJ}
                      </p>
                    )}
                    {!casoSelecionado.numeroCNJ && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">
                        {casoSelecionado.areaJuridica}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={clearCaso}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                /* Campo de busca com dropdown */
                <div className="relative">
                  <Input
                    placeholder="Buscar por nome do cliente ou nº do processo…"
                    value={casoSearch}
                    onChange={(e) => {
                      setCasoSearch(e.target.value)
                      setCasoDropdownOpen(true)
                    }}
                    onFocus={() => setCasoDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setCasoDropdownOpen(false), 150)}
                  />
                  {casoDropdownOpen && casoSearch.trim().length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border bg-popover shadow-md overflow-hidden">
                      {casosFiltrados.length > 0 ? (
                        <div className="max-h-48 overflow-y-auto">
                          {casosFiltrados.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onMouseDown={() => selectCaso(c.id)}
                              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-accent transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{c.clienteNome}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {c.numeroCNJ
                                    ? <span className="font-mono">{c.numeroCNJ}</span>
                                    : <span className="capitalize">{c.areaJuridica} · sem processo</span>
                                  }
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="px-3 py-3 text-xs text-muted-foreground text-center">
                          Nenhum caso encontrado
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>


            {/* Responsáveis — select + chips */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Responsáveis *</label>

              {/* Select para adicionar */}
              {advDisponiveis.length > 0 ? (
                <select
                  value=""
                  onChange={(e) => addResponsavel(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 text-muted-foreground"
                >
                  <option value="" disabled>Selecionar responsável…</option>
                  {advDisponiveis.map((a) => (
                    <option key={a.id} value={a.id}>{a.nome}</option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-muted-foreground">Todos os responsáveis foram adicionados.</p>
              )}

              {/* Chips dos selecionados */}
              {form.responsavelIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {ADVOGADOS.filter((a) => form.responsavelIds.includes(a.id)).map((adv) => (
                    <div
                      key={adv.id}
                      className="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 pl-1.5 pr-1 py-1 text-xs font-medium"
                    >
                      <span
                        className={cn(
                          'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white',
                          adv.cor
                        )}
                      >
                        {adv.iniciais}
                      </span>
                      <span className="text-foreground">{adv.nome}</span>
                      <button
                        type="button"
                        onClick={() => removeResponsavel(adv.id)}
                        className="ml-0.5 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {errors.responsavelIds && (
                <p className="text-xs text-destructive">{errors.responsavelIds}</p>
              )}
            </div>

            {/* Local */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Local</label>
              <Input
                placeholder="Ex: TJSP — Sala 302"
                value={form.local}
                onChange={(e) => set('local', e.target.value)}
              />
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Descrição</label>
              <textarea
                rows={2}
                placeholder="Observações sobre o evento…"
                value={form.descricao}
                onChange={(e) => set('descricao', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-none"
              />
            </div>

            {/* Marcadores */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Marcadores</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => set('isFatalPrazo', !form.isFatalPrazo)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                    form.isFatalPrazo
                      ? 'bg-red-600 text-white border-red-600'
                      : 'border-border text-muted-foreground hover:border-red-300 hover:text-red-600'
                  )}
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  Prazo Fatal
                </button>
                <button
                  type="button"
                  onClick={() => set('isUrgente', !form.isUrgente)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                    form.isUrgente
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'border-border text-muted-foreground hover:border-amber-300 hover:text-amber-600'
                  )}
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  Urgente
                </button>
              </div>
            </div>

          </div>

          {/* ── Footer fixo — sempre visível ── */}
          <div className="shrink-0 flex justify-end gap-2 px-6 py-4 border-t bg-background">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" size="sm">
              Criar Evento
            </Button>
          </div>
        </form>

      </DialogContent>
    </Dialog>
  )
}

// ── Próximos Eventos (sidebar) ─────────────────────────────────

interface ProximosEventosProps {
  eventos: EventoEnriquecido[]
  onEventoClick: (ev: EventoEnriquecido) => void
}

function ProximosEventos({ eventos, onEventoClick }: ProximosEventosProps) {
  const hoje = new Date()
  const em7dias = addDays(hoje, 7)

  const proximos = eventos
    .filter((ev) => {
      const d = parseISO(ev.data)
      return d >= hoje && d <= em7dias
    })
    .sort((a, b) => {
      const dateCompare = a.data.localeCompare(b.data)
      if (dateCompare !== 0) return dateCompare
      return a.hora.localeCompare(b.hora)
    })

  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Próximos 7 dias
        </p>
      </div>
      {proximos.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">Nenhum evento nos próximos 7 dias.</p>
        </div>
      ) : (
        <div className="divide-y">
          {proximos.map((ev) => {
            const cfg = TIPO_CONFIG[ev.tipo]
            return (
              <button
                key={ev.id}
                type="button"
                onClick={() => onEventoClick(ev)}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors text-left"
              >
                <div
                  className="h-2 w-2 rounded-full mt-1.5 shrink-0"
                  style={{ backgroundColor: cfg.color }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{ev.titulo}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {format(parseISO(ev.data), "dd 'de' MMM", { locale: ptBR })}
                    {' · '}
                    {ev.hora}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">{ev.clienteNome}</p>
                </div>
                {ev.isFatalPrazo && (
                  <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────

export function AgendaContent() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 6, 7))
  const [selectedEvento, setSelectedEvento] = useState<EventoEnriquecido | null>(null)
  const [novoEventoOpen, setNovoEventoOpen] = useState(false)
  const [novoEventoData, setNovoEventoData] = useState<string | undefined>(undefined)
  const [localEventos, setLocalEventos] = useState<EventoEnriquecido[]>([])

  const baseEventos = useEventosMock()
  const eventos = useMemo(() => [...baseEventos, ...localEventos], [baseEventos, localEventos])

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  function getEventosForDay(day: Date): EventoEnriquecido[] {
    return eventos.filter((ev) => isSameDay(parseISO(ev.data), day))
  }

  function handleDayClick(day: Date) {
    setNovoEventoData(toDateInput(day))
    setNovoEventoOpen(true)
  }

  function handleNovoEventoButton() {
    setNovoEventoData(undefined)
    setNovoEventoOpen(true)
  }

  function handleSaveEvento(evento: EventoEnriquecido) {
    setLocalEventos((prev) => [...prev, evento])
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-base font-semibold capitalize w-40 text-center">
            {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
          </h2>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentDate(new Date())}
          >
            Hoje
          </Button>
        </div>
        <Button size="sm" onClick={handleNovoEventoButton}>
          <Plus className="h-4 w-4 mr-1.5" />
          Novo Evento
        </Button>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 flex-wrap">
        {(Object.entries(TIPO_CONFIG) as [Evento['tipo'], typeof TIPO_CONFIG[Evento['tipo']]][]).map(
          ([tipo, cfg]) => (
            <div key={tipo} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: cfg.color }} />
              {cfg.label}
            </div>
          ),
        )}
        <span className="text-xs text-muted-foreground/50 ml-auto hidden sm:block">
          Clique em um dia para criar um evento
        </span>
      </div>

      {/* Layout principal: calendário + sidebar */}
      <div className="grid grid-cols-[1fr_240px] gap-4 items-start">
        {/* Calendário */}
        <div className="rounded-xl border overflow-hidden">
          {/* Dias da semana */}
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {weekdays.map((day) => (
              <div
                key={day}
                className="py-2.5 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Grade de dias */}
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const dayEventos = getEventosForDay(day)
              const isCurrentMonth = isSameMonth(day, currentDate)
              const isTodayDay = isToday(day)

              return (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-label={`Criar evento em ${format(day, "dd 'de' MMMM", { locale: ptBR })}`}
                  onClick={() => handleDayClick(day)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleDayClick(day) }}
                  className={cn(
                    'min-h-[96px] p-1.5 border-b border-r transition-colors cursor-pointer select-none',
                    !isCurrentMonth && 'bg-muted/15',
                    isTodayDay && 'bg-primary/5',
                    'hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  )}
                >
                  {/* Número do dia */}
                  <div
                    className={cn(
                      'h-6 w-6 flex items-center justify-center rounded-full text-xs font-medium mb-1',
                      isTodayDay
                        ? 'bg-primary text-primary-foreground'
                        : !isCurrentMonth
                          ? 'text-muted-foreground/40'
                          : 'text-foreground',
                    )}
                  >
                    {format(day, 'd')}
                  </div>

                  {/* Eventos do dia */}
                  <div className="space-y-0.5">
                    {dayEventos.slice(0, 3).map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation() // impede abrir o modal de criação
                          setSelectedEvento(ev)
                        }}
                        className="w-full rounded px-1 py-0.5 text-[11px] text-white text-left truncate hover:opacity-80 transition-opacity"
                        style={{ backgroundColor: TIPO_CONFIG[ev.tipo].color }}
                      >
                        {ev.titulo}
                      </button>
                    ))}
                    {dayEventos.length > 3 && (
                      <p className="text-[10px] text-muted-foreground pl-1">
                        +{dayEventos.length - 3} mais
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Sidebar — próximos 7 dias */}
        <ProximosEventos
          eventos={eventos}
          onEventoClick={setSelectedEvento}
        />
      </div>

      {/* Modal de detalhe */}
      <EventoDetailModal
        evento={selectedEvento}
        open={!!selectedEvento}
        onClose={() => setSelectedEvento(null)}
      />

      {/* Modal de criação */}
      <NovoEventoModal
        open={novoEventoOpen}
        defaultData={novoEventoData}
        onClose={() => setNovoEventoOpen(false)}
        onSave={handleSaveEvento}
      />
    </div>
  )
}
