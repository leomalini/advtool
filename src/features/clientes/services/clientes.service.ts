import { createClient } from '@/lib/supabase/client'
import { recordActivity } from '@/lib/activities'
import { formatCPF, formatCNPJ } from '@/utils/format'
import type {
  ClientWithRelations,
  ClientPendency,
  ClientComment,
  ClientIssue,
  ClientType,
} from '@/types/cliente.types'
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

/** O mínimo para dizer "este documento já é de fulano" e oferecer o cadastro
 * existente, sem carregar contatos, endereços e perfis junto. */
export interface ClientDocumentMatch {
  id: string
  type: ClientType
  name: string | null
  company_name: string | null
  trade_name: string | null
}

const DOCUMENT_MATCH_SELECT = 'id, type, name, company_name, trade_name'

/**
 * O cliente que já usa este CPF/CNPJ, se houver.
 *
 * Consulta as colunas normalizadas (`cpf_digits`/`cnpj_digits`, migration 59),
 * e não `cpf`/`cnpj`: o documento é gravado ora mascarado (formulário), ora em
 * dígitos puros (partes vindas do tribunal), e comparar o valor cru deixaria
 * passar justamente a duplicata que se quer encontrar.
 *
 * As duas colunas são consultadas de uma vez porque quem pergunta nem sempre
 * sabe qual dos dois o documento é — uma parte do processo chega com um número
 * e nada dizendo se é pessoa física ou jurídica.
 *
 * `excludeId` existe para a edição: o próprio cadastro sendo editado não é uma
 * duplicata de si mesmo.
 */
export async function findClientByDocument(
  document: string,
  excludeId?: string,
): Promise<ClientDocumentMatch | null> {
  const digits = document.replace(/\D/g, '')
  // Nada abaixo de 11 dígitos é CPF ou CNPJ — evita consultar a cada tecla
  // enquanto o usuário ainda está digitando.
  if (digits.length !== 11 && digits.length !== 14) return null

  let query = supabase
    .from('clients')
    .select(DOCUMENT_MATCH_SELECT)
    .or(`cpf_digits.eq.${digits},cnpj_digits.eq.${digits}`)
    .limit(1)

  if (excludeId) query = query.neq('id', excludeId)

  const { data, error } = await query.maybeSingle()

  if (error) {
    if (isMissingDigitsColumn(error)) return findByRawDocument(digits, excludeId)
    throw error
  }

  return (data as ClientDocumentMatch | null) ?? null
}

/** `42703 undefined_column`: a base ainda não recebeu a migration 59. */
function isMissingDigitsColumn(error: { code?: string; message?: string }): boolean {
  return error.code === '42703' || Boolean(error.message?.includes('_digits'))
}

/**
 * Busca sem as colunas normalizadas — só para bases onde a migration 59 ainda
 * não foi aplicada.
 *
 * Compara contra as DUAS grafias possíveis do mesmo documento, porque é
 * exatamente isso que a coluna gerada existe para resolver: o formulário grava
 * com máscara, o tribunal manda em dígitos puros, e procurar por uma só das
 * formas não encontra a metade gravada na outra.
 *
 * Pode ser removida quando todos os ambientes estiverem na 59 — junto com a
 * chamada em `findClientByDocument`.
 */
async function findByRawDocument(
  digits: string,
  excludeId?: string,
): Promise<ClientDocumentMatch | null> {
  const masked = digits.length === 11 ? formatCPF(digits) : formatCNPJ(digits)
  const column = digits.length === 11 ? 'cpf' : 'cnpj'

  let query = supabase
    .from('clients')
    .select(DOCUMENT_MATCH_SELECT)
    .or(`${column}.eq.${digits},${column}.eq.${masked}`)
    .limit(1)

  if (excludeId) query = query.neq('id', excludeId)

  const { data, error } = await query.maybeSingle()
  if (error) throw error

  return (data as ClientDocumentMatch | null) ?? null
}

