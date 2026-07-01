'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  CASOS,
  AREAS_JURIDICAS,
  WORKFLOWS,
  type Cliente,
  type Caso,
  type TimelineItem,
} from '@/data/mock'
import { formatDate, formatRelative } from '@/utils/date'
import {
  MapPin,
  Mail,
  Phone,
  FileText,
  User,
  Building2,
  Scale,
  Gavel,
  MessageSquare,
  MoveRight,
  CheckCircle2,
  Handshake,
  Send,
  PlusCircle,
  Activity,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import type { TimelineItem as TLItem } from '@/data/mock'

interface ClienteDetailModalProps {
  cliente: Cliente | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

type TipoAtividade = TLItem['tipo']

const TIMELINE_CONFIG: Record<
  TipoAtividade,
  { icon: React.ElementType; color: string; bg: string }
> = {
  caso_criado: { icon: PlusCircle, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  cliente_atualizado: { icon: Activity, color: 'text-blue-700', bg: 'bg-blue-100' },
  documento_anexado: { icon: FileText, color: 'text-slate-700', bg: 'bg-slate-100' },
  comentario: { icon: MessageSquare, color: 'text-violet-700', bg: 'bg-violet-100' },
  audiencia_criada: { icon: Gavel, color: 'text-blue-700', bg: 'bg-blue-100' },
  prazo_criado: { icon: Scale, color: 'text-amber-700', bg: 'bg-amber-100' },
  tarefa_criada: { icon: CheckCircle2, color: 'text-teal-700', bg: 'bg-teal-100' },
  tarefa_concluida: { icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  mudanca_coluna: { icon: MoveRight, color: 'text-violet-700', bg: 'bg-violet-100' },
  mudanca_workflow: { icon: MoveRight, color: 'text-indigo-700', bg: 'bg-indigo-100' },
  movimentacao_processo: { icon: Scale, color: 'text-blue-700', bg: 'bg-blue-100' },
  peticao_enviada: { icon: Send, color: 'text-cyan-700', bg: 'bg-cyan-100' },
  acordo_proposto: { icon: Handshake, color: 'text-emerald-700', bg: 'bg-emerald-100' },
}

function getWorkflowNome(workflowId: string): string {
  return WORKFLOWS.find((w) => w.id === workflowId)?.nome ?? workflowId
}

function getColunaNome(workflowId: string, colunaId: string): string {
  const wf = WORKFLOWS.find((w) => w.id === workflowId)
  return wf?.colunas.find((c) => c.id === colunaId)?.nome ?? colunaId
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
  }).format(value)
}

// ── Aba: Resumo ───────────────────────────────────────────────

function AbaResumo({ cliente }: { cliente: Cliente }) {
  const TipoIcon = cliente.tipo === 'pj' ? Building2 : User

  return (
    <div className="space-y-4 pt-2">
      {/* Dados pessoais */}
      <section className="rounded-lg border p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Dados pessoais
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-2">
            <TipoIcon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Nome</p>
              <p className="text-sm font-medium">{cliente.nome}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">
                {cliente.tipo === 'pj' ? 'CNPJ' : 'CPF'}
              </p>
              <p className="text-sm font-medium tabular-nums">{cliente.cpfCnpj}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Contato */}
      <section className="rounded-lg border p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Contato
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-2">
            <Phone className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Telefone</p>
              <p className="text-sm font-medium">{cliente.telefone}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Mail className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm font-medium break-all">{cliente.email}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Endereço */}
      <section className="rounded-lg border p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Endereço
        </h3>
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-sm">
            {cliente.endereco.rua}, {cliente.endereco.numero} — {cliente.endereco.bairro},{' '}
            {cliente.endereco.cidade}/{cliente.endereco.estado} · CEP {cliente.endereco.cep}
          </p>
        </div>
      </section>

      {/* Observações */}
      {cliente.observacoes && (
        <section className="rounded-lg border p-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Observações
          </h3>
          <p className="text-sm text-foreground/80 leading-relaxed">{cliente.observacoes}</p>
        </section>
      )}
    </div>
  )
}

// ── Aba: Casos ───────────────────────────────────────────────

function AbaCasos({ casos }: { casos: Caso[] }) {
  if (casos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Scale className="h-8 w-8 text-muted-foreground mb-3" />
        <p className="text-sm font-medium">Nenhum caso encontrado</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 pt-2">
      {casos.map((caso) => {
        const area = AREAS_JURIDICAS[caso.areaJuridica]
        return (
          <div key={caso.id} className="rounded-lg border p-4 space-y-2 hover:bg-muted/30 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium',
                      area.bg,
                      area.color
                    )}
                  >
                    {area.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {getWorkflowNome(caso.workflowId)}
                  </span>
                </div>
                <p className="text-sm font-medium mt-1">
                  Caso #{caso.id} — {getColunaNome(caso.workflowId, caso.colunaId)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Adv.: {caso.advogadoNome}</span>
              <span>Atualizado {formatRelative(caso.ultimaAtualizacao)}</span>
            </div>
            {caso.numeroCNJ && (
              <p className="text-xs text-muted-foreground font-mono">
                CNJ: {caso.numeroCNJ}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Aba: Timeline ─────────────────────────────────────────────

interface TimelineEntry {
  item: TimelineItem
  casoId: string
}

function AbaTimeline({ casos }: { casos: Caso[] }) {
  const todos: TimelineEntry[] = casos.flatMap((caso) =>
    caso.timeline.map((item) => ({ item, casoId: caso.id }))
  )

  const ordenados = [...todos].sort(
    (a, b) => new Date(b.item.data).getTime() - new Date(a.item.data).getTime()
  )

  if (ordenados.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Activity className="h-8 w-8 text-muted-foreground mb-3" />
        <p className="text-sm font-medium">Nenhuma atividade registrada</p>
      </div>
    )
  }

  return (
    <div className="space-y-0 pt-2">
      {ordenados.map(({ item, casoId }, index) => {
        const config = TIMELINE_CONFIG[item.tipo] ?? {
          icon: Activity,
          color: 'text-slate-700',
          bg: 'bg-slate-100',
        }
        const IconeTL = config.icon
        const isLast = index === ordenados.length - 1

        return (
          <div key={item.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                  config.bg
                )}
              >
                <IconeTL className={cn('h-3 w-3', config.color)} />
              </div>
              {!isLast && <div className="mt-1 w-px flex-1 bg-border min-h-[16px]" />}
            </div>
            <div className={cn('flex-1 min-w-0 pb-3', isLast && 'pb-0')}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-snug">{item.titulo}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {item.descricao}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded-full text-white text-[9px] font-bold',
                        item.autorCor
                      )}
                    >
                      {item.autorIniciais}
                    </div>
                    <span className="text-xs text-muted-foreground">{item.autor}</span>
                    <span className="text-xs text-muted-foreground/50">·</span>
                    <span className="text-xs text-muted-foreground/60">Caso #{casoId}</span>
                  </div>
                </div>
                <time className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  {formatRelative(item.data)}
                </time>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Aba: Financeiro ──────────────────────────────────────────

function AbaFinanceiro({ casos }: { casos: Caso[] }) {
  const todas = casos.flatMap((c) => c.financeiro)

  const totalReceitas = todas.filter((f) => f.tipo === 'receita' && f.status === 'pago')
    .reduce((s, f) => s + f.valor, 0)
  const totalPendente = todas.filter((f) => f.tipo === 'receita' && f.status === 'pendente')
    .reduce((s, f) => s + f.valor, 0)
  const totalDespesas = todas.filter((f) => f.tipo === 'despesa')
    .reduce((s, f) => s + f.valor, 0)

  const STATUS_LABEL: Record<string, { label: string; class: string }> = {
    pago: { label: 'Pago', class: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    pendente: { label: 'Pendente', class: 'text-amber-700 bg-amber-50 border-amber-200' },
    atrasado: { label: 'Atrasado', class: 'text-red-700 bg-red-50 border-red-200' },
  }

  return (
    <div className="space-y-4 pt-2">
      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingUp className="h-3 w-3 text-emerald-600" />
            <span className="text-xs text-emerald-700 font-medium">Recebido</span>
          </div>
          <p className="text-lg font-bold text-emerald-700">{formatBRL(totalReceitas)}</p>
        </div>
        <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-center">
          <p className="text-xs text-amber-700 font-medium mb-1">A receber</p>
          <p className="text-lg font-bold text-amber-700">{formatBRL(totalPendente)}</p>
        </div>
        <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingDown className="h-3 w-3 text-red-600" />
            <span className="text-xs text-red-700 font-medium">Despesas</span>
          </div>
          <p className="text-lg font-bold text-red-600">{formatBRL(totalDespesas)}</p>
        </div>
      </div>

      {/* Lista detalhada */}
      {todas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Movimentações
          </h3>
          {todas.map((mov) => {
            const statusCfg = STATUS_LABEL[mov.status] ?? { label: mov.status, class: '' }
            return (
              <div
                key={mov.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-snug">{mov.descricao}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Vencimento: {formatDate(mov.vencimento)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-medium',
                      statusCfg.class
                    )}
                  >
                    {statusCfg.label}
                  </span>
                  <span
                    className={cn(
                      'text-sm font-semibold tabular-nums',
                      mov.tipo === 'receita' ? 'text-emerald-700' : 'text-red-600'
                    )}
                  >
                    {mov.tipo === 'despesa' ? '-' : ''}
                    {formatBRL(mov.valor)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Modal principal ──────────────────────────────────────────

export function ClienteDetailModal({ cliente, open, onOpenChange }: ClienteDetailModalProps) {
  if (!cliente) return null

  const casosDoCliente = CASOS.filter((c) => c.clienteId === cliente.id)
  const area = AREAS_JURIDICAS[cliente.areaJuridica]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-lg font-bold text-muted-foreground">
              {cliente.nome[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold leading-snug">
                {cliente.nome}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {cliente.tipo === 'pj' ? 'Pessoa Jurídica' : 'Pessoa Física'}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium',
                    area.bg,
                    area.color
                  )}
                >
                  {area.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {cliente.casosAtivos} ativo{cliente.casosAtivos !== 1 ? 's' : ''} ·{' '}
                  {cliente.totalCasos} total
                </span>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-4 px-4">
          <Tabs defaultValue="resumo">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="resumo" className="flex-1">Resumo</TabsTrigger>
              <TabsTrigger value="casos" className="flex-1">
                Casos ({casosDoCliente.length})
              </TabsTrigger>
              <TabsTrigger value="timeline" className="flex-1">Timeline</TabsTrigger>
              <TabsTrigger value="financeiro" className="flex-1">Financeiro</TabsTrigger>
            </TabsList>

            <TabsContent value="resumo">
              <AbaResumo cliente={cliente} />
            </TabsContent>

            <TabsContent value="casos">
              <AbaCasos casos={casosDoCliente} />
            </TabsContent>

            <TabsContent value="timeline">
              <AbaTimeline casos={casosDoCliente} />
            </TabsContent>

            <TabsContent value="financeiro">
              <AbaFinanceiro casos={casosDoCliente} />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
