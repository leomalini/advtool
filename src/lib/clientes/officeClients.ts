// Server-side. O client vem de quem chama e é sempre o de `service_role`: o
// webhook não tem sessão, e o aviso do sino só é gravável por ele (migration 47).
import type { SupabaseClient } from '@supabase/supabase-js'
import { oabKey, parseOabText } from '@/lib/oab'

/**
 * Cadastro automático do cliente representado pelo escritório.
 *
 * Quando chega uma publicação ou movimentação, a parte cujo advogado tem uma
 * OAB do escritório é, por definição, nossa cliente — e o que existia era o
 * "Vincular ou cadastrar" à mão, parte por parte. Aqui o sistema faz o mesmo
 * sozinho, mas só quando a resposta não é um palpite:
 *
 *  · PELA CAPA — `legal_process_parties.lawyer_oabs` (migration 88) liga cada
 *    parte aos advogados dela. É a fonte confiável, e quando o processo tem essa
 *    informação ela é a única consultada.
 *  · PELA PUBLICAÇÃO — o diário lista os envolvidos numa lista plana, sem dizer
 *    quem representa quem. Só vale quando a nossa OAB aparece e há UMA parte só
 *    ao lado dela. Com partes dos dois polos, cadastrar seria escolher no
 *    escuro, e o erro típico é transformar a parte contrária em cliente.
 *
 * A OAB só aponta QUAL parte é a cliente; o cadastro é pelo CPF/CNPJ. Sem
 * documento não há cadastro nem vínculo — decisão do escritório: nome sozinho
 * não identifica ninguém, e cliente criado só com nome vira duplicata quando o
 * documento aparecer. Como o diário não traz documento, a publicação órfã não
 * cadastra nada: o documento chega com a capa, quando o processo for cadastrado.
 * Já a publicação de processo cadastrado empresta o documento da parte de mesmo
 * nome na capa.
 *
 * O mesmo CPF/CNPJ já cadastrado é reaproveitado, e a pessoa (migration 78)
 * vira cliente.
 *
 * Tudo aqui é best-effort para quem chama: perder o cadastro automático não
 * pode desfazer a publicação ou a movimentação que o disparou.
 */

/** Advogado do escritório, como o perfil o cadastra. */
export interface OfficeLawyer {
  profileId: string
  name: string | null
  /** 'OAB/ES 9591', para o aviso e a observação do cadastro. */
  label: string
}

/** Chave de `oabKey` → advogado. */
export type OfficeOabs = Map<string, OfficeLawyer>

export type OfficeClientAction =
  /** Cadastro novo. */
  | 'created'
  /** Já estava em Pessoas e passou a ser cliente. */
  | 'converted'
  /** Já era cliente; só o vínculo com a parte e o processo é novo. */
  | 'existing'

export interface OfficeClientRef {
  /** Null em `dryRun` quando o cadastro seria criado. */
  id: string | null
  name: string
  action: OfficeClientAction
  lawyer: OfficeLawyer
}

export interface OfficeClientsResult {
  clients: OfficeClientRef[]
  /** Partes do processo que passaram a apontar para o cliente. */
  linkedParties: number
  /** O processo estava sem cliente e passou a ser deste. */
  adoptedByProcess: boolean
  /** Por que nada foi feito, quando nada foi feito. */
  reason?: string
}

export interface OfficeClientsOptions {
  /** Decide sem gravar — a simulação de webhook da tela de Configurações. */
  dryRun?: boolean
  /** Vai para `notifications.source`: 'webhook' | 'sync'. */
  source: string
  /** Para a observação do cadastro e o aviso. */
  cnj?: string | null
  /** Já carregadas por quem chama, para não reler os perfis. */
  officeOabs?: OfficeOabs
}

/** Parte da publicação, na forma de `PublicationIngestParty`. */
export interface DiarioParty {
  name: string
  role: 'destinatario' | 'advogado'
  oab: string | null
}

interface Candidate {
  name: string
  document: string | null
  /** Parte do processo a vincular, quando há processo. */
  partyId: string | null
  lawyer: OfficeLawyer
}

interface PartyRow {
  id: string
  name: string
  document: string | null
  client_id: string | null
  lawyer_oabs: string[] | null
}

const EMPTY: OfficeClientsResult = { clients: [], linkedParties: 0, adoptedByProcess: false }

