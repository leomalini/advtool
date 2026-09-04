// Server-side only — usa a API key da BuscaProcessos.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getProcessoByCnj,
  getMovimentacoesByCnj,
  getDocumentosPublicos,
  getResumoIa,
  BpApiError,
  BpPendingError,
} from './client'
import { toLookupResult } from './mapCapa'
import { movementHash } from './hashes'
import { movimentacaoToPublicationRow } from './mapPublicacao'
import { ingestPublications } from '@/lib/publicacoes/ingest'
import type { BpDocumentoPublico, BpMovimentacao } from './types'

/**
 * Popula um processo com os dados da BuscaProcessos e grava tudo localmente.
 *
 * Cada bloco é uma consulta cobrada — capa R$ 0,12, movimentações R$ 0,12,
 * documentos públicos R$ 0,25, resumo por IA R$ 0,12. Por isso a sincronização
 * é idempotente por carimbo: bloco já sincronizado é pulado, e só volta a ser
 * consultado com `force`. A tela lê do banco, nunca da API.
 */

export const SYNC_BLOCKS = ['capa', 'movimentacoes', 'documentos', 'resumo_ia'] as const
export type SyncBlock = (typeof SYNC_BLOCKS)[number]

/** Preço-base por consulta, em BRL, conforme a tabela da API. Serve para
 * informar o custo estimado, não para faturar. */
export const BLOCK_COST: Record<SyncBlock, number> = {
  capa: 0.12,
  movimentacoes: 0.12,
  documentos: 0.25,
  resumo_ia: 0.12,
}

/** Coluna de carimbo de cada bloco em `legal_processes`. */
const SYNCED_AT_COLUMN: Record<SyncBlock, string> = {
  capa: 'capa_synced_at',
  movimentacoes: 'movements_synced_at',
  documentos: 'documents_synced_at',
  resumo_ia: 'ai_summary_synced_at',
}

export interface SyncResult {
  /** Consultados agora e gravados. */
  synced: SyncBlock[]
  /** Já estavam em cache — nenhuma consulta feita, nenhum crédito gasto. */
  skipped: SyncBlock[]
  /** A API respondeu 202: o resultado sai depois, sincronize de novo. */
  pending: SyncBlock[]
  failed: { block: SyncBlock; message: string }[]
  /** Soma dos preços-base dos blocos efetivamente consultados. */
  estimatedCost: number
}

interface SyncInput {
  legalProcessId: string
  cnj: string
  blocks?: readonly SyncBlock[]
  /**
   * Blocos cujo dado acabou de ser obtido por outro caminho — carimba sem
   * consultar a API.
   *
   * O caso real é a capa: a busca automática do formulário já consultou
   * `/processos/cnj/{cnj}` para preencher os campos, e os valores foram
   * gravados no insert. Consultar de novo aqui pagaria R$ 0,12 pelo mesmo dado
   * e ainda sobrescreveria o que a pessoa tivesse corrigido à mão antes de
   * salvar.
   */
  assumeFresh?: readonly SyncBlock[]
  /** `true` força todos; uma lista força só os blocos citados. Cada bloco
   * forçado é uma consulta cobrada. */
  force?: boolean | readonly SyncBlock[]
}

