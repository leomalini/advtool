'use client'

import { useState } from 'react'
import {
  X,
  Sparkles,
  ArrowRight,
  FileText,
  Gavel,
  Clock,
  CheckSquare,
  CheckCircle2,
  Activity,
  Send,
  MessageCircle,
  Handshake,
  Download,
  Upload,
  Plus,
  Calendar,
  MapPin,
  User,
  Phone,
  Mail,
  Building2,
  Scale,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  AREAS_JURIDICAS,
  ETIQUETAS,
  CLIENTES,
  WORKFLOWS,
} from '@/data/mock'
import type {
  Caso,
  TimelineItem,
  Tarefa,
  Evento,
  Documento,
  MovimentacaoFinanceira,
} from '@/data/mock'

// ─── Types ───────────────────────────────────────────────────────────────────

type ModalTab =
  | 'resumo'
  | 'timeline'
  | 'agenda'
  | 'tarefas'
  | 'documentos'
  | 'financeiro'
  | 'comentarios'
  | 'cliente'
  | 'processo'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffMinutes = Math.floor(diffMs / (1000 * 60))

  if (diffMinutes < 1) return 'agora'
  if (diffMinutes < 60) return `há ${diffMinutes}min`
  if (diffHours < 24) return `há ${diffHours}h`
  if (diffDays === 1) return 'ontem'
  if (diffDays < 30) return `há ${diffDays} dias`
  const diffMonths = Math.floor(diffDays / 30)
  return diffMonths === 1 ? 'há 1 mês' : `há ${diffMonths} meses`
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Timeline Icons ───────────────────────────────────────────────────────────

function TimelineIcon({ tipo }: { tipo: TimelineItem['tipo'] }) {
  const map: Record<TimelineItem['tipo'], { icon: React.ReactNode; bg: string }> = {
    caso_criado: { icon: <Sparkles className="w-3.5 h-3.5" />, bg: 'bg-violet-500' },
    mudanca_coluna: { icon: <ArrowRight className="w-3.5 h-3.5" />, bg: 'bg-blue-500' },
    mudanca_workflow: { icon: <ArrowRight className="w-3.5 h-3.5" />, bg: 'bg-indigo-500' },
    documento_anexado: { icon: <FileText className="w-3.5 h-3.5" />, bg: 'bg-amber-500' },
    audiencia_criada: { icon: <Gavel className="w-3.5 h-3.5" />, bg: 'bg-red-500' },
    prazo_criado: { icon: <Clock className="w-3.5 h-3.5" />, bg: 'bg-orange-500' },
    tarefa_criada: { icon: <CheckSquare className="w-3.5 h-3.5" />, bg: 'bg-cyan-500' },
    tarefa_concluida: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, bg: 'bg-emerald-500' },
    movimentacao_processo: { icon: <Activity className="w-3.5 h-3.5" />, bg: 'bg-teal-500' },
    peticao_enviada: { icon: <Send className="w-3.5 h-3.5" />, bg: 'bg-purple-500' },
    comentario: { icon: <MessageCircle className="w-3.5 h-3.5" />, bg: 'bg-zinc-500' },
    acordo_proposto: { icon: <Handshake className="w-3.5 h-3.5" />, bg: 'bg-green-500' },
    cliente_atualizado: { icon: <User className="w-3.5 h-3.5" />, bg: 'bg-pink-500' },
  }
  const entry = map[tipo]
  return (
    <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-white flex-shrink-0', entry.bg)}>
      {entry.icon}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AvatarInitials({ iniciais, cor, size = 'sm' }: { iniciais: string; cor: string; size?: 'sm' | 'md' }) {
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0',
        cor,
        size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'
      )}
    >
      {iniciais}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
      {children}
    </p>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <p className="text-sm text-zinc-800">{value}</p>
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS: { id: ModalTab; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'tarefas', label: 'Tarefas' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'comentarios', label: 'Comentários' },
  { id: 'cliente', label: 'Cliente' },
  { id: 'processo', label: 'Processo' },
]

