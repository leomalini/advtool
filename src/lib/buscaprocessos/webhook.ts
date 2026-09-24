// Server-side. O client vem de quem chama: `service_role` no endpoint real
// (webhook não tem sessão) e também no disparador de teste.
import type { SupabaseClient } from '@supabase/supabase-js'
import { movementHash } from './hashes'
import { toIsoDate } from './dates'
import {
  intimacaoToPublicationRow,
  movimentacaoToPublicationRow,
  diarioCnj,
  diarioToPublicationRow,
} from './mapPublicacao'
import { ingestPublications } from '@/lib/publicacoes/ingest'
import type {
  BpIntimacao,
  BpMovimentacao,
  BpWebhookPayload,
  BpWebhookMovimentacaoData,
  BpWebhookDiarioData,
} from './types'

/**
 * O que o webhook da BuscaProcessos faz com o que chega — fora da rota.
 *
 * Está aqui, e não no route handler, por dois motivos: a tela de Configurações
 * precisa executar exatamente este caminho para simular uma entrega, e o modo
 * `dryRun` só faz sentido se houver um lugar único onde a decisão é tomada sem
 * ser gravada.
 *
 * ⚠️ O CORPO DO WEBHOOK NÃO TEM A FORMA DOS ENDPOINTS REST — ver o bloco de
 * webhooks em `types.ts`. Os dois eventos reais são:
 *
 *  · `movimentacao_nova` — CNJ em `data.processo.numero_unico`, ato em
 *    `data.event_data`, data em 'dd/MM/yyyy'. Vai para a timeline do processo.
 *  · `diario_movimentacao_nova` — publicação do monitoramento por OAB/termo.
 *    CNJ em `data.movimentacao.processo.numero_novo`, conteúdo em HTML, tipo em
 *    `tipo`. Vai para Publicações.
 *
 * Uma versão anterior deste arquivo modelou os dois a partir do OpenAPI dos
 * endpoints `GET /v1/...`, onde nada disso tem esse nome. O resultado é o pior
 * modo de falha possível: o endpoint responde 200, o registro diz `ignored`, e
 * nenhuma intimação chega — sem erro em lugar nenhum.
 */

export type WebhookStatus =
  | 'processed'
  | 'duplicate'
  | 'ignored'
  | 'unmatched'
  | 'error'

export interface WebhookDestination {
  table: 'publications' | 'legal_process_movements'
  /** Null quando `dryRun`: a linha não chegou a existir. */
  id: string | null
  action: 'inserted' | 'duplicate' | 'existing_source' | 'invalid'
  /** Rota interna para conferir o resultado na tela. */
  link?: string | null
  detail?: string
}

export interface WebhookHandleResult {
  event: string | null
  status: WebhookStatus
  destinations: WebhookDestination[]
  reason?: string
  error?: string
}

export interface WebhookHandleOptions {
  /** Decide tudo e devolve os destinos, sem gravar nada. */
  dryRun?: boolean
  /** Cabeçalho `x-buscaprocessos-event`, que tem precedência sobre o corpo. */
  eventOverride?: string | null
}

/** Ato num processo monitorado → timeline. 'nova_movimentacao' fica aceito
 * porque é o nome que o OpenAPI documenta; o corpo real usa o outro. */
const MOVEMENT_EVENTS = new Set(['movimentacao_nova', 'nova_movimentacao'])

/** Publicação em diário do monitoramento por OAB/termo → Publicações. */
const DIARIO_EVENTS = new Set([
  'diario_movimentacao_nova',
  'nova_intimacao',
  'intimacao_nova',
  'nova_publicacao',
])

/**
 * Eventos que este módulo trata — o resto termina em `ignored`.
 *
 * Exportado para o reprocessamento: uma entrega recusada de `processo_verificado`
 * não tem o que recuperar, e reenviá-la só produziria mais uma linha `ignored`.
 * A fila de pendentes é filtrada por esta lista, então ela nunca diverge do que
 * o handler realmente sabe fazer.
 */
export const HANDLED_WEBHOOK_EVENTS: readonly string[] = [...DIARIO_EVENTS, ...MOVEMENT_EVENTS]

