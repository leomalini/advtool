#!/usr/bin/env node
/**
 * Dispara um webhook assinado contra qualquer instalação.
 *
 * A tela em Configurações → Webhooks cobre o dia a dia; este script existe para
 * o caso que ela não cobre: testar uma instalação de produção a partir do
 * terminal, sem sessão de admin no navegador.
 *
 *   node scripts/send-webhook.mjs <url> <arquivo.json>
 *   cat payload.json | node scripts/send-webhook.mjs <url>
 *
 * O segredo sai de BUSCA_PROCESSOS_WEBHOOK_SECRET (.env ou ambiente) e NUNCA de
 * argumento de linha de comando — argumento fica no histórico do shell e na
 * lista de processos.
 */

import { readFileSync } from 'node:fs'

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

const [url, payloadPath] = process.argv.slice(2)

if (!url) {
  console.error('Uso: node scripts/send-webhook.mjs <url> [arquivo.json]')
  process.exit(1)
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const rawBody = payloadPath ? readFileSync(payloadPath, 'utf8') : await readStdin()

let payload
try {
  payload = JSON.parse(rawBody)
} catch (err) {
  console.error('Corpo não é JSON válido:', err.message)
  process.exit(1)
}

// Reenvia exatamente os bytes que foram assinados: reserializar mudaria o
// corpo e invalidaria a assinatura.
const body = rawBody

const secret = process.env.BUSCA_PROCESSOS_WEBHOOK_SECRET
let signature = null

if (secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  signature = `sha256=${Array.from(new Uint8Array(mac))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`
} else {
  console.warn(
    'BUSCA_PROCESSOS_WEBHOOK_SECRET vazio: enviando sem assinatura. ' +
      'O destino só aceitará se também estiver sem segredo configurado.',
  )
}

const headers = {
  'Content-Type': 'application/json',
  'x-buscaprocessos-event': payload.event ?? '',
}
if (signature) headers['x-buscaprocessos-signature'] = signature

const response = await fetch(url, { method: 'POST', headers, body })
const text = await response.text()

console.log(`HTTP ${response.status}`)
console.log(text)

process.exit(response.ok ? 0 : 1)
