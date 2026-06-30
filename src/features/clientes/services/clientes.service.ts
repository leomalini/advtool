import { createClient } from '@/lib/supabase/client'
import type { ClientWithRelations, ClientAttachment } from '@/types/cliente.types'
import type { CreateClientInput } from '@/schemas/cliente.schema'

const supabase = createClient()

const CLIENT_SELECT = `
  *,
  assignee:profiles!clients_assigned_to_fkey(id, full_name, avatar_url, role, created_at),
  creator:profiles!clients_created_by_fkey(id, full_name, avatar_url, role, created_at)
`

export async function getClients(): Promise<ClientWithRelations[]> {
  const { data, error } = await supabase
    .from('clients')
    .select(CLIENT_SELECT)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as ClientWithRelations[]
}

export async function getClientById(id: string): Promise<ClientWithRelations> {
  const { data, error } = await supabase
    .from('clients')
    .select(CLIENT_SELECT)
    .eq('id', id)
    .single()

  if (error) throw error
  return data as ClientWithRelations
}

export async function createClientRecord(
  input: CreateClientInput,
  userId: string
): Promise<ClientWithRelations> {
  const { data, error } = await supabase
    .from('clients')
    .insert({ ...input, created_by: userId })
    .select(CLIENT_SELECT)
    .single()

  if (error) throw error

  await supabase.from('activities').insert({
    type: 'client_created',
    entity_type: 'client',
    entity_id: data.id,
    entity_title: data.name ?? data.company_name ?? 'Cliente',
    actor_id: userId,
  })

  return data as ClientWithRelations
}

export async function updateClientRecord(
  id: string,
  input: Partial<CreateClientInput>
): Promise<void> {
  const { error } = await supabase.from('clients').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteClientRecord(id: string): Promise<void> {
  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) throw error
}

export async function getClientAttachments(clientId: string): Promise<ClientAttachment[]> {
  const { data, error } = await supabase
    .from('client_attachments')
    .select(`
      *,
      uploader:profiles!client_attachments_uploaded_by_fkey(id, full_name, avatar_url, role, created_at)
    `)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as ClientAttachment[]
}

export async function uploadClientAttachment(
  clientId: string,
  file: File,
  userId: string
): Promise<ClientAttachment> {
  const filePath = `${clientId}/${Date.now()}-${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('attachments')
    .upload(filePath, file)

  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('client_attachments')
    .insert({
      client_id: clientId,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      file_type: file.type,
      uploaded_by: userId,
    })
    .select()
    .single()

  if (error) throw error
  return data as ClientAttachment
}

export async function deleteClientAttachment(
  id: string,
  filePath: string
): Promise<void> {
  await supabase.storage.from('attachments').remove([filePath])
  const { error } = await supabase.from('client_attachments').delete().eq('id', id)
  if (error) throw error
}

export async function getAttachmentUrl(filePath: string): Promise<string> {
  const { data } = await supabase.storage
    .from('attachments')
    .createSignedUrl(filePath, 3600)

  return data?.signedUrl ?? ''
}
