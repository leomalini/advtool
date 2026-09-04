// Server-side only — usa a API key da BuscaProcessos.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getIntimacoes } from './client'
import { intimacaoToPublicationRow } from './mapPublicacao'
import { ingestPublications } from '@/lib/publicacoes/ingest'
import type { BpOabRef } from './types'

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
  /**
   * Já existiam — inclusive as que tinham entrado por OUTRA fonte (cadastro do
   * processo, webhook). Reimportação não duplica nem apaga o que foi lido.
   */
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

  const rows = intimacoes.map((intimacao) =>
    intimacaoToPublicationRow(
      intimacao,
      intimacao.processo?.numeroCnj
        ? (processByCnj.get(intimacao.processo.numeroCnj) ?? null)
        : null,
    ),
  )

  // Toda publicação entra por aqui, venha de onde vier: é o que impede a mesma
  // intimação de aparecer de novo depois de já ter chegado pelo cadastro do
  // processo ou pelo webhook. Ver src/lib/publicacoes/ingest.ts.
  const ingest = await ingestPublications(supabase, rows)

  result.imported = ingest.inserted
  result.skipped = rows.length - ingest.inserted

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