/**
 * Vários documentos de uma vez — usado ao importar um processo, cujas partes
 * chegam em bloco.
 *
 * Devolve um mapa de dígitos → cliente. Uma consulta só: N partes gerariam N
 * idas ao banco por processo importado, e a importação é em lote.
 */
export async function findClientsByDocuments(
  documents: string[],
): Promise<Map<string, ClientDocumentMatch>> {
  const digits = [
    ...new Set(
      documents
        .map((doc) => doc.replace(/\D/g, ''))
        .filter((doc) => doc.length === 11 || doc.length === 14),
    ),
  ]

  const found = new Map<string, ClientDocumentMatch>()
  if (digits.length === 0) return found

  const list = digits.join(',')
  const { data, error } = await supabase
    .from('clients')
    .select(`${DOCUMENT_MATCH_SELECT}, cpf_digits, cnpj_digits`)
    .or(`cpf_digits.in.(${list}),cnpj_digits.in.(${list})`)

  if (error) {
    // Sem a migration 59 não há por onde comparar em lote sem N consultas.
    // A importação segue sem pré-vincular: as partes ficam soltas e a tela
    // continua oferecendo o vínculo, que é o comportamento anterior.
    if (isMissingDigitsColumn(error)) return found
    throw error
  }

  for (const row of (data ?? []) as (ClientDocumentMatch & {
    cpf_digits: string | null
    cnpj_digits: string | null
  })[]) {
    const { cpf_digits, cnpj_digits, ...client } = row
    if (cpf_digits) found.set(cpf_digits, client)
    if (cnpj_digits) found.set(cnpj_digits, client)
  }

  return found
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

/** Endereço em que ninguém digitou nada não vira linha.
 *
 * O formulário abre com um cartão em branco para o caso comum de haver um
 * endereço só; salvar sem preencher criaria um registro fantasma, que a tela
 * de pendências contaria como "tem endereço". */
function hasAddressContent(address: AddressInput): boolean {
  return [
    address.street,
    address.number,
    address.complement,
    address.neighborhood,
    address.city,
    address.state,
    address.zip,
  ].some((value) => typeof value === 'string' && value.trim() !== '')
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

  const filled = (addresses ?? []).filter(hasAddressContent)
  if (filled.length > 0) {
    // O principal pode ter sido justamente o cartão em branco descartado
    // acima. Sem isto o cliente ficaria com endereços e nenhum marcado, e a
    // qualificação teria de adivinhar qual usar.
    const hasPrimary = filled.some((a) => a.is_primary)
    const { error } = await supabase.from('client_addresses').insert(
      filled.map((a, i) => ({
        ...nullifyEmpty(a),
        is_primary: hasPrimary ? a.is_primary : i === 0,
        client_id: clientId,
      }))
    )
    if (error) throw error
  }
}

/**
 * Traduz a violação de unicidade de documento (migration 59).
 *
 * O Postgres devolve "duplicate key value violates unique constraint
 * uq_clients_cpf_digits", que é verdade e não ajuda ninguém na tela. A
 * constraint é a última linha de defesa — a tela avisa antes —, então cair
 * aqui significa corrida entre duas abas ou um documento colado direto.
 */
function translateDocumentConflict(error: { code?: string; message?: string }): Error {
  if (error.code !== '23505') {
    return new Error(error.message ?? 'Não foi possível salvar o cliente.')
  }

  const isCnpj = error.message?.includes('cnpj_digits')
  return new Error(
    `Já existe um cliente cadastrado com este ${isCnpj ? 'CNPJ' : 'CPF'}. ` +
      'Abra o cadastro existente em vez de criar outro.'
  )
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

  if (error) throw translateDocumentConflict(error)

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
  if (error) throw translateDocumentConflict(error)

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

const PENDENCY_SELECT = `
  id, type, name, company_name, trade_name, cpf, cnpj, phone, email,
  legal_areas, birth_date, marital_status, rg,
  contacts:client_contacts(type),
  addresses:client_addresses(id)
`

interface PendencyRow {
  id: string
  type: ClientType
  name: string | null
  company_name: string | null
  trade_name: string | null
  cpf: string | null
  cnpj: string | null
  phone: string | null
  email: string | null
  legal_areas: string[] | null
  birth_date: string | null
  marital_status: string | null
  rg: string | null
  contacts: { type: 'phone' | 'email' }[] | null
  addresses: { id: string }[] | null
}

/**
 * Cadastros incompletos, por cliente.
 *
 * Duas severidades: `high` é o que trava o trabalho — sem documento não se
 * peticiona, sem nenhum contato não se avisa o cliente. `medium` é o que
 * enriquece a qualificação (nascimento, estado civil, RG, endereço): a peça
 * sai sem eles, só que mais pobre. Sem essa separação, os nove avisos
 * possíveis chegariam todos com o mesmo peso visual.
 *
 * Nascimento, estado civil e RG só valem para pessoa física — não existem no
 * cadastro de empresa, e cobrá-los deixaria toda PJ permanentemente pendente.
 */
export async function getClientsPendencies(): Promise<ClientPendency[]> {
  const { data, error } = await supabase
    .from('clients')
    .select(PENDENCY_SELECT)
    .order('created_at', { ascending: false })

  if (error) throw error

  const pendencies: ClientPendency[] = []

  for (const c of (data ?? []) as unknown as PendencyRow[]) {
    const issues: ClientIssue[] = []
    const isPF = c.type === 'individual'
    const displayName = isPF ? (c.name ?? '') : (c.trade_name ?? c.company_name ?? '')

    const contacts = c.contacts ?? []
    // Telefone e e-mail existem nas duas formas: coluna do cliente e linha em
    // `client_contacts`. Olhar só a coluna marcava como sem contato quem tinha
    // o celular cadastrado como contato adicional.
    const hasPhone = Boolean(c.phone) || contacts.some((ct) => ct.type === 'phone')
    const hasEmail = Boolean(c.email) || contacts.some((ct) => ct.type === 'email')

    if (isPF && !c.cpf) issues.push({ kind: 'missing_document', label: 'CPF', severity: 'high' })
    if (!isPF && !c.cnpj) issues.push({ kind: 'missing_document', label: 'CNPJ', severity: 'high' })

    if (!hasPhone && !hasEmail) {
      // Um aviso só. Listar "Contato", "Telefone" e "E-mail" para a mesma
      // ausência inflava a contagem e dizia três vezes a mesma coisa.
      issues.push({
        kind: 'missing_contact',
        label: 'Nenhum contato (telefone ou e-mail)',
        severity: 'high',
      })
    } else {
      if (!hasPhone) issues.push({ kind: 'missing_phone', label: 'Telefone', severity: 'medium' })
      if (!hasEmail) issues.push({ kind: 'missing_email', label: 'E-mail', severity: 'medium' })
    }

    if (!c.legal_areas?.length) {
      issues.push({ kind: 'missing_legal_area', label: 'Área jurídica', severity: 'medium' })
    }
    if (!c.addresses?.length) {
      issues.push({ kind: 'missing_address', label: 'Endereço', severity: 'medium' })
    }

    if (isPF) {
      if (!c.birth_date) {
        issues.push({
          kind: 'missing_birth_date',
          label: 'Data de nascimento',
          severity: 'medium',
        })
      }
      if (!c.marital_status) {
        issues.push({ kind: 'missing_marital_status', label: 'Estado civil', severity: 'medium' })
      }
      if (!c.rg) issues.push({ kind: 'missing_rg', label: 'RG', severity: 'medium' })
    }

    if (issues.length > 0) {
      pendencies.push({ clientId: c.id, displayName, type: c.type, issues })
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
