import { createClient } from '@/lib/supabase/client'
import type { EventTypeRecord } from '@/types/event.types'

const supabase = createClient()

/**
 * Slug a partir do rótulo digitado.
 *
 * O id é textual (mesmo desenho de `workflows`) para que os quatro tipos
 * originais mantivessem os slugs que já estavam em `events.type`. Para os
 * novos, derivar do rótulo mantém a coluna legível em consultas soltas —
 * `type = 'pericia'` diz mais que um uuid.
 */
function slugify(label: string): string {
  return (
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'tipo'
  )
}

export async function getEventTypes(): Promise<EventTypeRecord[]> {
  const { data, error } = await supabase
    .from('event_types')
    .select('*')
    .order('position')
    .order('label')

  if (error) throw error
  return (data ?? []) as EventTypeRecord[]
}

/** Erro de negócio: o rótulo já existe. Distinto de falha técnica para a UI
 * poder explicar em vez de mostrar "erro ao salvar". */
export class DuplicateEventTypeError extends Error {
  constructor(public readonly label: string) {
    super(`Já existe um tipo chamado "${label}".`)
    this.name = 'DuplicateEventTypeError'
  }
}

export async function createEventType(input: {
  label: string
  color: string
}): Promise<EventTypeRecord> {
  const label = input.label.trim()
  const base = slugify(label)

  const existing = await getEventTypes()
  if (existing.some((t) => t.label.toLowerCase() === label.toLowerCase())) {
    throw new DuplicateEventTypeError(label)
  }

  // Slugs diferentes podem colidir ("Perícia" e "Pericia"). Sufixo numérico
  // resolve sem pedir nada ao usuário.
  const taken = new Set(existing.map((t) => t.id))
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`

  const position = existing.length

  const { data, error } = await supabase
    .from('event_types')
    .insert({ id, label, color: input.color, position, is_system: false })
    .select('*')
    .single()

  if (error) throw error
  return data as EventTypeRecord
}

export async function updateEventType(
  id: string,
  patch: { label?: string; color?: string }
): Promise<void> {
  const { error } = await supabase.from('event_types').update(patch).eq('id', id)
  if (error) throw error
}

/** Quantos eventos usam um tipo — o que decide se ele pode ser excluído. */
export async function countEventsOfType(typeId: string): Promise<number> {
  const { count, error } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('type', typeId)

  if (error) throw error
  return count ?? 0
}

/** Erro de negócio: o tipo está em uso e a FK é RESTRICT. */
export class EventTypeInUseError extends Error {
  constructor(public readonly count: number) {
    super(`Este tipo está em uso por ${count} evento(s).`)
    this.name = 'EventTypeInUseError'
  }
}

export async function deleteEventType(id: string): Promise<void> {
  // Checagem antes do delete só para dar uma mensagem útil; a garantia real é a
  // FK RESTRICT no banco, que vale mesmo se dois usuários agirem ao mesmo tempo.
  const inUse = await countEventsOfType(id)
  if (inUse > 0) throw new EventTypeInUseError(inUse)

  const { error } = await supabase.from('event_types').delete().eq('id', id)
  if (error) throw error
}
