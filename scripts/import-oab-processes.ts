/**
 * Importa os processos das OABs dos advogados do escritório pela BuscaProcessos.
 * Plano e decisões: docs/importacao-oab.md.
 *
 *   pnpm import:oab listar   [--status RECENTE|HISTORICO] [--oab ES:35520] [--sim]
 *   pnpm import:oab importar [--status RECENTE|HISTORICO] [--oab ES:35520]
 *                            [--cnj 0001234-56.2024.8.08.0001,...] [--limite N]
 *                            [--arquivo .import-oab/listagem-RECENTE-....json] [--sim]
 *
 * `listar` consulta as OABs dos perfis ATIVOS e grava a listagem em
 * `.import-oab/` (JSON, CSV e as páginas como vieram). Não cadastra nada. Cada
 * OAB cobra a página 1 da consulta — o valor não é publicado e aparece no fim.
 *
 * `importar` usa a última listagem do mesmo recorte, sem consultar a lista de
 * novo, e cadastra o que ainda não está na base: capa + movimentações, cerca de
 * R$ 0,24 por processo. Rodar duas vezes é seguro — o que já entrou é pulado, e
 * o processo cuja importação parou depois da capa é completado.
 *
 * `--status` padrão: RECENTE. `--sim` pula a confirmação. Segredos saem do
 * `.env` (`--env-file` no comando do package.json), nunca de argumento.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { BpApiError } from '@/lib/buscaprocessos/client'
import { sleep } from '@/lib/buscaprocessos/awaitPending'
import { listOabProcesses, type OabListing } from '@/lib/buscaprocessos/oabListing'
import type { BpOabListingStatus } from '@/lib/buscaprocessos/types'
import { loadOfficeOabs, type OfficeLawyer, type OfficeOabs } from '@/lib/clientes/officeClients'
import { oabKey, parseOabText } from '@/lib/oab'
import {
  COMPLETION_COST,
  NEW_PROCESS_COST,
  cnjDigits,
  completeProcess,
  firstProcessColumnId,
  importNewProcess,
  loadExistingProcesses,
  needsCompletion,
  type ExistingProcess,
  type ImportOutcome,
} from '@/lib/processos/importFromOab'

const OUTPUT_DIR = path.resolve(process.cwd(), '.import-oab')
const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'BUSCA_PROCESSOS_API_KEY',
] as const

/** Pausa entre processos: cada um faz duas consultas pagas, e o limite
 * documentado é 2 requisições/s por chave. */
const PAUSE_BETWEEN_PROCESSES_MS = 1_000
const PAUSE_AFTER_PROBLEM_MS = 5_000
const RATE_LIMIT_WAIT_MS = 20_000
const RATE_LIMIT_ATTEMPTS = 3

// ── Argumentos ────────────────────────────────────────────────────────────────

const argsSchema = z.object({
  command: z.enum(['listar', 'importar'], { error: 'Use `listar` ou `importar`.' }),
  status: z.enum(['RECENTE', 'HISTORICO'], { error: '--status aceita RECENTE ou HISTORICO.' }),
  oab: z.string().optional(),
  cnj: z.string().optional(),
  limite: z.coerce.number().int().positive('--limite precisa ser um inteiro positivo.').optional(),
  arquivo: z.string().optional(),
  sim: z.boolean(),
})

type Args = z.infer<typeof argsSchema>

function readArgs(): Args {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      status: { type: 'string', default: 'RECENTE' },
      oab: { type: 'string' },
      cnj: { type: 'string' },
      limite: { type: 'string' },
      arquivo: { type: 'string' },
      sim: { type: 'boolean', default: false },
    },
  })

  const parsed = argsSchema.safeParse({
    command: positionals[0],
    status: values.status?.toUpperCase(),
    oab: values.oab,
    cnj: values.cnj,
    limite: values.limite,
    arquivo: values.arquivo,
    sim: values.sim,
  })

  if (!parsed.success) {
    throw new UsageError(parsed.error.issues.map((issue) => issue.message).join('\n'))
  }
  return parsed.data
}

class UsageError extends Error {}

/** 'ES:35520', 'ES 35520', '35520/ES' → 'ES:35520'. */
function parseOabArg(value: string): string {
  const compact = value.trim().toUpperCase().match(/^([A-Z]{2})\s*:\s*(\d[\d.]*)$/)
  const key = compact ? oabKey(compact[1], compact[2]) : parseOabText(value)
  if (!key) throw new UsageError(`OAB inválida em --oab: "${value}". Use UF:NÚMERO, como ES:35520.`)
  return key
}