export async function handleBpWebhook(
  supabase: SupabaseClient,
  payload: BpWebhookPayload,
  options: WebhookHandleOptions = {},
): Promise<WebhookHandleResult> {
  const dryRun = options.dryRun ?? false
  // O corpo real é PLANO: `movimentacao`, `monitoramento`, `processo` e
  // `event_data` chegam no topo, sem envelope `data` — nenhuma das entregas
  // registradas em `webhook_events` tem esse campo. As duas formas são aceitas
  // porque uma reentrega manual do formato documentado continua válida, e porque
  // exigir `data` é o que fazia toda entrega real cair em `ignored`.
  const data = (payload.data ?? payload) as unknown as Record<string, unknown>

  // `data.event` repete o do envelope. Vale como último recurso: numa
  // reentrega manual o cabeçalho pode não vir.
  const event =
    options.eventOverride ||
    payload.event ||
    (typeof data['event'] === 'string' ? (data['event'] as string) : null)

  const base: WebhookHandleResult = { event, status: 'ignored', destinations: [] }

  if (event && DIARIO_EVENTS.has(event)) {
    return handleDiario(supabase, base, data, payload, dryRun)
  }

  if (event && MOVEMENT_EVENTS.has(event)) {
    return handleMovimentacao(supabase, base, data as BpWebhookMovimentacaoData, payload, dryRun)
  }

  return { ...base, reason: `Evento sem tratamento: ${event ?? 'ausente'}.` }
}

// ── diario_movimentacao_nova → publicações ────────────────────────────────────

async function handleDiario(
  supabase: SupabaseClient,
  base: WebhookHandleResult,
  data: Record<string, unknown>,
  payload: BpWebhookPayload,
  dryRun: boolean,
): Promise<WebhookHandleResult> {
  const movimentacao = (data as BpWebhookDiarioData).movimentacao

  if (movimentacao && (movimentacao.conteudo || movimentacao.id != null)) {
    const cnj = diarioCnj(movimentacao)
    const legalProcessId = cnj ? await findProcessIdByCnj(supabase, cnj) : null
    const row = diarioToPublicationRow(movimentacao, legalProcessId)

    return ingestAsPublication(supabase, base, row, legalProcessId, dryRun)
  }

  // Fallback: corpo no formato de /v1/intimacoes. A API não documenta um
  // evento assim, mas reconhecer pelo formato custa pouco e evita descartar
  // uma intimação por causa de uma mudança de contrato.
  const intimacao = pickIntimacao(data)
  if (intimacao) {
    const cnj = intimacao.processo?.numeroCnj ?? null
    const legalProcessId = cnj ? await findProcessIdByCnj(supabase, cnj) : null
    const row = intimacaoToPublicationRow(intimacao, legalProcessId)

    return ingestAsPublication(supabase, base, row, legalProcessId, dryRun)
  }

  // Último recurso: forma de movimentação REST com `tipo_publicacao`.
  const movRest = pickMovimentacaoRest(data, payload.created_at)
  if (movRest?.conteudo) {
    const cnj = firstString(data, ['numeroCnj', 'numero_cnj', 'numero'])
    const legalProcessId = cnj ? await findProcessIdByCnj(supabase, cnj) : null
    const row = await movimentacaoToPublicationRow(movRest, { legalProcessId, cnj })

    return ingestAsPublication(supabase, base, row, legalProcessId, dryRun)
  }

  return { ...base, reason: 'Evento de diário sem movimentação reconhecível no corpo.' }
}