/**
 * As inscrições do escritório: perfis com número e UF da OAB.
 *
 * Perfil desativado continua valendo — o advogado que saiu ainda aparece nos
 * processos que conduziu —, mas o ativo tem precedência quando dois dividem a
 * mesma inscrição, porque é ele que assina o cadastro novo.
 */
export async function loadOfficeOabs(supabase: SupabaseClient): Promise<OfficeOabs> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, oab_number, oab_state, is_active')
    .not('oab_number', 'is', null)
    .not('oab_state', 'is', null)
    .order('is_active', { ascending: false })

  if (error) throw new Error(`Leitura das OABs do escritório falhou: ${error.message}`)

  const oabs: OfficeOabs = new Map()
  for (const row of data ?? []) {
    const key = oabKey(row.oab_state as string, row.oab_number as string)
    if (!key || oabs.has(key)) continue
    const [state, number] = key.split(':')
    oabs.set(key, {
      profileId: row.id as string,
      name: (row.full_name as string | null) ?? null,
      label: `OAB/${state} ${number}`,
    })
  }
  return oabs
}

/**
 * Pela capa: toda parte sem cliente cujo advogado tem OAB do escritório.
 *
 * Roda na sincronização do processo (o cadastro passa por ela) e na chegada de
 * publicação ou movimentação de um processo cadastrado.
 */
export async function linkOfficeClientsOnProcess(
  supabase: SupabaseClient,
  legalProcessId: string,
  options: OfficeClientsOptions,
): Promise<OfficeClientsResult> {
  const officeOabs = options.officeOabs ?? (await loadOfficeOabs(supabase))
  if (officeOabs.size === 0) return { ...EMPTY, reason: 'Nenhum perfil com OAB cadastrada.' }

  const parties = await loadParties(supabase, legalProcessId)

  const candidates: Candidate[] = []
  for (const party of parties) {
    if (party.client_id) continue
    const lawyer = officeLawyerOf(party.lawyer_oabs, officeOabs)
    if (!lawyer) continue
    candidates.push({ name: party.name, document: party.document, partyId: party.id, lawyer })
  }

  if (candidates.length === 0) {
    return { ...EMPTY, reason: 'Nenhuma parte sem cliente representada pelo escritório.' }
  }

  return registerCandidates(supabase, candidates, legalProcessId, options)
}

/**
 * Pela publicação de diário.
 *
 * Com processo cadastrado e capa que já diga quem é representado por quem, a
 * capa decide e a lista do diário nem é olhada. Sem isso, vale a regra da
 * parte única descrita no cabeçalho.
 */
export async function registerOfficeClientFromDiario(
  supabase: SupabaseClient,
  input: { parties: DiarioParty[]; legalProcessId: string | null },
  options: OfficeClientsOptions,
): Promise<OfficeClientsResult> {
  const officeOabs = options.officeOabs ?? (await loadOfficeOabs(supabase))
  if (officeOabs.size === 0) return { ...EMPTY, reason: 'Nenhum perfil com OAB cadastrada.' }

  const processParties = input.legalProcessId
    ? await loadParties(supabase, input.legalProcessId)
    : []

  if (processParties.some((party) => (party.lawyer_oabs ?? []).length > 0)) {
    return linkOfficeClientsOnProcess(supabase, input.legalProcessId as string, {
      ...options,
      officeOabs,
    })
  }

  const picked = pickDiarioClient(input.parties, officeOabs)
  if ('reason' in picked) return { ...EMPTY, reason: picked.reason }

  if (!input.legalProcessId) {
    return {
      ...EMPTY,
      reason:
        `Publicação órfã: o diário não traz CPF/CNPJ de ${picked.name}. ` +
        'O cliente é cadastrado quando o processo for cadastrado.',
    }
  }

  // A parte do processo com o mesmo nome é a mesma pessoa: é nela que o vínculo
  // fica, e é dela (da capa) que vem o documento que o diário não traz.
  const party = processParties.find(
    (candidate) => normalizeName(candidate.name) === normalizeName(picked.name),
  )
  if (party?.client_id) return { ...EMPTY, reason: 'A parte já está vinculada a um cadastro.' }

  return registerCandidates(
    supabase,
    [
      {
        name: picked.name,
        document: party?.document ?? null,
        partyId: party?.id ?? null,
        lawyer: picked.lawyer,
      },
    ],
    input.legalProcessId,
    { ...options, officeOabs },
  )
}

/**
 * A parte que a publicação permite atribuir ao escritório, ou o motivo de não
 * haver uma. Exportada para a simulação poder explicar a decisão.
 */
