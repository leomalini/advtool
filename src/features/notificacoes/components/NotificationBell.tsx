'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Bell, BrushCleaning, CheckCheck, Gavel, Newspaper, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  useNotifications,
  useNotificationsClearedAfter,
  useUnreadNotificationCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useRealtimeNotifications,
} from '../hooks/useNotifications'
import type { Notification, NotificationKind } from '@/types/notification.types'

/**
 * O sinal de que chegou algo novo.
 *
 * Fica no Header porque o Header está montado em toda rota do app — é onde a
 * assinatura do Realtime pode viver sem depender de a pessoa estar numa tela
 * específica. A publicação que chega por webhook precisa avisar quem está no
 * Financeiro tanto quanto quem está em Publicações.
 */

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  publicacao_nova: Newspaper,
  movimentacao_nova: Gavel,
  webhook_erro: TriangleAlert,
}

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: ptBR })
  } catch {
    return ''
  }
}

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: Notification
  onOpen: (notification: Notification) => void
}) {
  const unread = !notification.read_at
  const Icon = KIND_ICON[notification.kind as NotificationKind] ?? Bell

  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      className={cn(
        'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors',
        'hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
        unread && 'bg-warning/[0.05]',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 h-3.5 w-3.5 shrink-0',
          unread ? 'text-warning' : 'text-muted-foreground',
        )}
      />

      <div className="min-w-0 flex-1">
        <p className={cn('text-[13px] leading-tight', unread ? 'font-semibold' : 'font-medium')}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="mt-0.5 line-clamp-2 text-[11.5px] text-muted-foreground">
            {notification.body}
          </p>
        )}
        <p className="mt-1 text-[10.5px] text-muted-foreground/80">
          {relativeTime(notification.created_at)}
          {notification.source === 'webhook' && ' · recebido automaticamente'}
        </p>
      </div>

      {unread && <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />}
    </button>
  )
}

/** Quantos avisos o painel carrega. Acima disso, o rodapé avisa que há mais. */
const LIST_LIMIT = 20

function formatCount(count: number): string {
  return count > 99 ? '99+' : String(count)
}

export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  useRealtimeNotifications()

  const { clearedAfter, clearUntil } = useNotificationsClearedAfter()
  const { data: notifications = [], isLoading } = useNotifications(LIST_LIMIT, clearedAfter)
  const { data: unreadCount = 0 } = useUnreadNotificationCount()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()

  function openNotification(notification: Notification) {
    if (!notification.read_at) markRead.mutate(notification.id)
    setOpen(false)
    if (notification.link) router.push(notification.link)
  }

  /**
   * Marca tudo como lido e esvazia o painel. O marco é o `created_at` do aviso
   * mais recente da lista, não o relógio do navegador: com o relógio adiantado,
   * um aviso que chegasse logo depois ficaria escondido.
   */
  async function clearAll() {
    const newest = notifications[0]?.created_at
    try {
      if (unreadCount > 0) await markAllRead.mutateAsync()
    } catch {
      return // o hook já mostrou o erro; sem marcar como lido, não esconde
    }
    if (newest) clearUntil(newest)
  }

  const hasMore = notifications.length >= LIST_LIMIT

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label={
            unreadCount > 0 ? `${unreadCount} aviso(s) não lido(s)` : 'Avisos'
          }
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-warning px-1 text-[9px] font-bold text-warning-foreground">
              {formatCount(unreadCount)}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[340px] p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <span className="text-[12.5px] font-semibold">Avisos</span>
          {unreadCount > 0 && (
            <span className="rounded-full bg-warning/15 px-1.5 py-px text-[10.5px] font-semibold text-warning">
              {formatCount(unreadCount)} não lido{unreadCount === 1 ? '' : 's'}
            </span>
          )}
          <div className="ml-auto flex items-center">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                title="Marcar todos como lidos"
              >
                <CheckCheck className="h-3 w-3" />
                Lidos
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
                onClick={() => void clearAll()}
                disabled={markAllRead.isPending}
                title="Marcar tudo como lido e esvaziar a lista"
              >
                <BrushCleaning className="h-3 w-3" />
                Limpar
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">Carregando…</p>
        ) : notifications.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">
            Nada novo por aqui.
          </p>
        ) : (
          // Rolagem nativa: o ScrollArea com `max-h` não limitava a altura do
          // viewport interno, e com muitos avisos a lista vazava para fora do
          // painel e da tela.
          <div className="max-h-[min(380px,60vh)] divide-y overflow-y-auto overscroll-contain">
            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onOpen={openNotification}
              />
            ))}
          </div>
        )}

        {hasMore && (
          <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-[11px] text-muted-foreground">
            <span>Mostrando os {LIST_LIMIT} mais recentes.</span>
            <Link
              href="/publicacoes"
              onClick={() => setOpen(false)}
              className="font-medium text-primary hover:underline"
            >
              Ver publicações
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
