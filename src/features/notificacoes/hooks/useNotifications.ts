'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
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
  list: (limit: number, after: string | null) => ['notifications', 'list', limit, after ?? '-'] as const,
  unreadCount: () => ['notifications', 'unread-count'] as const,
}

export function useNotifications(limit = 20, after: string | null = null) {
  return useQuery({
    queryKey: notificationKeys.list(limit, after),
    queryFn: () => getRecentNotifications(limit, after),
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

// ── "Limpar" ─────────────────────────────────────────────────────────────────
//
// Limpar esvazia o painel sem apagar nada: `notifications` não tem policy de
// delete (quem escreve é o servidor) e o `read_at` é do escritório, não da
// pessoa. O que se guarda é "até qual aviso eu já limpei", por usuário, neste
// navegador — o painel passa a mostrar só o que chegou depois.

const CLEARED_KEY_PREFIX = 'advtool:avisos:limpos-ate:'
const clearedListeners = new Set<() => void>()

function subscribeCleared(listener: () => void) {
  clearedListeners.add(listener)
  // Outra aba limpou: o evento `storage` só chega às OUTRAS abas.
  window.addEventListener('storage', listener)
  return () => {
    clearedListeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function readCleared(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Instante do último aviso limpo por este usuário (ou `null`) e como limpar. */
export function useNotificationsClearedAfter() {
  const { user } = useAuth()
  const key = user ? `${CLEARED_KEY_PREFIX}${user.id}` : null

  const clearedAfter = useSyncExternalStore(
    subscribeCleared,
    () => (key ? readCleared(key) : null),
    // No servidor não há localStorage: o painel começa sem filtro.
    () => null,
  )

  const clearUntil = useCallback(
    (createdAt: string) => {
      if (!key) return
      try {
        localStorage.setItem(key, createdAt)
      } catch {
        // Armazenamento bloqueado (aba anônima, cota): limpa só nesta sessão
        // de tela — o painel ainda vai ser esvaziado pela lista abaixo.
      }
      clearedListeners.forEach((listener) => listener())
    },
    [key],
  )

  return { clearedAfter, clearUntil }
}

// ── Realtime ─────────────────────────────────────────────────────────────────

/** Eventos que chegam dentro desta janela viram um aviso só. */
const BURST_WINDOW_MS = 1000

/**
 * Assina a chegada de avisos e reage na hora.
 *
 * Realtime, e não polling: o webhook existe justamente para a intimação chegar
 * sozinha, e um intervalo de 30 segundos por aba aberta seria requisição
 * constante para avisar tarde. O Realtime aplica a mesma RLS da consulta, então
 * cada sessão só é acordada pelo que já poderia ler.
 *
 * Em lote: uma sincronização grava uma linha por publicação numa só instrução,
 * e o Realtime entrega um evento por linha. Quarenta intimações eram quarenta
 * toasts em fila e cento e vinte recargas de lista. Agora o que chega junto é
 * agrupado — uma recarga e um toast só ("40 novas publicações").
 *
 * A invalidação alcança publicações e processos porque é lá que o dado novo
 * apareceu — o aviso é só o sinal.
 */
export function useRealtimeNotifications(): void {
  const queryClient = useQueryClient()
  const router = useRouter()

  useEffect(() => {
    let pending: Notification[] = []
    let timer: ReturnType<typeof setTimeout> | null = null

    function flush() {
      timer = null
      const batch = pending
      pending = []

      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
      queryClient.invalidateQueries({ queryKey: publicationKeys.all })
      queryClient.invalidateQueries({ queryKey: legalProcessKeys.all })

      if (batch.length === 1) {
        const [notification] = batch
        toast(notification.title, {
          description: notification.body ?? undefined,
          action: notification.link
            ? { label: 'Abrir', onClick: () => router.push(notification.link as string) }
            : undefined,
        })
        return
      }

      const allPublications = batch.every((notification) => notification.kind === 'publicacao_nova')
      toast(allPublications ? `${batch.length} novas publicações` : `${batch.length} novos avisos`, {
        description: 'A lista completa está no sino de avisos.',
        action: allPublications
          ? { label: 'Ver', onClick: () => router.push('/publicacoes') }
          : undefined,
      })
    }

    const channel = supabase
      .channel('notifications-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        ({ new: row }) => {
          pending.push(row as Notification)
          if (!timer) timer = setTimeout(flush, BURST_WINDOW_MS)
        },
      )
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [queryClient, router])
}