export function pickDiarioClient(
  parties: DiarioParty[],
  officeOabs: OfficeOabs,
): { name: string; lawyer: OfficeLawyer } | { reason: string } {
  let lawyer: OfficeLawyer | null = null
  for (const party of parties) {
    const key = parseOabText(party.oab)
    const match = key ? officeOabs.get(key) : undefined
    if (match) {
      lawyer = match
      break
    }
  }
  if (!lawyer) return { reason: 'A publicação não cita OAB do escritório.' }

  // Quem tem OAB é advogado, mesmo quando a origem não rotulou o papel.
  const names = new Map<string, string>()
  for (const party of parties) {
    if (party.role === 'advogado' || party.oab) continue
    // A primeira grafia vence: é a que a origem listou como principal.
    const name = party.name.trim()
    const key = normalizeName(name)
    if (name && !names.has(key)) names.set(key, name)
  }

  if (names.size === 0) return { reason: 'A publicação não traz o nome da parte.' }
  if (names.size > 1) {
    return { reason: 'A publicação cita mais de uma parte; não dá para saber qual é a cliente.' }
  }

  return { name: [...names.values()][0], lawyer }
}

// ── Gravação ──────────────────────────────────────────────────────────────────

async function registerCandidates(
  supabase: SupabaseClient,
  candidates: Candidate[],
  legalProcessId: string | null,
  options: OfficeClientsOptions,
): Promise<OfficeClientsResult> {
  const dryRun = options.dryRun ?? false
  const result: OfficeClientsResult = { ...EMPTY, clients: [] }
  const withoutDocument: string[] = []

  for (const candidate of candidates) {
    const digits = documentDigits(candidate.document)
    if (!digits) {
      withoutDocument.push(candidate.name)
      continue
    }

    const client = await ensureClient(supabase, candidate, digits, options)
    result.clients.push(client)

    if (dryRun || !client.id || !candidate.partyId) continue

    // `is null` no filtro: um vínculo feito na tela entre a leitura e esta
    // escrita é decisão de alguém e não é sobrescrito.
    const { data, error } = await supabase
      .from('legal_process_parties')
      .update({ client_id: client.id })
      .eq('id', candidate.partyId)
      .is('client_id', null)
      .select('id')

    if (error) throw new Error(`Vínculo da parte falhou: ${error.message}`)
    result.linkedParties += data?.length ?? 0
  }

  const owner = result.clients.find((client) => client.id)
  if (!dryRun && legalProcessId && owner?.id) {
    result.adoptedByProcess = await adoptOnProcess(supabase, legalProcessId, owner.id)
  }

  if (withoutDocument.length > 0) {
    result.reason = `Sem CPF/CNPJ na capa do processo: ${withoutDocument.join(', ')}.`
  }

  if (!dryRun) await notify(supabase, result.clients, options)

  return result
}

/**
 * O cadastro da pessoa pelo CPF/CNPJ: reaproveita o que existe, converte
 * pessoa em cliente, ou cria. O documento é único (migration 59), então não há
 * dois cadastros para escolher.
 */
async function ensureClient(
  supabase: SupabaseClient,
  candidate: Candidate,
  digits: string,
  options: OfficeClientsOptions,
): Promise<OfficeClientRef> {
  const dryRun = options.dryRun ?? false
  const base = { name: candidate.name, lawyer: candidate.lawyer }

  const [existing] = await findByDocument(supabase, digits)
  if (existing) {
    if (existing.is_client) return { ...base, id: existing.id, action: 'existing' }
    if (!dryRun) {
      const { error } = await supabase
        .from('clients')
        .update({ client_since: new Date().toISOString() })
        .eq('id', existing.id)
      if (error) throw new Error(`Conversão em cliente falhou: ${error.message}`)
    }
    return { ...base, id: existing.id, action: 'converted' }
  }

  if (dryRun) return { ...base, id: null, action: 'created' }

  const company = digits.length === 14
  const where = options.cnj ? ` no processo ${options.cnj}` : ''
  const lawyerName = candidate.lawyer.name ? `${candidate.lawyer.name} ` : ''

  const { data, error } = await supabase
    .from('clients')
    .insert({
      type: company ? 'company' : 'individual',
      name: company ? null : candidate.name,
      company_name: company ? candidate.name : null,
      cpf: company ? null : candidate.document,
      cnpj: company ? candidate.document : null,
      // Sem sessão não há quem cadastrou: assina o advogado que representa a
      // parte, que também é o responsável natural pelo cliente.
      created_by: candidate.lawyer.profileId,
      assigned_to: candidate.lawyer.profileId,
      notes:
        `Cadastrado automaticamente: parte representada por ${lawyerName}` +
        `(${candidate.lawyer.label})${where}. Confira os dados.`,
    })
    .select('id')
    .single()

  if (error) {
    // Outra ingestão cadastrou o mesmo documento no intervalo (índice único da
    // migration 59): o cadastro dela serve.
    if (error.code === '23505') {
      const [raced] = await findByDocument(supabase, digits)
      if (raced) return { ...base, id: raced.id, action: 'existing' }
    }
    throw new Error(`Cadastro do cliente falhou: ${error.message}`)
  }

  return { ...base, id: data.id as string, action: 'created' }
}