async function ingestAsPublication(
  supabase: SupabaseClient,
  base: WebhookHandleResult,
  row: Parameters<typeof ingestPublications>[1][number],
  legalProcessId: string | null,
  dryRun: boolean,
): Promise<WebhookHandleResult> {
  const ingest = await ingestPublications(supabase, [row], {
    dryRun,
    notify: !dryRun,
    notificationSource: 'webhook',
  })

  const destinations: WebhookDestination[] = ingest.outcomes.map((outcome) => ({
    table: 'publications',
    id: outcome.publicationId,
    action: outcome.action,
    link: outcome.publicationId ? `/publicacoes/${outcome.publicationId}` : null,
    detail: outcome.reason,
  }))

  const status: WebhookStatus =
    ingest.inserted > 0 ? 'processed' : ingest.duplicates > 0 ? 'duplicate' : 'ignored'

  // Publicação órfã não é falha: uma intimação de processo que o escritório
  // não acompanha é justamente a que não pode passar batido (migration 44).
  const reason = legalProcessId
    ? ingest.outcomes[0]?.reason
    : 'Publicação órfã: processo não cadastrado.'

  return { ...base, status, destinations, reason }
}

// ── movimentacao_nova → timeline do processo ──────────────────────────────────

async function handleMovimentacao(
  supabase: SupabaseClient,
  base: WebhookHandleResult,
  data: BpWebhookMovimentacaoData,
  payload: BpWebhookPayload,
  dryRun: boolean,
): Promise<WebhookHandleResult> {
  const record = data as unknown as Record<string, unknown>

  // O CNJ NÃO se chama `numeroCnj` no webhook: vem em processo.numero_unico.
  // As demais grafias ficam como tolerância a variação de contrato.
  const cnj =
    data.processo?.numero_unico?.trim() || firstString(record, ['numeroCnj', 'numero_cnj', 'numero'])

  if (!cnj) return { ...base, reason: 'Payload sem número CNJ.' }

  const eventData = data.event_data ?? null

  const movimentacao: BpMovimentacao = {
    // Normalizada aqui, e não lá embaixo: a data crua vem 'dd/MM/yyyy' e entra
    // tanto no cálculo de prazo quanto no hash de deduplicação.
    // Sem data em lugar nenhum, hoje: o motor de prazos recorta o ISO por
    // posição, e um `undefined` ali viraria `Date.UTC(NaN, …)` sem erro nenhum.
    data: toIsoDate(eventData?.data) ?? toIsoDate(payload.created_at) ?? todayIso(),
    conteudo: eventData?.conteudo ?? firstString(record, ['conteudo', 'descricao']) ?? null,
    classificacao_predita: null,
    // O webhook informa o tribunal no processo, não na movimentação.
    fonte: data.processo?.origem ? { sigla: data.processo.origem, grau: null } : null,
    tipo_publicacao: null,
  }

  if (!movimentacao.conteudo) {
    return { ...base, reason: 'Movimentação sem conteúdo.' }
  }

  const legalProcessId = await findProcessIdByCnj(supabase, cnj)

  // Movimentação exige processo: `legal_process_movements.legal_process_id` é
  // NOT NULL (migration 9), e criar um processo vazio para acomodar o evento
  // seria pior que registrar que ele não tem dono.
  if (!legalProcessId) {
    return { ...base, status: 'unmatched', reason: `Processo ${cnj} não está cadastrado.` }
  }

  return saveMovimentacao(supabase, base, movimentacao, { cnj, legalProcessId }, dryRun)
}