// ── Listagem salva ────────────────────────────────────────────────────────────

const snapshotProcessSchema = z.object({
  cnj: z.string().min(1),
  digits: z.string().min(1),
  /** Todas as OABs do escritório que trouxeram o processo. */
  oabKeys: z.array(z.string()).min(1),
  /** Advogado da primeira delas: responsável pelo card. */
  lawyerProfileId: z.string().uuid(),
  lawyerName: z.string().nullable(),
  poloAtivo: z.string().nullable(),
  poloPassivo: z.string().nullable(),
  classe: z.string().nullable(),
  orgaoJulgador: z.string().nullable(),
  anoInicio: z.number().nullable(),
  statusProcessual: z.string().nullable(),
  classificacao: z.string().nullable(),
  ativo: z.boolean().nullable(),
  dataUltimaPublicacao: z.string().nullable(),
  /** Já estava na base quando a listagem foi feita — `importar` confere de novo. */
  existingAtListing: z.boolean(),
})

const snapshotSchema = z.object({
  version: z.literal(1),
  status: z.enum(['RECENTE', 'HISTORICO']),
  listedAt: z.string(),
  oabs: z.array(
    z.object({
      key: z.string(),
      profileId: z.string(),
      lawyerName: z.string().nullable(),
      found: z.number(),
      pages: z.number(),
      creditsCharged: z.number(),
      complete: z.boolean(),
      partialReason: z.string().nullable(),
      advogado: z.unknown(),
    }),
  ),
  failures: z.array(z.object({ key: z.string(), message: z.string() })),
  processes: z.array(snapshotProcessSchema),
})

type Snapshot = z.infer<typeof snapshotSchema>
type SnapshotProcess = z.infer<typeof snapshotProcessSchema>

// ── listar ────────────────────────────────────────────────────────────────────

interface ListedOab {
  key: string
  lawyer: OfficeLawyer
  listing: OabListing
}

async function runList(supabase: SupabaseClient, args: Args): Promise<void> {
  const officeOabs = await loadOfficeOabs(supabase)
  const targets = selectActiveOabs(officeOabs, args.oab)

  console.log(`OABs a consultar (${args.status}):`)
  for (const [, lawyer] of targets) console.log(`  · ${lawyer.label} — ${lawyer.name ?? 'sem nome'}`)

  const go = await confirm(
    `Cada OAB cobra a página 1 da consulta (valor não publicado; o custo real aparece no fim). ` +
      `Nada é cadastrado nesta etapa.`,
    args.sim,
  )
  if (!go) {
    console.log('Cancelado.')
    return
  }

  await mkdir(OUTPUT_DIR, { recursive: true })
  const stamp = fileStamp()
  const listed: ListedOab[] = []
  const failures: { key: string; message: string }[] = []

  for (const [key, lawyer] of targets) {
    const [estado, numero] = key.split(':')
    console.log(`\n→ ${lawyer.label}`)
    try {
      const listing = await listOabProcesses({ estado, numero }, args.status, {
        onPage: (page, found) => console.log(`  página ${page}: ${found} processo(s) até agora`),
      })
      listed.push({ key, lawyer, listing })
      // Já pago: grava as páginas antes de seguir para a próxima OAB.
      await writeJson(`bruto-${args.status}-${key.replace(':', '')}-${stamp}.json`, listing.rawPages)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha inesperada.'
      console.error(`  ✗ ${message}`)
      failures.push({ key, message })
      // Chave recusada ou sem crédito: as próximas OABs falhariam igual.
      if (err instanceof BpApiError && (err.status === 401 || err.status === 403)) break
    }
  }

  if (listed.length === 0) {
    process.exitCode = 1
    console.error('\nNenhuma OAB foi listada. Nada foi gravado.')
    return
  }

  const existing = await loadExistingProcesses(supabase)
  const snapshot = buildSnapshot(args.status, listed, failures, existing)
  const jsonName = `listagem-${args.status}-${stamp}.json`
  await writeJson(jsonName, snapshot)
  await writeFile(path.join(OUTPUT_DIR, jsonName.replace(/\.json$/, '.csv')), toCsv(snapshot), 'utf8')

  printListSummary(snapshot, jsonName)
}