interface ClientMatch {
  id: string
  is_client: boolean
}

async function findByDocument(supabase: SupabaseClient, digits: string): Promise<ClientMatch[]> {
  const column = digits.length === 14 ? 'cnpj_digits' : 'cpf_digits'
  const { data, error } = await supabase
    .from('clients')
    .select('id, is_client')
    .eq(column, digits)
    .limit(2)

  if (error) throw new Error(`Busca do cliente por documento falhou: ${error.message}`)
  return (data ?? []) as ClientMatch[]
}

/**
 * Dá dono ao processo quando ele ainda não tem — a mesma regra de
 * `adoptClientOnProcess` na tela: o item mestre é o de `wf-processos`, e dono
 * já definido não é trocado.
 */
async function adoptOnProcess(
  supabase: SupabaseClient,
  legalProcessId: string,
  clientId: string,
): Promise<boolean> {
  const { data: item, error } = await supabase
    .from('crm_items')
    .select('id, client_id')
    .eq('legal_process_id', legalProcessId)
    .eq('workflow_id', 'wf-processos')
    .order('created_at')
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Leitura do item do processo falhou: ${error.message}`)
  if (!item || item.client_id) return false

  const { data, error: updateError } = await supabase
    .from('crm_items')
    .update({ client_id: clientId })
    .eq('id', item.id)
    .is('client_id', null)
    .select('id')

  if (updateError) throw new Error(`Vínculo do cliente ao processo falhou: ${updateError.message}`)
  return (data?.length ?? 0) > 0
}

/** Aviso do sino para o cadastro novo ou convertido. Cliente que já existia
 * não gera aviso: o vínculo aparece no processo e não pede ação de ninguém. */
async function notify(
  supabase: SupabaseClient,
  clients: OfficeClientRef[],
  options: OfficeClientsOptions,
): Promise<void> {
  const news = clients.filter((client) => client.id && client.action !== 'existing')
  if (news.length === 0) return

  const { error } = await supabase.from('notifications').insert(
    news.map((client) => ({
      kind: 'cliente_cadastrado_auto',
      resource: 'clientes',
      title:
        client.action === 'created'
          ? 'Cliente cadastrado automaticamente'
          : 'Pessoa passou a ser cliente',
      body: [client.name, client.lawyer.label, options.cnj].filter(Boolean).join(' — '),
      link: `/clientes/${client.id}`,
      entity_type: 'client',
      entity_id: client.id,
      source: options.source,
    })),
  )

  if (error) console.error('[clientes/officeClients] aviso não gravado:', error.message)
}

// ── Auxiliares ────────────────────────────────────────────────────────────────

async function loadParties(supabase: SupabaseClient, legalProcessId: string): Promise<PartyRow[]> {
  const { data, error } = await supabase
    .from('legal_process_parties')
    .select('id, name, document, client_id, lawyer_oabs')
    .eq('legal_process_id', legalProcessId)
    .order('position')

  if (error) throw new Error(`Leitura das partes falhou: ${error.message}`)
  return (data ?? []) as PartyRow[]
}

function officeLawyerOf(keys: string[] | null, officeOabs: OfficeOabs): OfficeLawyer | null {
  for (const key of keys ?? []) {
    const lawyer = officeOabs.get(key)
    if (lawyer) return lawyer
  }
  return null
}

/** Só CPF (11) ou CNPJ (14) contam — o resto é digitação inacabada. */
function documentDigits(document: string | null): string | null {
  const digits = (document ?? '').replace(/\D/g, '')
  return digits.length === 11 || digits.length === 14 ? digits : null
}

/** Caixa, acento e espaço repetido não distinguem duas pessoas. */
function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}
