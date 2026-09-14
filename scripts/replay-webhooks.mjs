#!/usr/bin/env node
/**
 * Reprocessa entregas de webhook que ficaram recusadas em `webhook_events`.
 *
 * Existe porque o registro guarda o CORPO de cada entrega recusada — foi para
 * isso que ele foi feito. Enquanto a autenticação não fechava, a BuscaProcessos
 * entregou intimações reais que voltaram 401: o dado não se perdeu, ficou
 * parado no log. Este script devolve cada corpo ao endpoint já corrigido, com
 * credencial nossa, e deixa a ingestão decidir o que é novo e o que é repetido.
 *
 *   node scripts/replay-webhooks.mjs <url> [--dry-run] [--all] [--event X] [--limit N]
 *
 *   --dry-run  lista o que seria reenviado e não manda nada
 *   --all      inclui todo evento recusado, não só `diario_movimentacao_nova`
 *   --event X  reprocessa só o evento X
 *   --limit N  para depois de N entregas
 *
 * A URL é a do endpoint, não a da aplicação:
 *   node scripts/replay-webhooks.mjs http://localhost:3000/api/webhooks/buscaprocessos --dry-run
 *
 * Reenviar duas vezes é seguro: a publicação carrega o `external_id` da origem
 * e a movimentação o mesmo `external_hash` da sincronização, então a segunda
 * passada responde `duplicate` em vez de duplicar linha.
 *
 * Segredos saem do ambiente (.env), nunca de argumento: argumento fica no
 * histórico do shell e na lista de processos.
 */

import { readFileSync } from 'node:fs'

/** Mesmo carregador de `send-webhook.mjs`: um script de terminal não passa pelo
 * carregamento de ambiente do Next. */
function loadEnv(path = '.env') {
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return
  }

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!match) continue
    const value = match[2].trim().replace(/^["']|["']$/g, '')
    if (!process.env[match[1]]) process.env[match[1]] = value
  }
}

loadEnv()

const args = process.argv.slice(2)
/** Posicional de verdade: o valor de `--event`/`--limit` não é a URL. */
const FLAGS_WITH_VALUE = ['--event', '--limit']
const url = args.find(
  (arg, index) => !arg.startsWith('--') && !FLAGS_WITH_VALUE.includes(args[index - 1]),
)
const dryRun = args.includes('--dry-run')
const all = args.includes('--all')
const eventFilter = valueOf('--event') ?? (all ? null : 'diario_movimentacao_nova')
const limit = Number(valueOf('--limit') ?? 0)

function valueOf(flag) {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

if (!url) {
  console.error('Uso: node scripts/replay-webhooks.mjs <url do endpoint> [--dry-run] [--all]')
  process.exit(1)
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.')
  process.exit(1)
}

const secret = process.env.BUSCA_PROCESSOS_WEBHOOK_SECRET
const token = process.env.BUSCA_PROCESSOS_WEBHOOK_TOKEN

if (!secret && !token && !dryRun) {
  console.error(
    'Sem BUSCA_PROCESSOS_WEBHOOK_SECRET nem BUSCA_PROCESSOS_WEBHOOK_TOKEN: o endpoint recusaria o reenvio.',
  )
  process.exit(1)
}

/** A assinatura é sobre os bytes que vão no corpo. O log guarda o payload como
 * JSON, não os bytes originais, então quem assina é este script. */
async function sign(body) {
  if (!secret) return null

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return `sha256=${Array.from(new Uint8Array(mac))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`
}

const query = new URLSearchParams({
  select: 'id,received_at,event,payload,headers',
  status: 'eq.invalid',
  order: 'received_at.asc',
})

const response = await fetch(`${SUPABASE_URL}/rest/v1/webhook_events?${query}`, {
  headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
})

if (!response.ok) {
  console.error(`Leitura de webhook_events falhou: HTTP ${response.status}`)
  process.exit(1)
}

const rows = await response.json()

const candidates = []
let skipped = 0

for (const row of rows) {
  const payload = row.payload
  // Corpo que nem era JSON foi guardado como `{ unparsed_body }`: reenviar isso
  // só produz outro 400.
  if (!payload || typeof payload !== 'object' || payload.unparsed_body) {
    skipped++
    continue
  }

  const event = payload.event ?? row.event ?? row.headers?.event ?? null
  if (eventFilter && event !== eventFilter) {
    skipped++
    continue
  }

  candidates.push({ id: row.id, receivedAt: row.received_at, event, payload })
  if (limit && candidates.length >= limit) break
}

console.log(
  `${rows.length} entrega(s) recusada(s) no log; ${candidates.length} para reprocessar` +
    `${eventFilter ? ` (evento ${eventFilter})` : ''}; ${skipped} fora do filtro.`,
)

if (!candidates.length) process.exit(0)

if (dryRun) {
  for (const item of candidates) {
    console.log(`· ${item.receivedAt}  ${item.event}  ${describe(item.payload)}`)
  }
  console.log('\n--dry-run: nada foi reenviado.')
  process.exit(0)
}

const tally = {}

for (const item of candidates) {
  const body = JSON.stringify(item.payload)
  const signature = await sign(body)

  const headers = { 'Content-Type': 'application/json' }
  if (item.event) headers['x-buscaprocessos-event'] = item.event
  if (signature) headers['x-buscaprocessos-signature'] = signature
  else if (token) headers['Authorization'] = `Bearer ${token}`

  try {
    const result = await fetch(url, { method: 'POST', headers, body })
    const text = await result.text()
    let parsed = text
    try {
      parsed = JSON.parse(text)
    } catch {
      // Resposta não-JSON: o texto cru é o que ajuda a diagnosticar.
    }

    const status = typeof parsed === 'object' && parsed ? (parsed.status ?? 'sem status') : text
    tally[status] = (tally[status] ?? 0) + 1
    console.log(`· ${item.receivedAt}  ${item.event}  HTTP ${result.status}  ${status}`)
  } catch (err) {
    tally.falha = (tally.falha ?? 0) + 1
    console.error(`· ${item.receivedAt}  ${item.event}  falhou: ${err.message}`)
  }
}

console.log(
  '\n' +
    Object.entries(tally)
      .map(([status, count]) => `${status}: ${count}`)
      .join('  ·  '),
)
console.log('O resultado de cada reenvio virou uma linha nova em webhook_events.')

/** Uma linha curta que identifica a entrega sem despejar o corpo inteiro. */
function describe(payload) {
  const mov = payload.movimentacao
  if (mov) return `${mov.numero_processo ?? mov.processo_id ?? 'sem CNJ'} · diário ${mov.id ?? '?'}`
  if (payload.processo?.numero_unico) return payload.processo.numero_unico
  return payload.uuid ?? payload.id ?? '(sem identificação)'
}
