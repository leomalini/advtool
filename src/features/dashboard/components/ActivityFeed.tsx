'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { useRecentActivities } from '../hooks/useDashboardStats'
import { ACTIVITY_LABELS } from '@/types/activity.types'
import { formatRelative } from '@/utils/date'

export function ActivityFeed() {
  const { data: activities, isLoading } = useRecentActivities()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Atividades Recentes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))
          : activities?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma atividade ainda.
              </p>
            )}
        {activities?.map((activity) => {
          const initials =
            activity.actor?.full_name
              ?.split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')
              .toUpperCase() ?? '??'

          return (
            <div key={activity.id} className="flex items-start gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <span className="font-medium">{activity.actor?.full_name}</span>{' '}
                  {ACTIVITY_LABELS[activity.type]}{' '}
                  <span className="font-medium">"{activity.entity_title}"</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatRelative(activity.created_at)}
                </p>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