// ─── Tab Contents ─────────────────────────────────────────────────────────────

function TabResumo({ caso }: { caso: Caso }) {
  const area = AREAS_JURIDICAS[caso.areaJuridica]
  const workflow = WORKFLOWS.find((w) => w.id === caso.workflowId)
  const coluna = workflow?.colunas.find((c) => c.id === caso.colunaId)

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Left: Cliente / Caso */}
      <div className="space-y-5">
        <div>
          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
            Informações do Caso
          </h4>
          <div className="space-y-3">
            <InfoRow label="Cliente" value={caso.clienteNome} />
            <InfoRow label="Telefone" value={caso.clienteTelefone} />
            <InfoRow label="E-mail" value={caso.clienteEmail} />
            <div>
              <SectionLabel>Área Jurídica</SectionLabel>
              <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', area.bg, area.color)}>
                {area.label}
              </span>
            </div>
            <InfoRow label="Advogado Responsável" value={caso.advogadoNome} />
            <div>
              <SectionLabel>Workflow / Etapa</SectionLabel>
              <p className="text-sm text-zinc-800">
                {workflow?.nome} <span className="text-zinc-400">›</span> {coluna?.nome}
              </p>
            </div>
            {caso.observacoes && (
              <div>
                <SectionLabel>Observações</SectionLabel>
                <p className="text-sm text-zinc-600 leading-relaxed">{caso.observacoes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Processo + Compromissos */}
      <div className="space-y-5">
        <div>
          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
            Dados Processuais
          </h4>
          <div className="space-y-3">
            {caso.numeroCNJ ? (
              <InfoRow label="Número CNJ" value={caso.numeroCNJ} />
            ) : (
              <p className="text-sm text-zinc-400 italic">Sem processo judicial vinculado</p>
            )}
            <InfoRow label="Tribunal" value={caso.tribunal} />
            <InfoRow label="Vara" value={caso.vara} />
          </div>
        </div>

        {caso.eventos.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
              Próximos Compromissos
            </h4>
            <div className="space-y-2">
              {caso.eventos.slice(0, 3).map((ev) => (
                <div key={ev.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-zinc-50 border border-zinc-100">
                  <Calendar className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-800 truncate">{ev.titulo}</p>
                    <p className="text-xs text-zinc-500">
                      {formatDate(ev.data)} às {ev.hora}
                      {ev.local && ` · ${ev.local}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TabTimeline({ caso }: { caso: Caso }) {
  const sorted = [...caso.timeline].sort(
    (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
  )

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
        <Activity className="w-8 h-8 mb-2" />
        <p className="text-sm">Nenhum evento na timeline</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {sorted.map((item, idx) => (
        <div key={item.id} className="flex gap-3 group">
          <div className="flex flex-col items-center">
            <TimelineIcon tipo={item.tipo} />
            {idx < sorted.length - 1 && (
              <div className="w-px flex-1 bg-zinc-200 mt-1" />
            )}
          </div>
          <div className="pb-5 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-semibold text-zinc-800">{item.titulo}</p>
              <span className="text-xs text-zinc-400">{formatRelativeDate(item.data)}</span>
            </div>
            <p className="text-sm text-zinc-600 leading-relaxed">{item.descricao}</p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <AvatarInitials iniciais={item.autorIniciais} cor={item.autorCor} />
              <span className="text-xs text-zinc-500">{item.autor}</span>
              <span className="text-xs text-zinc-400">· {formatDateTime(item.data)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const EVENTO_COLORS: Record<Evento['tipo'], { bg: string; text: string; label: string }> = {
  audiencia: { bg: 'bg-red-50', text: 'text-red-700', label: 'Audiência' },
  reuniao: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Reunião' },
  prazo: { bg: 'bg-orange-50', text: 'text-orange-700', label: 'Prazo' },
  compromisso: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Compromisso' },
}

function TabAgenda({ caso }: { caso: Caso }) {
  if (caso.eventos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
        <Calendar className="w-8 h-8 mb-2" />
        <p className="text-sm">Sem compromissos agendados</p>
        <button className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-700 transition-colors">
          <Plus className="w-4 h-4" />
          Adicionar evento
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors">
          <Plus className="w-3.5 h-3.5" />
          Adicionar evento
        </button>
      </div>

      {caso.eventos.map((ev) => {
        const style = EVENTO_COLORS[ev.tipo]
        return (
          <div
            key={ev.id}
            className="flex gap-4 p-4 rounded-xl border border-zinc-100 bg-white hover:shadow-sm transition-all"
          >
            <div className={cn('w-1 rounded-full self-stretch', style.bg.replace('bg-', 'bg-'))}
              style={{ backgroundColor: ev.tipo === 'audiencia' ? '#ef4444' : ev.tipo === 'reuniao' ? '#3b82f6' : ev.tipo === 'prazo' ? '#f97316' : '#10b981' }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-800">{ev.titulo}</p>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {ev.isUrgente && (
                    <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                      Urgente
                    </span>
                  )}
                  {ev.isFatalPrazo && (
                    <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                      Prazo Fatal
                    </span>
                  )}
                  <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', style.bg, style.text)}>
                    {style.label}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(ev.data)} às {ev.hora}
                  {ev.horaFim && ` – ${ev.horaFim}`}
                </span>
                {ev.local && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {ev.local}
                  </span>
                )}
              </div>
              {ev.descricao && (
                <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{ev.descricao}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const PRIORIDADE_BADGE: Record<Tarefa['prioridade'], { bg: string; text: string; label: string }> = {
  baixa: { bg: 'bg-zinc-100', text: 'text-zinc-600', label: 'Baixa' },
  media: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Média' },
  alta: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Alta' },
  urgente: { bg: 'bg-red-100', text: 'text-red-700', label: 'Urgente' },
}

function TabTarefas({ caso }: { caso: Caso }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (caso.tarefas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
        <CheckSquare className="w-8 h-8 mb-2" />
        <p className="text-sm">Sem tarefas cadastradas</p>
        <button className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-700 transition-colors">
          <Plus className="w-4 h-4" />
          Nova tarefa
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors">
          <Plus className="w-3.5 h-3.5" />
          Nova tarefa
        </button>
      </div>

      {caso.tarefas.map((tarefa) => {
        const prioridade = PRIORIDADE_BADGE[tarefa.prioridade]
        const concluidos = tarefa.checklist.filter((c) => c.concluido).length
        const total = tarefa.checklist.length
        const isExpanded = expanded === tarefa.id

        return (
          <div key={tarefa.id} className="rounded-xl border border-zinc-100 bg-white overflow-hidden">
            <div className="p-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  readOnly
                  checked={tarefa.status === 'concluida'}
                  className="mt-0.5 w-4 h-4 rounded border-zinc-300 accent-zinc-900 flex-shrink-0 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn('text-sm font-medium', tarefa.status === 'concluida' && 'line-through text-zinc-400')}>
                      {tarefa.titulo}
                    </p>
                    <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0', prioridade.bg, prioridade.text)}>
                      {prioridade.label}
                    </span>
                  </div>
                  {tarefa.descricao && (
                    <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{tarefa.descricao}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1">
                      <AvatarInitials iniciais={tarefa.responsavelIniciais} cor="bg-zinc-500" />
                      <span className="text-xs text-zinc-500">{tarefa.responsavel}</span>
                    </div>
                    <span className="flex items-center gap-1 text-xs text-zinc-400">
                      <Clock className="w-3 h-3" />
                      {formatDate(tarefa.prazo)}
                    </span>
                    {total > 0 && (
                      <button
                        onClick={() => setExpanded(isExpanded ? null : tarefa.id)}
                        className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
                      >
                        Checklist {concluidos}/{total}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {isExpanded && total > 0 && (
              <div className="border-t border-zinc-100 px-4 py-3 bg-zinc-50 space-y-2">
                {tarefa.checklist.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      readOnly
                      checked={item.concluido}
                      className="w-4 h-4 rounded border-zinc-300 accent-zinc-900"
                    />
                    <span className={cn('text-sm', item.concluido && 'line-through text-zinc-400')}>
                      {item.texto}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const DOC_CATEGORIA_LABEL: Record<Documento['categoria'], string> = {
  peticao: 'Petição',
  contrato: 'Contrato',
  procuracao: 'Procuração',
  decisao: 'Decisão',
  outros: 'Outros',
}

function TabDocumentos({ caso }: { caso: Caso }) {
  if (caso.documentos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
        <FileText className="w-8 h-8 mb-2" />
        <p className="text-sm font-medium">Nenhum documento anexado</p>
        <p className="text-xs mt-1">Faça upload de documentos relacionados a este caso</p>
        <button className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-700 transition-colors">
          <Upload className="w-4 h-4" />
          Enviar documento
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors">
          <Upload className="w-3.5 h-3.5" />
          Enviar documento
        </button>
      </div>

      <div className="space-y-2">
        {caso.documentos.map((doc) => (
          <div key={doc.id} className="flex items-center gap-4 p-3 rounded-xl border border-zinc-100 bg-white hover:shadow-sm transition-all group">
            <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-zinc-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-800 truncate">{doc.nome}</p>
              <p className="text-xs text-zinc-400">
                {DOC_CATEGORIA_LABEL[doc.categoria]} · {doc.tamanho} · {formatDate(doc.data)} · por {doc.uploadPor}
              </p>
            </div>
            <button className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg hover:bg-zinc-100">
              <Download className="w-4 h-4 text-zinc-500" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function TabFinanceiro({ caso }: { caso: Caso }) {
  const receitas = caso.financeiro.filter((f) => f.tipo === 'receita')
  const despesas = caso.financeiro.filter((f) => f.tipo === 'despesa')
  const totalReceitas = receitas.reduce((s, f) => s + f.valor, 0)
  const totalDespesas = despesas.reduce((s, f) => s + f.valor, 0)
  const saldo = totalReceitas - totalDespesas

  const STATUS_MAP: Record<MovimentacaoFinanceira['status'], { label: string; className: string }> = {
    pago: { label: 'Pago', className: 'bg-emerald-100 text-emerald-700' },
    pendente: { label: 'Pendente', className: 'bg-amber-100 text-amber-700' },
    atrasado: { label: 'Atrasado', className: 'bg-red-100 text-red-700' },
  }

  if (caso.financeiro.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
        <Scale className="w-8 h-8 mb-2" />
        <p className="text-sm">Sem movimentações financeiras</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">Receitas</p>
          <p className="text-xl font-bold text-emerald-700">{formatCurrency(totalReceitas)}</p>
        </div>
        <div className="p-4 rounded-xl bg-red-50 border border-red-100">
          <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">Despesas</p>
          <p className="text-xl font-bold text-red-700">{formatCurrency(totalDespesas)}</p>
        </div>
        <div className={cn('p-4 rounded-xl border', saldo >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100')}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1 text-blue-600">Saldo</p>
          <p className={cn('text-xl font-bold', saldo >= 0 ? 'text-blue-700' : 'text-red-700')}>
            {formatCurrency(saldo)}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-100">
              <th className="text-left py-2.5 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Tipo</th>
              <th className="text-left py-2.5 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Descrição</th>
              <th className="text-right py-2.5 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Valor</th>
              <th className="text-left py-2.5 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Vencimento</th>
              <th className="text-left py-2.5 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            {caso.financeiro.map((mov, idx) => {
              const status = STATUS_MAP[mov.status]
              return (
                <tr key={mov.id} className={cn('border-b border-zinc-50', idx % 2 === 0 ? 'bg-white' : 'bg-zinc-50/30')}>
                  <td className="py-3 px-4">
                    <span className={cn('text-xs font-semibold', mov.tipo === 'receita' ? 'text-emerald-600' : 'text-red-600')}>
                      {mov.tipo === 'receita' ? '+ Receita' : '− Despesa'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-zinc-700">{mov.descricao}</td>
                  <td className={cn('py-3 px-4 text-right font-semibold', mov.tipo === 'receita' ? 'text-emerald-700' : 'text-red-700')}>
                    {formatCurrency(mov.valor)}
                  </td>
                  <td className="py-3 px-4 text-zinc-500 text-xs">{formatDate(mov.vencimento)}</td>
                  <td className="py-3 px-4">
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', status.className)}>
                      {status.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TabComentarios({ caso }: { caso: Caso }) {
  const comentarios = caso.timeline.filter((t) => t.tipo === 'comentario')

  return (
    <div className="space-y-4">
      {/* Input */}
      <div className="flex gap-3">
        <AvatarInitials iniciais="EU" cor="bg-zinc-500" />
        <div className="flex-1">
          <textarea
            placeholder="Escrever comentário interno..."
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 resize-none"
            readOnly
          />
          <div className="flex justify-end mt-2">
            <button className="px-4 py-1.5 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-700 transition-colors">
              Comentar
            </button>
          </div>
        </div>
      </div>

      {comentarios.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-zinc-400">
          <MessageCircle className="w-7 h-7 mb-2" />
          <p className="text-sm">Sem comentários ainda</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comentarios.map((c) => (
            <div key={c.id} className="flex gap-3">
              <AvatarInitials iniciais={c.autorIniciais} cor={c.autorCor} />
              <div className="flex-1 bg-zinc-50 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-zinc-700">{c.autor}</span>
                  <span className="text-xs text-zinc-400">{formatRelativeDate(c.data)}</span>
                </div>
                <p className="text-sm text-zinc-700">{c.descricao}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TabCliente({ caso }: { caso: Caso }) {
  const cliente = CLIENTES.find((c) => c.id === caso.clienteId)
  if (!cliente) return <p className="text-sm text-zinc-400">Cliente não encontrado</p>

  const area = AREAS_JURIDICAS[cliente.areaJuridica]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 rounded-xl bg-zinc-50 border border-zinc-100">
        <div className="w-12 h-12 rounded-full bg-violet-500 flex items-center justify-center text-white font-bold text-lg">
          {cliente.nome.split(' ').slice(0, 2).map((w) => w[0]).join('')}
        </div>
        <div>
          <p className="text-base font-bold text-zinc-900">{cliente.nome}</p>
          <p className="text-sm text-zinc-500">{cliente.tipo === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'} · {cliente.cpfCnpj}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Contato</h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-zinc-700">
              <Phone className="w-4 h-4 text-zinc-400" />
              {cliente.telefone}
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-700">
              <Mail className="w-4 h-4 text-zinc-400" />
              {cliente.email}
            </div>
            <div className="flex items-start gap-2 text-sm text-zinc-700">
              <Building2 className="w-4 h-4 text-zinc-400 mt-0.5" />
              <span>
                {cliente.endereco.rua}, {cliente.endereco.numero} — {cliente.endereco.bairro},
                {' '}{cliente.endereco.cidade}/{cliente.endereco.estado} · CEP {cliente.endereco.cep}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Área e Casos</h4>
          <div className="space-y-3">
            <div>
              <SectionLabel>Área Principal</SectionLabel>
              <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', area.bg, area.color)}>
                {area.label}
              </span>
            </div>
            <InfoRow label="Total de Casos" value={String(cliente.totalCasos)} />
            <InfoRow label="Casos Ativos" value={String(cliente.casosAtivos)} />
            <InfoRow label="Cliente desde" value={formatDate(cliente.criadoEm)} />
          </div>
        </div>
      </div>

      {cliente.observacoes && (
        <div>
          <SectionLabel>Observações</SectionLabel>
          <p className="text-sm text-zinc-600 leading-relaxed">{cliente.observacoes}</p>
        </div>
      )}
    </div>
  )
}

function TabProcesso({ caso }: { caso: Caso }) {
  const workflow = WORKFLOWS.find((w) => w.id === caso.workflowId)
  const coluna = workflow?.colunas.find((c) => c.id === caso.colunaId)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Identificação</h4>
          <div className="space-y-3">
            <InfoRow label="Número CNJ" value={caso.numeroCNJ ?? 'Não cadastrado'} />
            <InfoRow label="Tribunal" value={caso.tribunal ?? 'Não definido'} />
            <InfoRow label="Vara" value={caso.vara ?? 'Não definida'} />
            <div>
              <SectionLabel>Status Processual</SectionLabel>
              <p className="text-sm text-zinc-800">
                {workflow?.nome ?? '—'} · <span className="font-medium">{coluna?.nome ?? '—'}</span>
              </p>
            </div>
          </div>
        </div>

        {caso.partes && (
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Partes</h4>
            <div className="space-y-3">
              <InfoRow label="Requerente" value={caso.partes.requerente} />
              <InfoRow label="Requerido" value={caso.partes.requerido} />
              <InfoRow label="Advogado da parte contrária" value={caso.partes.advogadoContrario} />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-100">
          <SectionLabel>Criado em</SectionLabel>
          <p className="text-sm font-medium text-zinc-800">{formatDate(caso.criadoEm)}</p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-100">
          <SectionLabel>Última atualização</SectionLabel>
          <p className="text-sm font-medium text-zinc-800">{formatDateTime(caso.ultimaAtualizacao)}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface CasoModalProps {
  caso: Caso
  open: boolean
  onClose: () => void
}

export function CasoModal({ caso, open, onClose }: CasoModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>('resumo')

  const area = AREAS_JURIDICAS[caso.areaJuridica]
  const workflow = WORKFLOWS.find((w) => w.id === caso.workflowId)
  const coluna = workflow?.colunas.find((c) => c.id === caso.colunaId)

  const advInitials = caso.advogadoNome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-5xl"
        style={{ height: '90vh' }}
      >
        {/* ── Modal Header ── */}
        <div className="flex-shrink-0 px-6 pt-5 pb-0 border-b border-zinc-100">
          <div className="flex items-start justify-between gap-4 mb-4">
            {/* Left: Title block */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 text-xs text-zinc-400">
                <span>{workflow?.nome}</span>
                <span>›</span>
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: coluna?.cor }}
                />
                <span>{coluna?.nome}</span>
              </div>
              <h2 className="text-xl font-bold text-zinc-900 truncate">{caso.clienteNome}</h2>
              <div className="flex items-center gap-3 mt-2">
                <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', area.bg, area.color)}>
                  {area.label}
                </span>
                <div className="flex items-center gap-1.5">
                  <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold',
                    caso.advogadoId === 'adv-1' ? 'bg-violet-500' : 'bg-cyan-500'
                  )}>
                    {advInitials}
                  </div>
                  <span className="text-sm text-zinc-600">{caso.advogadoNome}</span>
                </div>
              </div>
            </div>

            {/* Right: Close */}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-all flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex gap-0 overflow-x-auto scrollbar-hide -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200',
                  activeTab === tab.id
                    ? 'border-zinc-900 text-zinc-900'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Modal Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === 'resumo' && <TabResumo caso={caso} />}
          {activeTab === 'timeline' && <TabTimeline caso={caso} />}
          {activeTab === 'agenda' && <TabAgenda caso={caso} />}
          {activeTab === 'tarefas' && <TabTarefas caso={caso} />}
          {activeTab === 'documentos' && <TabDocumentos caso={caso} />}
          {activeTab === 'financeiro' && <TabFinanceiro caso={caso} />}
          {activeTab === 'comentarios' && <TabComentarios caso={caso} />}
          {activeTab === 'cliente' && <TabCliente caso={caso} />}
          {activeTab === 'processo' && <TabProcesso caso={caso} />}
        </div>
      </div>
    </div>
  )
}
