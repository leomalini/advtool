// Server-side. Recebe o client de quem chama — o script de importação usa o de
// service_role, porque não tem sessão.
import type { SupabaseClient } from '@supabase/supabase-js'
import { BpApiError, BpPendingError, getProcessoByCnj } from '@/lib/buscaprocessos/client'
import { awaitPending } from '@/lib/buscaprocessos/awaitPending'
import { toLookupResult } from '@/lib/buscaprocessos/mapCapa'
import {
  BLOCK_COST,
  syncProcessoFromBp,
  type SyncBlock,
  type SyncResult,
} from '@/lib/buscaprocessos/sync'
import {
  linkOfficeClientsOnProcess,
  type OfficeClientsResult,
  type OfficeOabs,
} from '@/lib/clientes/officeClients'
import type { BpCnjLookupData } from '@/lib/buscaprocessos/types'
import type { CnjLookupResult, LegalProcessPartyInput } from '@/types/legalProcess.types'
import { formatCnjNumber } from '@/utils/cnj'

/**
 * Importação em lote dos processos das OABs do escritório (docs/importacao-oab.md).
 *
 * Faz o mesmo que o cadastro manual — processo, card no quadro de Processos,
 * partes, cliente automático, movimentações e publicações —, mas sem tela e
 * pelo client de service_role. `createLegalProcess` não serve aqui: ele usa o
 * client do navegador e a sessão de quem clicou.
 *
 * A capa vem PRIMEIRO, e só com ela na mão o processo é criado. Se a consulta
 * falhar ou ficar em processamento, nada é gravado e a próxima rodada tenta de
 * novo: não sobra processo pela metade, sem partes nem cliente.
 */

/** Capa e movimentações. Documentos públicos ficam para o primeiro "Atualizar"
 * do processo, que já os busca quando o bloco não tem carimbo. */
export const IMPORT_BLOCKS = ['capa', 'movimentacoes'] as const satisfies readonly SyncBlock[]

/** R$ 0,24 — preço-base de tabela, para estimar; não é fatura. */
export const NEW_PROCESS_COST = IMPORT_BLOCKS.reduce((sum, block) => sum + BLOCK_COST[block], 0)

/** O que falta a um processo cuja importação parou depois da capa. */
export const COMPLETION_COST = BLOCK_COST.movimentacoes

const PROCESS_WORKFLOW_ID = 'wf-processos'

/** Marca no feed de atividades: é por ela que se sabe de onde o processo veio. */
const ACTIVITY_ORIGIN = 'oab_import'

export function cnjDigits(cnj: string): string {
  return cnj.replace(/\D/g, '')
}

// ── Base atual ────────────────────────────────────────────────────────────────

export interface ExistingProcess {
  id: string
  cnj: string
  capaSynced: boolean
  movementsSynced: boolean
}

/**
 * Todos os processos da base, pelos dígitos do CNJ.
 *
 * Por dígitos porque o CNJ chega formatado de um jeito na listagem e pode estar
 * gravado de outro; comparar a string faria o mesmo processo entrar duas vezes.
 */
export async function loadExistingProcesses(
  supabase: SupabaseClient,
): Promise<Map<string, ExistingProcess>> {
  const found = new Map<string, ExistingProcess>()
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('legal_processes')
      .select('id, cnj_number, capa_synced_at, movements_synced_at')
      .order('id')
      .range(from, from + pageSize - 1)

    if (error) throw new Error(`Leitura dos processos da base falhou: ${error.message}`)

    for (const row of data ?? []) {
      const cnj = (row.cnj_number as string | null) ?? ''
      const digits = cnjDigits(cnj)
      if (!digits) continue
      found.set(digits, {
        id: row.id as string,
        cnj,
        capaSynced: Boolean(row.capa_synced_at),
        movementsSynced: Boolean(row.movements_synced_at),
      })
    }

    if ((data ?? []).length < pageSize) break
  }

  return found
}

/**
 * Importação interrompida: a capa foi gravada, as movimentações não.
 *
 * O cadastro desta importação sempre carimba a capa antes de buscar as
 * movimentações, então é esse o rastro que ela deixa quando para no meio. Um
 * processo cadastrado à mão sem consulta nenhuma não tem nenhum dos dois
 * carimbos — e não é tocado.
 */
export function needsCompletion(process: ExistingProcess): boolean {
  return process.capaSynced && !process.movementsSynced
}

