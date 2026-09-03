// Server-side only — usa a API key da BuscaProcessos.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getIntimacoes } from './client'
import { htmlToText, excerptFrom } from './htmlToText'
import { deadlineStartFrom } from '@/lib/prazos'
import type { BpIntimacao, BpOabRef } from './types'

/**
 * Traz as publicações das OABs cadastradas e grava na tabela `publications`.
 *
 * As OABs vêm dos perfis (Configurações), não de uma lista à parte: quem é
 * advogado no escritório tem a inscrição no próprio cadastro, e manter duas
 * listas garantiria que uma delas ficasse desatualizada.
 *
 * Cobrado por OAB consultada (R$ 0,10) — por isso uma chamada só, com todas as
 * inscrições, em vez de uma por advogado.
 */

export interface IntimacoesSyncResult {
  /** Inscrições efetivamente consultadas. */
  oabs: string[]
  /** Publicações novas gravadas. */
  imported: number
  /** Já existiam — reimportação não duplica nem apaga o que foi lido. */
  skipped: number
  /** OABs sem monitoramento ativo na BuscaProcessos: não retornam nada até
   * serem cadastradas lá. */
  missingMonitorings: string[]
  estimatedCost: number
}

interface SyncInput {
  /** Janela inicial, 'yyyy-MM-dd'. Omitido, a API usa a janela corrente. */
  desde?: string
}

/** Perfil com inscrição completa. Sem UF não dá para montar UF:NÚMERO. */
interface ProfileOab {
  oab_number: string
  oab_state: string
}

export async function syncIntimacoes(
  supabase: SupabaseClient,
  { desde }: SyncInput = {},
): Promise<IntimacoesSyncResult> {
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('oab_number, oab_state')
    .not('oab_number', 'is', null)
    .not('oab_state', 'is', null)

  if (profilesError) throw new Error(`Leitura dos perfis falhou: ${profilesError.message}`)

  const oabs = dedupeOabs((profiles ?? []) as ProfileOab[])

  if (oabs.length === 0) {
    return {
      oabs: [],
      imported: 0,
      skipped: 0,
      missingMonitorings: [],
      estimatedCost: 0,
    }
  }

  const { data } = await getIntimacoes(oabs, desde)
  const intimacoes = data.intimacoes ?? []

  const result: IntimacoesSyncResult = {
    oabs: oabs.map((oab) => `${oab.estado}:${oab.numero}`),
    imported: 0,
    skipped: 0,
    missingMonitorings: (data.missingMonitorings ?? []).map((oab) => `${oab.estado}:${oab.numero}`),
    estimatedCost: (data.billing?.billableOabs ?? oabs.length) * (data.billing?.pricePerOab ?? 0.1),
  }

  if (intimacoes.length === 0) return result

  // Casa a publicação com o processo pelo CNJ, quando ele já estiver cadastrado.
  // Quando não estiver, a publicação entra órfã e a listagem oferece cadastrar.
  const cnjs = [...new Set(intimacoes.map((i) => i.processo?.numeroCnj).filter(Boolean))] as string[]
  const processByCnj = await mapProcessesByCnj(supabase, cnjs)

  const rows = intimacoes.map((intimacao) => toRow(intimacao, processByCnj))

  // ignoreDuplicates: a publicação já importada não é reescrita — reescrever
  // apagaria `read_at`, `handled_at` e o tipo/assunto digitados por alguém.
  const { data: inserted, error } = await supabase
    .from('publications')
    .upsert(rows, { onConflict: 'source,external_id', ignoreDuplicates: true })
    .select('id')

  if (error) throw new Error(`Gravação das publicações falhou: ${error.message}`)

  result.imported = inserted?.length ?? 0
  result.skipped = rows.length - result.imported

  return result
}

function dedupeOabs(profiles: ProfileOab[]): BpOabRef[] {
  const seen = new Map<string, BpOabRef>()

  for (const profile of profiles) {
    const numero = profile.oab_number.replace(/\D/g, '')
    const estado = profile.oab_state.toUpperCase()
    if (!numero || estado.length !== 2) continue
    seen.set(`${estado}:${numero}`, { estado, numero })
  }

  return [...seen.values()]
}

async function mapProcessesByCnj(
  supabase: SupabaseClient,
  cnjs: string[],
): Promise<Map<string, string>> {
  if (cnjs.length === 0) return new Map()

  const { data } = await supabase
    .from('legal_processes')
    .select('id, cnj_number')
    .in('cnj_number', cnjs)

  return new Map((data ?? []).map((row) => [row.cnj_number as string, row.id as string]))
}

function toRow(intimacao: BpIntimacao, processByCnj: Map<string, string>) {
  const contentText = htmlToText(intimacao.conteudoCompletoHtml) || (intimacao.conteudo ?? '')
  const cnj = intimacao.processo?.numeroCnj ?? null
  const publicationDate = intimacao.dataPublicacao

  return {
    legal_process_id: cnj ? (processByCnj.get(cnj) ?? null) : null,
    cnj_number: cnj,
    source: 'busca_processos',
    external_id: String(intimacao.id),
    court: intimacao.diario?.sigla ?? null,
    diario_name: intimacao.diario?.nome ?? null,
    diario_sigla: intimacao.diario?.sigla ?? null,
    oab_state: intimacao.oab?.estado ?? null,
    oab_number: intimacao.oab?.numero ?? null,
    publication_date: publicationDate,
    // A API só informa a publicação. A disponibilização fica nula em vez de
    // ser chutada para trás — é dado do diário, não nosso.
    availability_date: null,
    deadline_start_at: publicationDate ? deadlineStartFrom(publicationDate) : null,
    title: intimacao.titulo ?? null,
    excerpt: excerptFrom(contentText || (intimacao.conteudo ?? '')),
    content_html: intimacao.conteudoCompletoHtml ?? null,
    content_text: contentText,
    external_url: intimacao.link ?? null,
    raw_data: intimacao,
  }
}