function selectActiveOabs(officeOabs: OfficeOabs, filter: string | undefined) {
  const active = [...officeOabs].filter(([, lawyer]) => lawyer.isActive)
  if (active.length === 0) throw new UsageError('Nenhum perfil ativo tem OAB cadastrada.')
  if (!filter) return active

  const key = parseOabArg(filter)
  const match = active.filter(([candidate]) => candidate === key)
  if (match.length === 0) {
    throw new UsageError(
      `${key} não é OAB de um perfil ativo. Disponíveis: ${active.map(([k]) => k).join(', ')}.`,
    )
  }
  return match
}

function buildSnapshot(
  status: BpOabListingStatus,
  listed: ListedOab[],
  failures: { key: string; message: string }[],
  existing: Map<string, ExistingProcess>,
): Snapshot {
  const byDigits = new Map<string, SnapshotProcess>()

  for (const { key, lawyer, listing } of listed) {
    for (const item of listing.processes) {
      const digits = cnjDigits(item.numeroCnj)
      if (!digits) continue

      const known = byDigits.get(digits)
      if (known) {
        if (!known.oabKeys.includes(key)) known.oabKeys.push(key)
        continue
      }

      byDigits.set(digits, {
        cnj: item.numeroCnj,
        digits,
        oabKeys: [key],
        lawyerProfileId: lawyer.profileId,
        lawyerName: lawyer.name,
        poloAtivo: text(item.poloAtivo),
        poloPassivo: text(item.poloPassivo),
        classe: text(item.classe),
        orgaoJulgador: text(item.orgaoJulgador),
        anoInicio: typeof item.anoInicio === 'number' ? item.anoInicio : null,
        statusProcessual: text(item.statusProcessual),
        classificacao: text(item.classificacao),
        ativo: typeof item.ativo === 'boolean' ? item.ativo : null,
        dataUltimaPublicacao: text(item.dataUltimaPublicacao),
        existingAtListing: existing.has(digits),
      })
    }
  }

  return {
    version: 1,
    status,
    listedAt: new Date().toISOString(),
    oabs: listed.map(({ key, lawyer, listing }) => ({
      key,
      profileId: lawyer.profileId,
      lawyerName: lawyer.name,
      found: listing.processes.length,
      pages: listing.pages,
      creditsCharged: listing.creditsCharged,
      complete: listing.complete,
      partialReason: listing.partialReason,
      advogado: listing.advogado,
    })),
    failures,
    processes: [...byDigits.values()],
  }
}

/**
 * Os totais por recorte que a consulta devolve em `advogado`, quando devolve.
 * É o jeito de saber quantos históricos existem sem pagar a listagem deles.
 */
function advogadoCounts(advogado: unknown): string | null {
  if (!advogado || typeof advogado !== 'object') return null
  const { quantidadeRecentes, quantidadeHistoricos } = advogado as Record<string, unknown>
  const parts = [
    typeof quantidadeRecentes === 'number' ? `${quantidadeRecentes} recente(s)` : null,
    typeof quantidadeHistoricos === 'number' ? `${quantidadeHistoricos} histórico(s)` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' e ') : null
}

/** A API não garante o tipo do resumo; o que não for texto vira null. */
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function printListSummary(snapshot: Snapshot, jsonName: string): void {
  console.log(`\nListagem ${snapshot.status}`)
  for (const oab of snapshot.oabs) {
    console.log(
      `  ${oab.key} (${oab.lawyerName ?? 'sem nome'}): ${oab.found} processo(s) em ` +
        `${oab.pages} página(s) · cobrado ${brl(oab.creditsCharged)}`,
    )
    const counts = advogadoCounts(oab.advogado)
    if (counts) console.log(`    a API informa ${counts}`)
    if (!oab.complete) {
      console.log(
        `  ⚠ A API disse que a cobertura desta OAB está parcial` +
          `${oab.partialReason ? `: ${oab.partialReason}` : ''}. Liste de novo mais tarde para pegar o resto.`,
      )
    }
  }
  for (const failure of snapshot.failures) console.log(`  ✗ ${failure.key}: ${failure.message}`)

  const fresh = snapshot.processes.filter((entry) => !entry.existingAtListing)
  console.log(
    `\nProcessos únicos: ${snapshot.processes.length} · já na base: ` +
      `${snapshot.processes.length - fresh.length} · novos: ${fresh.length}`,
  )
  console.log(
    `Importar os novos custaria cerca de ${brl(fresh.length * NEW_PROCESS_COST)} ` +
      `(${brl(NEW_PROCESS_COST)} cada).`,
  )
  console.log(`\nArquivos em .import-oab/: ${jsonName} e o .csv de mesmo nome.`)
  console.log(
    `Próximo passo: pnpm import:oab importar --status ${snapshot.status} --limite 1`,
  )
}

