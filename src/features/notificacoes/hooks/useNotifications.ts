'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { publicationKeys } from '@/features/publicacoes/hooks/usePublications'
import { legalProcessKeys } from '@/features/processos/hooks/useLegalProcesses'
import {
  getRecentNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/notifications.service'
import type { Notification } from '@/types/notification.types'

const supabase = createClient()

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (limit: number) => ['notifications', 'list', limit] as const,
  unreadCount: () => ['notifications', 'unread-count'] as const,
}

export function useNotifications(limit = 20) {
  return useQuery({
    queryKey: notificationKeys.list(limit),
    queryFn: () => getRecentNotifications(limit),
  })
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: countUnreadNotifications,
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
    onError: () => toast.error('Não foi possível marcar os avisos como lidos.'),
  })
}

/**
 * Assina a chegada de avisos e reage na hora.
 *
 * Realtime, e não polling: o webhook existe justamente para a intimação chegar
 * sozinha, e um intervalo de 30 segundos por aba aberta seria requisição
 * constante para avisar tarde. O Realtime aplica a mesma RLS da consulta, então
 * cada sessão só é acordada pelo que já poderia ler.
 *
 * A invalidação alcança publicações e processos porque é lá que o dado novo
 * apareceu — o aviso é só o sinal.
 */
export function useRealtimeNotifications(): void {
  const queryClient = useQueryClient()
  const router = useRouter()

  useEffect(() => {
    const channel = supabase
      .channel('notifications-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        ({ new: row }) => {
          const notification = row as Notification

          queryClient.invalidateQueries({ queryKey: notificationKeys.all })
          queryClient.invalidateQueries({ queryKey: publicationKeys.all })
          queryClient.invalidateQueries({ queryKey: legalProcessKeys.all })

          toast(notification.title, {
            description: notification.body ?? undefined,
            action: notification.link
              ? { label: 'Abrir', onClick: () => router.push(notification.link as string) }
              : undefined,
          })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient, router])
}