/** Primeira etapa do quadro de Processos ("Cadastro"), lida do banco. */
export async function firstProcessColumnId(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from('workflow_columns')
    .select('id')
    .eq('workflow_id', PROCESS_WORKFLOW_ID)
    .order('posicao')
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Leitura das etapas de Processos falhou: ${error.message}`)
  if (!data) throw new Error(`O quadro ${PROCESS_WORKFLOW_ID} não tem etapas.`)
  return data.id as string
}

// ── Importação ────────────────────────────────────────────────────────────────

export interface ImportTarget {
  cnj: string
  /** Inscrição que trouxe o processo, no formato de `oabKey` ('ES:35520'). */
  oabKey: string
  /** Perfil do advogado dessa inscrição: responsável pelo card e autor do cadastro. */
  lawyerProfileId: string
  /** Classe vinda da listagem — título reserva quando a capa vier sem classe. */
  listedClass?: string | null
}

export interface ImportContext {
  columnId: string
  officeOabs: OfficeOabs
}

export type ImportOutcome =
  | {
      kind: 'imported'
      cnj: string
      legalProcessId: string
      sync: SyncResult
      clients: OfficeClientsResult | null
      linkedPublications: number
      estimatedCost: number
      warnings: string[]
    }
  | {
      kind: 'completed'
      cnj: string
      legalProcessId: string
      sync: SyncResult
      clients: OfficeClientsResult | null
      estimatedCost: number
      warnings: string[]
    }
  /** A capa saiu por 202 e não ficou pronta a tempo. Nada foi gravado. */
  | { kind: 'pending'; cnj: string; message: string; estimatedCost: number }
  | {
      kind: 'failed'
      cnj: string
      message: string
      /** Status HTTP da BuscaProcessos, quando a falha veio dela. */
      apiStatus: number | null
      estimatedCost: number
    }

/** Cadastra um processo que ainda não existe na base. */
export async function importNewProcess(
  supabase: SupabaseClient,
  target: ImportTarget,
  context: ImportContext,
): Promise<ImportOutcome> {
  let capa: CnjLookupResult
  try {
    const { data } = await awaitPending<BpCnjLookupData>(() => getProcessoByCnj(target.cnj))
    capa = toLookupResult(data)
  } catch (err) {
    if (err instanceof BpPendingError) {
      return {
        kind: 'pending',
        cnj: target.cnj,
        message: err.message,
        estimatedCost: BLOCK_COST.capa,
      }
    }
    return failure(target.cnj, err, 0)
  }

  // Com máscara, como o formulário grava: o vínculo das publicações órfãs e a
  // busca por CNJ comparam a string exata.
  const cnj = formatCnjNumber(capa.cnj_number || target.cnj)
  let legalProcessId: string
  try {
    legalProcessId = await insertProcess(supabase, cnj, capa, target, context)
  } catch (err) {
    return failure(cnj, err, BLOCK_COST.capa)
  }

  const warnings: string[] = []
  await recordCreation(supabase, legalProcessId, cnj, target, warnings)

  // A capa acabou de ser gravada no insert: `assumeFresh` só carimba, sem
  // pagar de novo. As movimentações são a única consulta desta etapa.
  const sync = await runSync(supabase, legalProcessId, cnj, ['capa'])
  warnings.push(...describeSyncProblems(sync))

  const clients = await registerClients(supabase, legalProcessId, cnj, context, warnings)
  const linkedPublications = await linkOrphanPublications(supabase, cnj, legalProcessId, warnings)

  return {
    kind: 'imported',
    cnj,
    legalProcessId,
    sync,
    clients,
    linkedPublications,
    estimatedCost: BLOCK_COST.capa + sync.estimatedCost,
    warnings,
  }
}

/** Termina um processo cuja importação parou depois da capa. */
export async function completeProcess(
  supabase: SupabaseClient,
  existing: ExistingProcess,
  context: ImportContext,
): Promise<ImportOutcome> {
  const sync = await runSync(supabase, existing.id, existing.cnj, [])
  const warnings = describeSyncProblems(sync)
  const clients = await registerClients(supabase, existing.id, existing.cnj, context, warnings)

  return {
    kind: 'completed',
    cnj: existing.cnj,
    legalProcessId: existing.id,
    sync,
    clients,
    estimatedCost: sync.estimatedCost,
    warnings,
  }
}

/**
 * `syncProcessoFromBp` já isola a falha de cada bloco; só lança quando não
 * consegue nem ler o processo. Isso também vira falha de bloco aqui, para um
 * processo com problema não derrubar o lote.
 */
async function runSync(
  supabase: SupabaseClient,
  legalProcessId: string,
  cnj: string,
  assumeFresh: SyncBlock[],
): Promise<SyncResult> {
  try {
    return await syncProcessoFromBp(supabase, {
      legalProcessId,
      cnj,
      blocks: IMPORT_BLOCKS,
      assumeFresh,
      markPublicationsHandled: true,
    })
  } catch (err) {
    return {
      synced: [],
      skipped: [],
      pending: [],
      failed: IMPORT_BLOCKS.map((block) => ({ block, message: errorMessage(err) })),
      estimatedCost: 0,
    }
  }
}

// ── Gravação ──────────────────────────────────────────────────────────────────

/**
 * Processo, partes e card, nessa ordem. Se partes ou card falharem, o processo
 * é apagado: um processo sem card não aparece no quadro, e a próxima rodada o
 * pularia como "já cadastrado".
 */
async function insertProcess(
  supabase: SupabaseClient,
  cnj: string,
  capa: CnjLookupResult,
  target: ImportTarget,
  context: ImportContext,
): Promise<string> {
  const { data: created, error } = await supabase
    .from('legal_processes')
    .insert({
      cnj_number: cnj,
      court: capa.court,
      court_division: capa.court_division,
      plaintiff: capa.plaintiff,
      defendant: capa.defendant,
      subject: capa.subject,
      procedural_class: capa.procedural_class,
      case_value: capa.case_value,
      filing_date: capa.filing_date,
      // `status` tem NOT NULL com default: só entra quando a capa soube dizer.
      ...(capa.status ? { status: capa.status } : {}),
    })
    .select('id')
    .single()

  if (error) throw new Error(`Gravação do processo falhou: ${error.message}`)
  const legalProcessId = created.id as string

  try {
    await insertParties(supabase, legalProcessId, capa.parties, context.officeOabs)

    const { data: item, error: itemError } = await supabase
      .from('crm_items')
      .insert({
        // Mesma regra da importação pela busca por documento: sem título, todos
        // os cards do lote sairiam iguais.
        title: capa.procedural_class ?? target.listedClass ?? cnj,
        client_id: null,
        column_id: context.columnId,
        assigned_to: target.lawyerProfileId,
        tags: [],
        next_deadline: null,
        workflow_id: PROCESS_WORKFLOW_ID,
        legal_process_id: legalProcessId,
        created_by: target.lawyerProfileId,
      })
      .select('id')
      .single()

    if (itemError) throw new Error(`Gravação do card do processo falhou: ${itemError.message}`)

    const { error: historyError } = await supabase.from('crm_item_column_history').insert({
      crm_item_id: item.id,
      from_column_id: context.columnId,
      to_column_id: context.columnId,
      moved_by: target.lawyerProfileId,
    })
    if (historyError) {
      console.error('[importacao-oab] histórico da etapa não gravado:', historyError.message)
    }
  } catch (err) {
    const { error: rollbackError } = await supabase
      .from('legal_processes')
      .delete()
      .eq('id', legalProcessId)
    if (rollbackError) {
      console.error(
        `[importacao-oab] processo ${cnj} ficou sem card e não pôde ser apagado:`,
        rollbackError.message,
      )
    }
    throw err
  }

  return legalProcessId
}

/**
 * As partes da capa, já ligadas a quem tem o mesmo CPF/CNPJ na base.
 *
 * Menos as partes que o escritório representa: essas ficam soltas de propósito
 * para o cadastro automático (`linkOfficeClientsOnProcess`), que só olha parte
 * sem vínculo. Ligadas aqui, ele as pularia — a pessoa não viraria cliente e o
 * processo ficaria sem cliente no cabeçalho.
 */
async function insertParties(
  supabase: SupabaseClient,
  legalProcessId: string,
  parties: LegalProcessPartyInput[],
  officeOabs: OfficeOabs,
): Promise<void> {
  const named = parties.filter((party) => party.name.trim())
  if (named.length === 0) return

  const known = await findPeopleByDocument(
    supabase,
    named.filter((party) => !representedByOffice(party, officeOabs)).map((party) => party.document),
  )

  const { error } = await supabase.from('legal_process_parties').insert(
    named.map((party, index) => ({
      legal_process_id: legalProcessId,
      name: party.name,
      document: party.document ?? null,
      polo: party.polo,
      party_type: party.party_type ?? null,
      position: party.position ?? index,
      client_id: representedByOffice(party, officeOabs)
        ? null
        : (known.get(documentDigits(party.document) ?? '') ?? null),
      lawyer_oabs: party.lawyer_oabs ?? [],
    })),
  )
  if (error) throw new Error(`Gravação das partes falhou: ${error.message}`)
}

function representedByOffice(party: LegalProcessPartyInput, officeOabs: OfficeOabs): boolean {
  return (party.lawyer_oabs ?? []).some((key) => officeOabs.has(key))
}

/** CPF/CNPJ → id em `clients` (cliente ou pessoa, migration 78). */
async function findPeopleByDocument(
  supabase: SupabaseClient,
  documents: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const digits = [
    ...new Set(documents.map(documentDigits).filter((value): value is string => Boolean(value))),
  ]
  const found = new Map<string, string>()
  if (digits.length === 0) return found

  const list = digits.join(',')
  const { data, error } = await supabase
    .from('clients')
    .select('id, cpf_digits, cnpj_digits')
    .or(`cpf_digits.in.(${list}),cnpj_digits.in.(${list})`)

  // Vínculo é conveniência: sem ele a parte fica solta e a tela oferece o
  // "Vincular ou cadastrar", como hoje.
  if (error) {
    console.error('[importacao-oab] busca de pessoas por documento falhou:', error.message)
    return found
  }

  for (const row of data ?? []) {
    if (row.cpf_digits) found.set(row.cpf_digits as string, row.id as string)
    if (row.cnpj_digits) found.set(row.cnpj_digits as string, row.id as string)
  }
  return found
}

/** Só CPF (11) ou CNPJ (14) contam. */
function documentDigits(document: string | null | undefined): string | null {
  const digits = (document ?? '').replace(/\D/g, '')
  return digits.length === 11 || digits.length === 14 ? digits : null
}

/** Entrada no feed de atividades, como o cadastro manual grava. Best-effort. */
async function recordCreation(
  supabase: SupabaseClient,
  legalProcessId: string,
  cnj: string,
  target: ImportTarget,
  warnings: string[],
): Promise<void> {
  const { error } = await supabase.from('activities').insert({
    type: 'legal_process_created',
    entity_type: 'legal_process',
    entity_id: legalProcessId,
    entity_title: cnj,
    actor_id: target.lawyerProfileId,
    metadata: { origin: ACTIVITY_ORIGIN, oab: target.oabKey },
  })
  if (error) warnings.push(`Atividade não registrada: ${error.message}`)
}

/** Cliente automático pelo CPF/CNPJ, sem aviso no sino. Best-effort. */
async function registerClients(
  supabase: SupabaseClient,
  legalProcessId: string,
  cnj: string,
  context: ImportContext,
  warnings: string[],
): Promise<OfficeClientsResult | null> {
  try {
    return await linkOfficeClientsOnProcess(supabase, legalProcessId, {
      source: 'sync',
      cnj,
      officeOabs: context.officeOabs,
      notify: false,
    })
  } catch (err) {
    warnings.push(`Cadastro automático do cliente falhou: ${errorMessage(err)}`)
    return null
  }
}

/** Publicações que chegaram antes do processo existir passam a apontar para ele. */
async function linkOrphanPublications(
  supabase: SupabaseClient,
  cnj: string,
  legalProcessId: string,
  warnings: string[],
): Promise<number> {
  const { data, error } = await supabase
    .from('publications')
    .update({ legal_process_id: legalProcessId })
    .eq('cnj_number', cnj)
    .is('legal_process_id', null)
    .select('id')

  if (error) {
    warnings.push(`Vínculo das publicações órfãs falhou: ${error.message}`)
    return 0
  }
  return data?.length ?? 0
}

// ── Apoio ─────────────────────────────────────────────────────────────────────

function describeSyncProblems(sync: SyncResult): string[] {
  return [
    ...sync.failed.map(({ block, message }) => `${block}: ${message}`),
    ...sync.pending.map((block) => `${block}: ainda em processamento — rode de novo para completar`),
  ]
}

function failure(cnj: string, err: unknown, estimatedCost: number): ImportOutcome {
  return {
    kind: 'failed',
    cnj,
    message: errorMessage(err),
    apiStatus: err instanceof BpApiError ? err.status : null,
    estimatedCost,
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Falha inesperada.'
}