export async function syncProcessoFromBp(
  supabase: SupabaseClient,
  { legalProcessId, cnj, blocks = SYNC_BLOCKS, force = false, assumeFresh = [] }: SyncInput,
): Promise<SyncResult> {
  const result: SyncResult = {
    synced: [],
    skipped: [],
    pending: [],
    failed: [],
    estimatedCost: 0,
  }

  const { data: row, error } = await supabase
    .from('legal_processes')
    .select('capa_synced_at, movements_synced_at, documents_synced_at, ai_summary_synced_at')
    .eq('id', legalProcessId)
    .single()

  if (error) throw new Error(`Processo não encontrado no banco: ${error.message}`)

  const alreadySynced = (block: SyncBlock) =>
    Boolean((row as Record<string, string | null>)[SYNCED_AT_COLUMN[block]])

  const forced = (block: SyncBlock) =>
    force === true || (Array.isArray(force) && force.includes(block))

  for (const block of blocks) {
    // Dado recém-obtido fora daqui: só o carimbo, sem consulta.
    if (!forced(block) && assumeFresh.includes(block)) {
      await stamp(supabase, legalProcessId, block)
      result.skipped.push(block)
      continue
    }

    if (!forced(block) && alreadySynced(block)) {
      result.skipped.push(block)
      continue
    }

    try {
      await runBlock(supabase, block, legalProcessId, cnj)
      result.synced.push(block)
      result.estimatedCost += BLOCK_COST[block]
    } catch (err) {
      // 202 não é falha: a consulta segue em segundo plano e o carimbo não é
      // gravado, então a próxima sincronização tenta de novo.
      if (err instanceof BpPendingError) {
        result.pending.push(block)
        result.estimatedCost += BLOCK_COST[block]
        continue
      }
      // Um bloco que falha não derruba os outros: melhor um processo com capa
      // e movimentações do que nenhum dado porque o resumo por IA caiu.
      const message = err instanceof BpApiError ? err.message : 'Falha inesperada'
      if (!(err instanceof BpApiError)) console.error(`[bp/sync] ${block}:`, err)
      result.failed.push({ block, message })
    }
  }

  return result
}

async function runBlock(
  supabase: SupabaseClient,
  block: SyncBlock,
  legalProcessId: string,
  cnj: string,
): Promise<void> {
  if (block === 'capa') return syncCapa(supabase, legalProcessId, cnj)
  if (block === 'movimentacoes') return syncMovimentacoes(supabase, legalProcessId, cnj)
  if (block === 'documentos') return syncDocumentos(supabase, legalProcessId, cnj)
  return syncResumoIa(supabase, legalProcessId, cnj)
}

/** Marca o bloco como sincronizado junto com os dados que ele trouxe. */
async function stamp(
  supabase: SupabaseClient,
  legalProcessId: string,
  block: SyncBlock,
  patch: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase
    .from('legal_processes')
    .update({ ...patch, [SYNCED_AT_COLUMN[block]]: new Date().toISOString() })
    .eq('id', legalProcessId)

  if (error) throw new Error(`Gravação de ${block} falhou: ${error.message}`)
}

// ── Capa ──────────────────────────────────────────────────────────────────────

async function syncCapa(
  supabase: SupabaseClient,
  legalProcessId: string,
  cnj: string,
): Promise<void> {
  const { data } = await getProcessoByCnj(cnj)
  const capa = toLookupResult(data)

  await stamp(supabase, legalProcessId, 'capa', {
    court: capa.court,
    court_division: capa.court_division,
    plaintiff: capa.plaintiff,
    defendant: capa.defendant,
    subject: capa.subject,
    procedural_class: capa.procedural_class,
    case_value: capa.case_value,
    filing_date: capa.filing_date,
    // `status` tem NOT NULL com default: só sobrescreve quando a API soube dizer.
    ...(capa.status ? { status: capa.status } : {}),
  })

  if (capa.parties.length === 0) return

  // A API é a fonte das partes: substitui a lista inteira, senão uma segunda
  // sincronização duplicaria todo mundo.
  await supabase.from('legal_process_parties').delete().eq('legal_process_id', legalProcessId)

  const { error } = await supabase.from('legal_process_parties').insert(
    capa.parties.map((party) => ({
      legal_process_id: legalProcessId,
      name: party.name,
      document: party.document ?? null,
      polo: party.polo,
      party_type: party.party_type ?? null,
      position: party.position,
    })),
  )
  if (error) throw new Error(`Gravação das partes falhou: ${error.message}`)
}

// ── Movimentações ─────────────────────────────────────────────────────────────