async function saveMovimentacao(
  supabase: SupabaseClient,
  base: WebhookHandleResult,
  movimentacao: BpMovimentacao,
  { cnj, legalProcessId }: { cnj: string; legalProcessId: string },
  dryRun: boolean,
): Promise<WebhookHandleResult> {
  // O MESMO hash de `syncMovimentacoes`, sobre a data JÁ normalizada: é o que
  // faz a movimentação que chega pelas duas portas ocupar uma linha só. O REST
  // devolve 'yyyy-MM-dd'; sem normalizar, '26/05/2026' geraria outro hash.
  const externalHash = await movementHash(movimentacao)

  const { data: existing } = await supabase
    .from('legal_process_movements')
    .select('id')
    .eq('legal_process_id', legalProcessId)
    .eq('external_hash', externalHash)
    .maybeSingle()

  if (existing) {
    return {
      ...base,
      status: 'duplicate',
      destinations: [
        {
          table: 'legal_process_movements',
          id: existing.id as string,
          action: 'existing_source',
          link: `/processos/${legalProcessId}`,
          detail: 'Movimentação já registrada.',
        },
      ],
    }
  }

  const destination: WebhookDestination = {
    table: 'legal_process_movements',
    id: null,
    action: 'inserted',
    link: `/processos/${legalProcessId}`,
  }

  if (dryRun) return { ...base, status: 'processed', destinations: [destination] }

  const { data: inserted, error } = await supabase
    .from('legal_process_movements')
    .upsert(
      {
        legal_process_id: legalProcessId,
        movement_date: movimentacao.data,
        description: movimentacao.conteudo ?? 'Movimentação sem conteúdo',
        title: movimentacao.classificacao_predita?.nome ?? null,
        kind: 'movimentacao',
        source: 'busca_processos',
        external_hash: externalHash,
        raw_data: movimentacao,
      },
      { onConflict: 'legal_process_id,external_hash', ignoreDuplicates: true },
    )
    .select('id')

  if (error) throw new Error(`Gravação da movimentação falhou: ${error.message}`)

  const id = (inserted?.[0]?.id as string | undefined) ?? null

  // Sem linha de volta: outra ingestão gravou a mesma movimentação no intervalo.
  if (!id) {
    return {
      ...base,
      status: 'duplicate',
      destinations: [{ ...destination, action: 'existing_source' }],
    }
  }

  await notifyMovimentacao(supabase, {
    legalProcessId,
    movementId: id,
    title: movimentacao.classificacao_predita?.nome ?? null,
    cnj,
    description: movimentacao.conteudo ?? null,
  })

  return { ...base, status: 'processed', destinations: [{ ...destination, id }] }
}

/** Best-effort, como os avisos de publicação: perder o aviso não desfaz o ato. */
async function notifyMovimentacao(
  supabase: SupabaseClient,
  input: {
    legalProcessId: string
    movementId: string
    title: string | null
    cnj: string | null
    description: string | null
  },
): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    kind: 'movimentacao_nova',
    resource: 'processos',
    title: 'Nova movimentação',
    body: [input.cnj, input.title ?? input.description?.slice(0, 120)].filter(Boolean).join(' — '),
    link: `/processos/${input.legalProcessId}`,
    entity_type: 'legal_process_movement',
    entity_id: input.movementId,
    source: 'webhook',
  })

  if (error) console.error('[buscaprocessos/webhook] aviso não gravado:', error.message)
}

// ── Auxiliares ────────────────────────────────────────────────────────────────

async function findProcessIdByCnj(
  supabase: SupabaseClient,
  cnj: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('legal_processes')
    .select('id')
    .eq('cnj_number', cnj)
    .maybeSingle()

  return (data?.id as string | undefined) ?? null
}

/** 'yyyy-MM-dd' de hoje — último recurso para um evento que chega sem data. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

/** Corpo no formato de /v1/intimacoes, reconhecido pela forma. */
function pickIntimacao(data: Record<string, unknown>): BpIntimacao | null {
  const candidate = (data['intimacao'] ?? data) as Record<string, unknown>
  const looksRight =
    typeof candidate['dataPublicacao'] === 'string' ||
    typeof candidate['conteudoCompletoHtml'] === 'string'

  return looksRight ? (candidate as unknown as BpIntimacao) : null
}

/** Corpo no formato de /v1/processos/{cnj}/movimentacoes. */
function pickMovimentacaoRest(
  data: Record<string, unknown>,
  fallbackDate: string | null | undefined,
): BpMovimentacao | null {
  const record = (data['movimentacao'] ?? data['movimento']) as
    | Record<string, unknown>
    | undefined
  if (!record) return null

  const fonte = record['fonte'] as { sigla?: string | null; grau?: string | null } | null | undefined

  return {
    data: toIsoDate(record['data']) ?? toIsoDate(fallbackDate) ?? todayIso(),
    conteudo: firstString(record, ['conteudo', 'descricao', 'texto']),
    classificacao_predita:
      (record['classificacao_predita'] as BpMovimentacao['classificacao_predita']) ?? null,
    fonte: fonte ? { sigla: fonte.sigla ?? null, grau: fonte.grau ?? null } : null,
    tipo_publicacao: firstString(record, ['tipo_publicacao', 'tipoPublicacao']),
  }
}
