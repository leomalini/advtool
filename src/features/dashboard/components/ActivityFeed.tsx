'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ULTIMAS_ATIVIDADES } from '@/data/mock'
import { formatRelative } from '@/utils/date'
import type { TimelineItem } from '@/data/mock'
import {
  Activity,
  FileText,
  Gavel,
  MessageSquare,
  MoveRight,
  CheckCircle2,
  Handshake,
  Send,
  Scale,
  PlusCircle,
} from 'lucide-react'

type AtividadeTipo = (typeof ULTIMAS_ATIVIDADES)[number]['tipo']

const TIPO_CONFIG: Record<
  AtividadeTipo | TimelineItem['tipo'],
  { icon: React.ElementType; color: string; bg: string; label: string }
> = {
  caso_criado: { icon: PlusCircle, color: 'text-emerald-700', bg: 'bg-emerald-100', label: 'Caso criado' },
  cliente_atualizado: { icon: Activity, color: 'text-blue-700', bg: 'bg-blue-100', label: 'Cliente atualizado' },
  documento_anexado: { icon: FileText, color: 'text-slate-700', bg: 'bg-slate-100', label: 'Documento' },
  comentario: { icon: MessageSquare, color: 'text-violet-700', bg: 'bg-violet-100', label: 'Comentário' },
  audiencia_criada: { icon: Gavel, color: 'text-blue-700', bg: 'bg-blue-100', label: 'Audiência' },
  prazo_criado: { icon: Scale, color: 'text-amber-700', bg: 'bg-amber-100', label: 'Prazo' },
  tarefa_criada: { icon: CheckCircle2, color: 'text-teal-700', bg: 'bg-teal-100', label: 'Tarefa' },
  tarefa_concluida: { icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-100', label: 'Concluído' },
  mudanca_coluna: { icon: MoveRight, color: 'text-violet-700', bg: 'bg-violet-100', label: 'Movido' },
  mudanca_workflow: { icon: MoveRight, color: 'text-indigo-700', bg: 'bg-indigo-100', label: 'Workflow' },
  movimentacao_processo: { icon: Scale, color: 'text-blue-700', bg: 'bg-blue-100', label: 'Processo' },
  peticao_enviada: { icon: Send, color: 'text-cyan-700', bg: 'bg-cyan-100', label: 'Petição' },
  acordo_proposto: { icon: Handshake, color: 'text-emerald-700', bg: 'bg-emerald-100', label: 'Acordo' },
}

export function ActivityFeed() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Activity className="h-4 w-4 text-slate-500" />
          Últimas Atividades
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-0">
          {ULTIMAS_ATIVIDADES.map((atividade, index) => {
            const config = TIPO_CONFIG[atividade.tipo] ?? {
              icon: Activity,
              color: 'text-slate-700',
              bg: 'bg-slate-100',
              label: atividade.tipo,
            }
            const IconeAtividade = config.icon
            const isLast = index === ULTIMAS_ATIVIDADES.length - 1

            return (
              <div key={atividade.id} className="flex gap-3">
                {/* Ícone + linha vertical */}
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      config.bg
                    )}
                  >
                    <IconeAtividade className={cn('h-3.5 w-3.5', config.color)} />
                  </div>
                  {!isLast && <div className="mt-1 w-px flex-1 bg-border min-h-[20px]" />}
                </div>

                {/* Conteúdo */}
                <div className={cn('flex-1 min-w-0 pb-4', isLast && 'pb-0')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* Avatar + autor */}
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white text-[10px] font-bold',
                            atividade.autorCor
                          )}
                        >
                          {atividade.autorIniciais}
                        </div>
                        <span className="text-xs font-medium text-foreground">
                          {atividade.autor}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-1.5 py-0 text-xs font-medium',
                            config.bg,
                            config.color
                          )}
                        >
                          {config.label}
                        </span>
                      </div>
                      <p className="text-sm text-foreground leading-snug">{atividade.descricao}</p>
                      <p className="text-xs text-muted-foreground/80 mt-0.5 font-medium">
                        {atividade.caso}
                      </p>
                    </div>
                    <time className="text-xs text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
                      {formatRelative(atividade.data)}
                    </time>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