// ── importar ──────────────────────────────────────────────────────────────────

type QueueItem =
  | { kind: 'new'; entry: SnapshotProcess }
  | { kind: 'complete'; entry: SnapshotProcess; existing: ExistingProcess }

interface ImportReport {
  snapshotFile: string
  status: BpOabListingStatus
  startedAt: string
  finishedAt: string | null
  interrupted: string | null
  estimatedCost: number
  outcomes: ImportOutcome[]
}

async function runImport(supabase: SupabaseClient, args: Args): Promise<void> {
  const snapshotFile = args.arquivo
    ? path.resolve(args.arquivo)
    : await latestSnapshot(args.status)
  const snapshot = await readSnapshot(snapshotFile)
  if (args.arquivo && snapshot.status !== args.status) {
    console.log(`Usando o recorte da listagem informada: ${snapshot.status}.`)
  }

  console.log(`Listagem: ${path.relative(process.cwd(), snapshotFile)} (${formatDateTime(snapshot.listedAt)})`)
  for (const oab of snapshot.oabs.filter((entry) => !entry.complete)) {
    console.log(`⚠ ${oab.key}: listagem parcial — o que faltou entra numa listagem futura.`)
  }

  const candidates = filterCandidates(snapshot.processes, args)
  const existing = await loadExistingProcesses(supabase)

  const queue: QueueItem[] = []
  let alreadyInBase = 0
  for (const entry of candidates) {
    const found = existing.get(entry.digits)
    if (!found) queue.push({ kind: 'new', entry })
    else if (needsCompletion(found)) queue.push({ kind: 'complete', entry, existing: found })
    else alreadyInBase++
  }

  const selected = args.limite ? queue.slice(0, args.limite) : queue
  const toImport = selected.filter((item) => item.kind === 'new').length
  const toComplete = selected.length - toImport
  const estimate = toImport * NEW_PROCESS_COST + toComplete * COMPLETION_COST

  console.log(
    `\n${candidates.length} processo(s) na seleção · ${alreadyInBase} já na base (pulados)` +
      ` · ${toImport} a cadastrar · ${toComplete} a completar` +
      (args.limite && queue.length > selected.length ? ` · limitado a ${selected.length}` : ''),
  )
  if (selected.length === 0) {
    console.log('Nada a fazer.')
    return
  }

  const officeOabs = await loadOfficeOabs(supabase)
  const profileIds = new Set([...officeOabs.values()].map((lawyer) => lawyer.profileId))
  const columnId = await firstProcessColumnId(supabase)

  const go = await confirm(
    `Custo estimado: ${brl(estimate)} (capa + movimentações). Sem monitoramento, sem documentos ` +
      `públicos, publicações antigas entram já tratadas e clientes sem aviso no sino.`,
    args.sim,
  )
  if (!go) {
    console.log('Cancelado.')
    return
  }

  await mkdir(OUTPUT_DIR, { recursive: true })
  const reportName = `importacao-${snapshot.status}-${fileStamp()}.json`
  const report: ImportReport = {
    snapshotFile: path.relative(process.cwd(), snapshotFile),
    status: snapshot.status,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    interrupted: null,
    estimatedCost: 0,
    outcomes: [],
  }

  for (const [index, item] of selected.entries()) {
    const position = `[${index + 1}/${selected.length}]`

    if (!profileIds.has(item.entry.lawyerProfileId)) {
      report.outcomes.push({
        kind: 'failed',
        cnj: item.entry.cnj,
        message: 'O perfil do advogado da listagem não existe mais. Liste de novo.',
        apiStatus: null,
        estimatedCost: 0,
      })
      console.log(`${position} ${item.entry.cnj} · ✗ perfil do advogado não encontrado`)
      continue
    }

    const outcome = await runWithRateLimit(() =>
      item.kind === 'complete'
        ? completeProcess(supabase, item.existing, { columnId, officeOabs })
        : importNewProcess(
            supabase,
            {
              cnj: item.entry.cnj,
              oabKey: item.entry.oabKeys[0],
              lawyerProfileId: item.entry.lawyerProfileId,
              listedClass: item.entry.classe,
            },
            { columnId, officeOabs },
          ),
    )

    report.outcomes.push(outcome)
    report.estimatedCost += outcome.estimatedCost
    // A cada processo: um Ctrl+C no meio não perde o que já foi feito.
    await writeJson(reportName, report)
    console.log(`${position} ${describeOutcome(outcome)}`)

    if (outcome.kind === 'failed' && (outcome.apiStatus === 401 || outcome.apiStatus === 403)) {
      report.interrupted = outcome.message
      console.error(`\nInterrompido: ${outcome.message}`)
      break
    }

    const troubled =
      outcome.kind === 'failed' ||
      outcome.kind === 'pending' ||
      ('warnings' in outcome && outcome.warnings.length > 0)
    await sleep(troubled ? PAUSE_AFTER_PROBLEM_MS : PAUSE_BETWEEN_PROCESSES_MS)
  }

  report.finishedAt = new Date().toISOString()
  await writeJson(reportName, report)
  printImportSummary(report, reportName)
}

