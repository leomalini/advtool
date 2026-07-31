import { createClient } from '@/lib/supabase/client'
import type { ActivityType, EntityType } from '@/types/activity.types'

const supabase = createClient()

interface RecordActivityInput {
  type: ActivityType
  entity_type: EntityType
  entity_id: string
  entity_title: string
  actor_id: string
  metadata?: Record<string, unknown>
}

/**
 * Appends an entry to the global activity feed.
 *
 * Best-effort by design: a failure here logs and returns, it never throws.
 * The feed is auxiliary telemetry — losing an entry must not roll back or
 * block the operation that produced it.
 *
 * Note this is exactly how the bug fixed in migration 15 went unnoticed: the
 * inserts were fire-and-forget *and* ignored the returned error, so a CHECK
 * violation looked like success. Logging is what makes silence detectable.
 */
export async function recordActivity(input: RecordActivityInput): Promise<void> {
  const { error } = await supabase.from('activities').insert(input)
  if (error) {
    console.error('[activities] insert failed:', error.message, error.details)
  }
}