async function syncMovimentacoes(
  supabase: SupabaseClient,
  legalProcessId: string,
  cnj: string,
): Promise<void> {
  const { data } = await getMovimentacoesByCnj(cnj, 100)
  const movimentacoes = data.movimentacoes ?? []

  // `tipo_publicacao` preenchido = a origem é diário oficial, ou seja, é uma
  // publicação. Ela vai para o módulo de Publicações, e não para a timeline do
  // processo: a mesma publicação em duas tabelas teria dois `read_at` e dois
  // `handled_at`, e tratar num lugar deixaria o outro dizendo que falta tratar.
  const publicacoes = movimentacoes.filter((mov) => Boolean(mov.tipo_publicacao))
  const andamentos = movimentacoes.filter((mov) => !mov.tipo_publicacao)

  if (andamentos.length > 0) {
    const rows = await Promise.all(
      andamentos.map(async (mov) => ({
        legal_process_id: legalProcessId,
        movement_date: mov.data,
        description: mov.conteudo ?? 'Movimentação sem conteúdo',
        title: mov.classificacao_predita?.nome ?? null,
        kind: 'movimentacao',
        source: 'busca_processos',
        external_hash: await movementHash(mov),
        raw_data: mov,
      })),
    )

    // ignoreDuplicates: o índice único (legal_process_id, external_hash) recusa
    // o que já existe em vez de reescrever — reescrever apagaria `read_at` e
    // `handled_at` de um item que a pessoa já tratou.
    const { error } = await supabase
      .from('legal_process_movements')
      .upsert(rows, { onConflict: 'legal_process_id,external_hash', ignoreDuplicates: true })

    if (error) throw new Error(`Gravação das movimentações falhou: ${error.message}`)
  }

  if (publicacoes.length > 0) {
    await savePublicacoesFromMovimentacoes(supabase, legalProcessId, cnj, publicacoes)
  }

  await stamp(supabase, legalProcessId, 'movimentacoes')
}

/**
 * Grava no módulo de Publicações as movimentações que são publicação de diário.
 *
 * É por aqui que a publicação entra ao CADASTRAR um processo — e por isso ela
 * passa pelo mesmo `ingestPublications` da busca por OAB e do webhook. Antes
 * cada caminho gravava por conta própria com um `external_id` diferente, então
 * a mesma publicação entrava uma vez por porta.
 */
async function savePublicacoesFromMovimentacoes(
  supabase: SupabaseClient,
  legalProcessId: string,
  cnj: string,
  movimentacoes: BpMovimentacao[],
): Promise<void> {
  const rows = await Promise.all(
    movimentacoes.map((mov) => movimentacaoToPublicationRow(mov, { legalProcessId, cnj })),
  )

  await ingestPublications(supabase, rows)
}

// ── Documentos públicos ───────────────────────────────────────────────────────

/** A API envia '2024-06-17 18:02:36' sem fuso. O carimbo é o relógio do
 * tribunal, em Brasília; rotulá-lo como UTC mostraria o ato 3 horas antes —
 * exatamente o defeito que a migration 33 corrigiu nos eventos. */
function toTimestamp(value: string | null): string | null {
  if (!value) return null
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) return value
  return `${value.replace(' ', 'T')}-03:00`
}

async function syncDocumentos(
  supabase: SupabaseClient,
  legalProcessId: string,
  cnj: string,
): Promise<void> {
  const { data } = await getDocumentosPublicos(cnj)
  const documentos: BpDocumentoPublico[] = data.documentos ?? []

  if (documentos.length > 0) {
    const { error } = await supabase.from('legal_process_public_documents').upsert(
      documentos.map((doc) => ({
        legal_process_id: legalProcessId,
        external_id: String(doc.id),
        title: doc.titulo ?? null,
        description: doc.descricao ?? null,
        document_date: toTimestamp(doc.data),
        doc_type: doc.tipo ?? null,
        file_extension: doc.extensaoArquivo ?? null,
        page_count: doc.quantidadePaginas ?? null,
        download_url: doc.downloadUrl ?? null,
        raw_data: doc,
      })),
      { onConflict: 'legal_process_id,external_id' },
    )

    if (error) throw new Error(`Gravação dos documentos falhou: ${error.message}`)
  }

  await stamp(supabase, legalProcessId, 'documentos')
}

// ── Resumo por IA ─────────────────────────────────────────────────────────────

async function syncResumoIa(
  supabase: SupabaseClient,
  legalProcessId: string,
  cnj: string,
): Promise<void> {
  const { data } = await getResumoIa(cnj)

  await stamp(supabase, legalProcessId, 'resumo_ia', {
    ai_summary: data.conteudo ?? null,
    ai_summary_updated_at: data.atualizadoEm ?? null,
  })
}