function filterCandidates(processes: SnapshotProcess[], args: Args): SnapshotProcess[] {
  let selected = processes

  if (args.oab) {
    const key = parseOabArg(args.oab)
    selected = selected.filter((entry) => entry.oabKeys.includes(key))
  }

  if (args.cnj) {
    /** Dígitos → como foi digitado, para o aviso repetir o que a pessoa escreveu. */
    const wanted = new Map(
      args.cnj
        .split(',')
        .map((value) => [cnjDigits(value), value.trim()] as const)
        .filter(([digits]) => Boolean(digits)),
    )
    const listed = new Set(selected.map((entry) => entry.digits))
    const missing = [...wanted].filter(([digits]) => !listed.has(digits)).map(([, typed]) => typed)
    if (missing.length > 0) {
      console.log(`⚠ Fora da listagem (não serão importados): ${missing.join(', ')}`)
    }
    selected = selected.filter((entry) => wanted.has(entry.digits))
  }

  return selected
}

/** 429 na capa: nada foi gravado, então dá para esperar e tentar o mesmo processo. */
async function runWithRateLimit(run: () => Promise<ImportOutcome>): Promise<ImportOutcome> {
  for (let attempt = 1; ; attempt++) {
    const outcome = await run()
    const limited = outcome.kind === 'failed' && outcome.apiStatus === 429
    if (!limited || attempt >= RATE_LIMIT_ATTEMPTS) return outcome
    console.log(`  limite de requisições da API — aguardando ${RATE_LIMIT_WAIT_MS / 1000} s`)
    await sleep(RATE_LIMIT_WAIT_MS)
  }
}

function describeOutcome(outcome: ImportOutcome): string {
  if (outcome.kind === 'pending') return `${outcome.cnj} · ⏳ capa em processamento — rode de novo`
  if (outcome.kind === 'failed') return `${outcome.cnj} · ✗ ${outcome.message}`

  const label = outcome.kind === 'imported' ? 'cadastrado' : 'completado'
  const parts = [`${outcome.cnj} · ✓ ${label}`]
  for (const client of outcome.clients?.clients ?? []) {
    parts.push(`cliente ${CLIENT_ACTION_LABELS[client.action]}: ${client.name}`)
  }
  if (outcome.kind === 'imported' && outcome.linkedPublications > 0) {
    parts.push(`${outcome.linkedPublications} publicação(ões) órfã(s) vinculada(s)`)
  }
  const lines = [parts.join(' · ')]
  for (const warning of outcome.warnings) lines.push(`    ⚠ ${warning}`)
  return lines.join('\n')
}

const CLIENT_ACTION_LABELS = {
  created: 'criado',
  converted: 'convertido de pessoa',
  existing: 'já existente vinculado',
} as const

