import { createClient } from '@/lib/supabase/client'
import { recordActivity } from '@/lib/activities'
import type { ClientWithRelations, ClientPendency, ClientComment } from '@/types/cliente.types'
import type { CreateClientInput, ContactInput, AddressInput } from '@/schemas/cliente.schema'

const supabase = createClient()

const CLIENT_SELECT = `
  *,
  assignee:profiles!clients_assigned_to_fkey(id, full_name, avatar_url, role, created_at),
  creator:profiles!clients_created_by_fkey(id, full_name, avatar_url, role, created_at),
  contacts:client_contacts(*),
  addresses:client_addresses(*)
`

/** Principal primeiro, depois por ordem de cadastro.
 *
 * A ordenação é feita aqui e não no `.order()` porque embed do PostgREST vem
 * em ordem de heap, que muda a cada update — sem isto, "o primeiro endereço"
 * seria um endereço diferente a cada carregamento da tela. */
function sortAddresses(client: ClientWithRelations): ClientWithRelations {
  if (!client.addresses) return client
  return {
    ...client,
    addresses: [...client.addresses].sort(
      (a, b) =>
        Number(b.is_primary) - Number(a.is_primary) || a.created_at.localeCompare(b.created_at),
    ),
  }
}

export async function getClients(): Promise<ClientWithRelations[]> {
  const { data, error } = await supabase
    .from('clients')
    .select(CLIENT_SELECT)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as ClientWithRelations[]).map(sortAddresses)
}

export async function getClientById(id: string): Promise<ClientWithRelations> {
  const { data, error } = await supabase
    .from('clients')
    .select(CLIENT_SELECT)
    .eq('id', id)
    .single()

  if (error) throw error
  return sortAddresses(data as ClientWithRelations)
}

/** Controles de formulário devolvem '' quando intocados, e o Postgres recusa
 * isso em coluna date — `birth_date: ''` quebraria o cadastro inteiro. Mesmo
 * tratamento de tasks/documents/financialEntries. */
function nullifyEmpty<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    out[key] = value === '' ? null : value
  }
  return out as T
}

/** Grava as filhas do cliente (contatos e endereços).
 *
 * O erro sobe: um endereço recusado pela RLS não pode sumir em silêncio, senão
 * a tela diz "cliente cadastrado" e a petição sai sem o endereço. */
async function insertChildren(
  clientId: string,
  contacts: ContactInput[] | undefined,
  addresses: AddressInput[] | undefined
): Promise<void> {
  if (contacts && contacts.length > 0) {
    const { error } = await supabase
      .from('client_contacts')
      .insert(contacts.map((c) => ({ ...c, client_id: clientId })))
    if (error) throw error
  }

  if (addresses && addresses.length > 0) {
    const { error } = await supabase
      .from('client_addresses')
      .insert(addresses.map((a) => ({ ...nullifyEmpty(a), client_id: clientId })))
    if (error) throw error
  }
}

export async function createClientRecord(
  input: CreateClientInput,
  userId: string
): Promise<ClientWithRelations> {
  const { contacts, addresses, ...clientData } = input as CreateClientInput & {
    contacts?: ContactInput[]
    addresses?: AddressInput[]
  }

  const { data, error } = await supabase
    .from('clients')
    .insert({ ...nullifyEmpty(clientData), created_by: userId })
    .select(CLIENT_SELECT)
    .single()

  if (error) throw error

  await insertChildren(data.id, contacts, addresses)

  await recordActivity({
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
  const { contacts, addresses, ...clientData } = input as Partial<CreateClientInput> & {
    contacts?: ContactInput[]
    addresses?: AddressInput[]
  }

  const { error } = await supabase.from('clients').update(nullifyEmpty(clientData)).eq('id', id)
  if (error) throw error

  // `!== undefined`, e não truthiness: um patch de campo único (o telefone
  // editado pelo ClienteResumo, por exemplo) não menciona as filhas e não pode
  // apagá-las. Uma lista vazia, essa sim, apaga — é o pedido explícito.
  if (contacts !== undefined) {
    await supabase.from('client_contacts').delete().eq('client_id', id)
  }
  if (addresses !== undefined) {
    await supabase.from('client_addresses').delete().eq('client_id', id)
  }

  await insertChildren(id, contacts, addresses)
}

export async function deleteClientRecord(id: string): Promise<void> {
  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) throw error
}

export async function getClientsPendencies(): Promise<ClientPendency[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, type, name, company_name, trade_name, cpf, cnpj, phone, email, legal_areas')
    .order('created_at', { ascending: false })

  if (error) throw error

  const pendencies: ClientPendency[] = []

  for (const c of data ?? []) {
    const missing: string[] = []
    const displayName =
      c.type === 'individual' ? (c.name ?? '') : (c.trade_name ?? c.company_name ?? '')

    if (c.type === 'individual' && !c.cpf) missing.push('CPF')
    if (c.type === 'company' && !c.cnpj) missing.push('CNPJ')
    if (!c.phone && !c.email) missing.push('Contato (telefone ou email)')
    if (!c.phone) missing.push('Telefone')
    if (!c.email) missing.push('E-mail')
    if (!c.legal_areas?.length) missing.push('Área jurídica')

    if (missing.length > 0) {
      pendencies.push({
        clientId: c.id,
        displayName,
        type: c.type,
        missingFields: missing,
      })
    }
  }

  return pendencies
}

// ── Notas do cliente ─────────────────────────────────────────────────────────

const CLIENT_COMMENT_SELECT = `
  *,
  author:profiles!client_comments_author_id_fkey(id, full_name, avatar_url, role, created_at)
`

export async function getClientComments(clientId: string): Promise<ClientComment[]> {
  const { data, error } = await supabase
    .from('client_comments')
    .select(CLIENT_COMMENT_SELECT)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as unknown as ClientComment[]
}

export async function addClientComment(
  clientId: string,
  content: string,
  userId: string,
  entityTitle: string
): Promise<ClientComment> {
  const { data, error } = await supabase
    .from('client_comments')
    .insert({ client_id: clientId, content, author_id: userId })
    .select(CLIENT_COMMENT_SELECT)
    .single()

  if (error) throw error

  await recordActivity({
    type: 'client_comment',
    entity_type: 'client',
    entity_id: clientId,
    entity_title: entityTitle,
    actor_id: userId,
  })

  return data as unknown as ClientComment
}

// Os anexos do cliente saíram daqui na migration 23: `client_attachments` foi
// absorvida por `documents`, e a aba do modal já usa o DocumentsTab. As funções
// que restavam apontavam para uma tabela que não existe mais.

export async function getAttachmentUrl(filePath: string): Promise<string> {
  const { data } = await supabase.storage
    .from('attachments')
    .createSignedUrl(filePath, 3600)

  return data?.signedUrl ?? ''
}
