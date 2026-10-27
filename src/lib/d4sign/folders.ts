// Server-side. O client é a service_role: `d4sign_folders` não tem policy
// (migration 79).
import type { SupabaseClient } from '@supabase/supabase-js'
import { d4signError, d4signRequest } from './client'
import { createdFolderSchema } from './schemas'

/**
 * A pasta de cada envio dentro do cofre: uma por cliente, mais "Escritório"
 * (contrato do próprio escritório) e "Sem cliente".
 *
 * O vínculo é pelo `client_id`, em `d4sign_folders`: dois clientes homônimos
 * ganham duas pastas, e renomear o cliente renomeia a pasta no envio seguinte.
 * Nada é apagado no cofre — lá fica a via legal.
 */

export type FolderOwner =
  | { kind: 'cliente'; clientId: string; clientName: string }
  | { kind: 'escritorio' }
  | { kind: 'sem_cliente' }

const FIXED_FOLDER_NAMES = {
  escritorio: 'Escritório',
  sem_cliente: 'Sem cliente',
} as const

/** A D4Sign não documenta limite; nome muito longo é cortado com folga. */
const MAX_FOLDER_NAME = 100

export function folderNameFor(owner: FolderOwner): string {
  if (owner.kind !== 'cliente') return FIXED_FOLDER_NAMES[owner.kind]
  const name = owner.clientName.replace(/\s+/g, ' ').trim()
  return (name || 'Cliente sem nome').slice(0, MAX_FOLDER_NAME)
}

interface FolderRow {
  id: string
  folder_uuid: string
  folder_name: string
}

async function findFolder(
  supabase: SupabaseClient,
  safeUuid: string,
  owner: FolderOwner,
): Promise<FolderRow | null> {
  const query = supabase
    .from('d4sign_folders')
    .select('id, folder_uuid, folder_name')
    .eq('safe_uuid', safeUuid)
    .eq('kind', owner.kind)

  const { data, error } = await (owner.kind === 'cliente'
    ? query.eq('client_id', owner.clientId)
    : query.is('client_id', null)
  ).maybeSingle()
  if (error) throw error
  return (data as FolderRow | null) ?? null
}

/**
 * Renomear é cosmético: se a D4Sign recusar (o limite por hora, por exemplo),
 * a pasta segue com o nome antigo e o envio não para.
 */
async function renameFolder(
  supabase: SupabaseClient,
  safeUuid: string,
  folder: FolderRow,
  name: string,
): Promise<void> {
  try {
    await d4signRequest(`/folders/${encodeURIComponent(safeUuid)}/rename`, {
      json: { folder_name: name, uuid_folder: folder.folder_uuid },
    })
  } catch (error) {
    console.error(
      '[d4sign] pasta não renomeada:',
      folder.folder_uuid,
      error instanceof Error ? error.message : error,
    )
    return
  }

  const { error } = await supabase
    .from('d4sign_folders')
    .update({ folder_name: name })
    .eq('id', folder.id)
  if (error) console.error('[d4sign] nome novo da pasta não gravado:', folder.id, error.message)
}

/** O UUID da pasta do dono no cofre, criada na primeira vez. */
export async function ensureFolder(
  supabase: SupabaseClient,
  safeUuid: string,
  owner: FolderOwner,
): Promise<string> {
  const name = folderNameFor(owner)
  const existing = await findFolder(supabase, safeUuid, owner)

  if (existing) {
    if (existing.folder_name !== name) await renameFolder(supabase, safeUuid, existing, name)
    return existing.folder_uuid
  }

  const path = `/folders/${encodeURIComponent(safeUuid)}/create`
  const body = await d4signRequest(path, { json: { folder_name: name } })
  const created = createdFolderSchema.safeParse(body)
  if (!created.success) {
    throw d4signError('invalid_response', 502, path, JSON.stringify(body) ?? 'sem corpo')
  }

  const { error } = await supabase.from('d4sign_folders').insert({
    safe_uuid: safeUuid,
    kind: owner.kind,
    client_id: owner.kind === 'cliente' ? owner.clientId : null,
    folder_uuid: created.data.uuid,
    folder_name: name,
  })

  if (error) {
    // Dois envios do mesmo cliente ao mesmo tempo: o outro gravou primeiro, e a
    // pasta dele vale. A criada aqui fica vazia no cofre.
    if (error.code === '23505') {
      const winner = await findFolder(supabase, safeUuid, owner)
      if (winner) return winner.folder_uuid
    }
    throw error
  }
  return created.data.uuid
}