function printImportSummary(report: ImportReport, reportName: string): void {
  const count = (kind: ImportOutcome['kind']) =>
    report.outcomes.filter((outcome) => outcome.kind === kind).length

  console.log(
    `\nResumo: ${count('imported')} cadastrado(s) · ${count('completed')} completado(s) · ` +
      `${count('pending')} pendente(s) · ${count('failed')} com falha · custo estimado ` +
      brl(report.estimatedCost),
  )

  const clients = report.outcomes.flatMap((outcome) =>
    outcome.kind === 'imported' || outcome.kind === 'completed'
      ? (outcome.clients?.clients ?? [])
          .filter((client) => client.action !== 'existing')
          .map((client) => `${client.name} (${CLIENT_ACTION_LABELS[client.action]}, ${outcome.cnj})`)
      : [],
  )
  if (clients.length > 0) {
    console.log(`\nClientes cadastrados automaticamente (${clients.length}):`)
    for (const client of clients) console.log(`  · ${client}`)
  }

  const unfinished = report.outcomes.filter(
    (outcome) =>
      outcome.kind === 'pending' ||
      outcome.kind === 'failed' ||
      ('warnings' in outcome && outcome.warnings.length > 0),
  )
  if (unfinished.length > 0) {
    console.log(
      `\n${unfinished.length} processo(s) com pendência. Rode o mesmo comando de novo: o que já ` +
        `entrou é pulado, e o que parou depois da capa é completado.`,
    )
  }
  console.log(`\nRelatório: .import-oab/${reportName}`)
}

async function latestSnapshot(status: BpOabListingStatus): Promise<string> {
  const prefix = `listagem-${status}-`
  const names = await readdir(OUTPUT_DIR).catch(() => [] as string[])
  const latest = names
    .filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
    .sort()
    .at(-1)

  if (!latest) {
    throw new UsageError(
      `Nenhuma listagem ${status} em .import-oab/. Rode antes: pnpm import:oab listar --status ${status}`,
    )
  }
  return path.join(OUTPUT_DIR, latest)
}

async function readSnapshot(file: string): Promise<Snapshot> {
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(file, 'utf8'))
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new UsageError(`Não consegui ler ${file}: ${reason}`)
  }

  const parsed = snapshotSchema.safeParse(raw)
  if (!parsed.success) {
    throw new UsageError(
      `${file} não é uma listagem válida: ${parsed.error.issues[0]?.message ?? 'formato inesperado'}`,
    )
  }
  return parsed.data
}

// ── Arquivos e saída ──────────────────────────────────────────────────────────

async function writeJson(name: string, value: unknown): Promise<void> {
  await writeFile(path.join(OUTPUT_DIR, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const CSV_HEADER = [
  'CNJ',
  'Na base',
  'Advogado',
  'OABs',
  'Polo ativo',
  'Polo passivo',
  'Classe',
  'Órgão julgador',
  'Ano',
  'Status processual',
  'Classificação',
  'Ativo',
  'Última publicação',
]

/** Separador `;` e BOM: é o que o Excel em português abre sem assistente. */
function toCsv(snapshot: Snapshot): string {
  const rows = snapshot.processes.map((entry) => [
    entry.cnj,
    entry.existingAtListing ? 'sim' : 'não',
    entry.lawyerName ?? '',
    entry.oabKeys.join(' '),
    entry.poloAtivo ?? '',
    entry.poloPassivo ?? '',
    entry.classe ?? '',
    entry.orgaoJulgador ?? '',
    entry.anoInicio === null ? '' : String(entry.anoInicio),
    entry.statusProcessual ?? '',
    entry.classificacao ?? '',
    entry.ativo === null ? '' : entry.ativo ? 'sim' : 'não',
    entry.dataUltimaPublicacao ?? '',
  ])

  const lines = [CSV_HEADER, ...rows].map((row) => row.map(csvCell).join(';'))
  return `﻿${lines.join('\r\n')}\r\n`
}

function csvCell(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Hora local, ordenável e válida em nome de arquivo: 2026-11-10T14-32-05. */
function fileStamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  )
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR')
}

function brl(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`
}

async function confirm(warning: string, skip: boolean): Promise<boolean> {
  console.log(`\n${warning}`)
  if (skip) return true

  const prompt = createInterface({ input: stdin, output: stdout })
  try {
    const answer = await prompt.question('Digite SIM para continuar: ')
    return answer.trim().toUpperCase() === 'SIM'
  } finally {
    prompt.close()
  }
}

// ── Entrada ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new UsageError(
      `Faltam no ambiente: ${missing.join(', ')}. Rode pelo comando do package.json ` +
        `(pnpm import:oab ...), que carrega o .env.`,
    )
  }

  const args = readArgs()
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  if (args.command === 'listar') await runList(supabase, args)
  else await runImport(supabase, args)
}

main().catch((err: unknown) => {
  process.exitCode = 1
  if (err instanceof UsageError) {
    console.error(err.message)
    return
  }
  console.error(err instanceof Error ? err.message : err)
})
