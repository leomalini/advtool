import { createClient } from '@/lib/supabase/client'
import type { Notification } from '@/types/notification.types'

const supabase = createClient()

/**
 * Avisos de chegada.
 *
 * A RLS filtra por linha: cada aviso declara em `resource` o recurso do RBAC
 * que ele exige, então uma consulta sem filtro já devolve só o que o perfil
 * pode ver. Não há `where` de permissão aqui de propósito — duplicá-lo em
 * JavaScript daria a impressão de que ele é o que protege.
 */

const NOTIFICATION_COLUMNS =
  'id, kind, resource, title, body, link, entity_type, entity_id, source, read_at, created_at'

/**
 * O sino mostra os últimos; o histórico completo não é o problema deste módulo.
 *
 * `after`: só os criados depois deste instante — é o "Limpar" do sino, que
 * esvazia o painel sem apagar nada (ver `useNotificationsClearedAfter`).
 */
export async function getRecentNotifications(
  limit = 20,
  after: string | null = null,
): Promise<Notification[]> {
  let query = supabase
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (after) query = query.gt('created_at', after)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as Notification[]
}

export async function countUnreadNotifications(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)

  if (error) throw error
  return count ?? 0
}

/** Idempotente: reabrir não reescreve o carimbo original. */
export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null)

  if (error) throw error
}

export async function markAllNotificationsRead(): Promise<number> {
  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
    .select('id')

  if (error) throw error
  return data?.length ?? 0
}
