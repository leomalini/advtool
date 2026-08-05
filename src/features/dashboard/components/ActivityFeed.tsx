'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatRelative } from '@/utils/date'
import { getInitials, getDisplayName, getAvatarTone } from '@/utils/profile'
import { ACTIVITY_LABELS } from '@/types/activity.types'
import type { ActivityType } from '@/types/activity.types'
import { useRecentActivities } from '../hooks/useDashboardStats'
import {
  Activity,
  FileText,
  MessageSquare,
  MoveRight,
  CheckCircle2,
  CalendarPlus,
  Scale,
  UserPlus,
  UserCog,
  PlusCircle,
} from 'lucide-react'

// Keyed by the ActivityType values the services actually write. The previous
// version used Portuguese slugs from the mock (`caso_criado`…) that never
// matched a real row, so every entry fell through to the generic fallback.
const TIPO_CONFIG: Record<
  ActivityType,
  { icon: React.ElementType; color: string; bg: string; label: string }
> = {
  case_created: { icon: PlusCircle, color: 'text-success', bg: 'bg-success/12', label: 'Caso' },
  case_moved: { icon: MoveRight, color: 'text-chart-2', bg: 'bg-chart-2/12', label: 'Movido' },
  case_comment: { icon: MessageSquare, color: 'text-chart-2', bg: 'bg-chart-2/12', label: 'Comentário' },
  legal_process_created: { icon: Scale, color: 'text-info', bg: 'bg-info/12', label: 'Processo' },
  client_created: { icon: UserPlus, color: 'text-success', bg: 'bg-success/12', label: 'Cliente' },
  client_updated: { icon: UserCog, color: 'text-info', bg: 'bg-info/12', label: 'Cliente' },
  task_created: { icon: CheckCircle2, color: 'text-info', bg: 'bg-info/12', label: 'Tarefa' },
  task_done: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/12', label: 'Concluído' },
  task_comment: { icon: MessageSquare, color: 'text-chart-2', bg: 'bg-chart-2/12', label: 'Comentário' },
  event_created: { icon: CalendarPlus, color: 'text-info', bg: 'bg-info/12', label: 'Agenda' },
  attachment_uploaded: { icon: FileText, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Documento' },
  financial_entry_created: { icon: Scale, color: 'text-success', bg: 'bg-success/12', label: 'Financeiro' },
  // Legacy pre-crm_items rows — kept so old feed entries stay readable.
  lead_created: { icon: PlusCircle, color: 'text-success', bg: 'bg-success/12', label: 'Caso' },
  lead_moved: { icon: MoveRight, color: 'text-chart-2', bg: 'bg-chart-2/12', label: 'Movido' },
}

const FALLBACK_CONFIG = {
  icon: Activity,
  color: 'text-muted-foreground',
  bg: 'bg-muted',
}

export function ActivityFeed() {
  const { data: atividades, isLoading } = useRecentActivities()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Últimas Atividades
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        )}

        {!isLoading && atividades?.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma atividade registrada ainda.
          </p>
        )}

        <div className="space-y-0">
          {atividades?.map((atividade, index) => {
            const config = TIPO_CONFIG[atividade.type] ?? {
              ...FALLBACK_CONFIG,
              label: atividade.type,
            }
            const IconeAtividade = config.icon
            const isLast = index === atividades.length - 1
            const autorNome = atividade.actor
              ? getDisplayName(atividade.actor.full_name)
              : 'Alguém'

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
                            getAvatarTone(atividade.actor_id)
                          )}
                        >
                          {getInitials(autorNome)}
                        </div>
                        <span className="text-xs font-medium text-foreground">{autorNome}</span>
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
                      <p className="text-sm text-foreground leading-snug">
                        {ACTIVITY_LABELS[atividade.type] ?? atividade.type}{' '}
                        <span className="font-medium">{atividade.entity_title}</span>
                      </p>
                    </div>
                    <time className="text-xs text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
                      {formatRelative(atividade.created_at)}
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
