'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getInitials, getDisplayName, getAvatarTone } from '@/utils/profile'
import { useProfiles } from '@/hooks/useProfiles'
import { useWorkloadByAssignee } from '../hooks/useDashboardStats'
import { Users } from 'lucide-react'

const PROCESSOS_WORKFLOW = 'wf-processos'
const NEGOCIACAO_WORKFLOW = 'wf-negociacao'

export function AdvogadosCard() {
  const { data: profiles = [], isLoading: loadingProfiles } = useProfiles()
  const { data: workload, isLoading: loadingWorkload } = useWorkloadByAssignee()
  const isLoading = loadingProfiles || loadingWorkload

  // Every profile shows up, including those with no cases assigned — an empty
  // row is meaningful information about how work is spread.
  const stats = profiles
    .map((profile) => {
      const entry = workload?.[profile.id]
      return {
        profile,
        total: entry?.total ?? 0,
        processos: entry?.byWorkflow[PROCESSOS_WORKFLOW] ?? 0,
        negociacao: entry?.byWorkflow[NEGOCIACAO_WORKFLOW] ?? 0,
      }
    })
    .sort((a, b) => b.total - a.total)

  const maxTotal = Math.max(...stats.map((s) => s.total), 1)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Users className="h-4 w-4 text-accent-foreground" />
          Carga por Advogado
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading &&
          Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}

        {!isLoading && stats.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum advogado cadastrado.
          </p>
        )}

        {!isLoading &&
          stats.map(({ profile, total, processos, negociacao }) => {
            const nome = getDisplayName(profile.full_name)
            const progresso = Math.round((total / maxTotal) * 100)

            return (
              <div key={profile.id} className="space-y-2">
                {/* Header do advogado */}
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold',
                      getAvatarTone(profile.id)
                    )}
                  >
                    {getInitials(nome)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-none truncate">{nome}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {profile.oab_number ? `OAB ${profile.oab_number}` : '—'}
                    </p>
                  </div>
                  <span className="text-base font-bold tabular-nums">{total}</span>
                </div>

                {/* Barra de progresso */}
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent-foreground transition-all duration-500"
                    style={{ width: `${progresso}%` }}
                  />
                </div>

                {/* Breakdown de status */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full bg-info" />
                    <span className="text-xs text-muted-foreground">{processos} em processo</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full bg-chart-2" />
                    <span className="text-xs text-muted-foreground">
                      {negociacao} em negociação
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
      </CardContent>
    </Card>
  )
}
