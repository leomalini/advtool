import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActivityType } from '@/types/activity.types'

interface RecordAdminActivityInput {
  type: Extract<
    ActivityType,
    | 'user_invited'
    | 'user_invite_resent'
    | 'user_role_changed'
    | 'user_deactivated'
    | 'user_reactivated'
  >
  /** Quem sofreu a ação. */
  targetId: string
  targetName: string
  /** Quem executou — sempre o admin autenticado, nunca vindo do corpo. */
  actorId: string
  metadata?: Record<string, unknown>
}

/**
 * Trilha de auditoria das ações de administração de acesso.
 *
 * Best-effort, igual ao `recordActivity` do browser (`src/lib/activities.ts`):
 * loga e segue. Perder uma linha do feed não pode desfazer um convite que já
 * saiu por e-mail. O log é o que torna a perda detectável — foi a ausência dele
 * que deixou o bug do CHECK de `entity_type` passar meses (migration 15).
 *
 * Recebe o client de fora, e não cria um, porque quem chama já tem o de
 * service_role em mãos: a rota escreve como sistema, depois de ter confirmado
 * que quem pediu é admin.
 */
export async function recordAdminActivity(
  supabase: SupabaseClient,
  { type, targetId, targetName, actorId, metadata = {} }: RecordAdminActivityInput
): Promise<void> {
  const { error } = await supabase.from('activities').insert({
    type,
    entity_type: 'user',
    entity_id: targetId,
    entity_title: targetName,
    actor_id: actorId,
    metadata,
  })

  if (error) {
    console.error('[activities] auditoria de admin falhou:', error.code, error.message)
  }
}
