#!/usr/bin/env node
/**
 * Confere a paridade entre o fingerprint calculado no Postgres e o calculado
 * em JavaScript.
 *
 * A deduplicação de publicações depende de `public.publication_fingerprint`
 * (migration 46) e `src/lib/publicacoes/fingerprint.ts` produzirem exatamente o
 * mesmo valor. Se divergirem, nada quebra visivelmente: o backfill deixa de
 * casar com o que a aplicação grava e as duplicatas voltam em silêncio. Este
 * script é o que torna essa falha detectável.
 *
 *   node scripts/verify-fingerprint.mjs
 *
 * Lê NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do .env — a consulta
 * precisa passar por cima da RLS porque o script não tem sessão.
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ── .env ──────────────────────────────────────────────────────────────────────

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error(
    'Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY (.env ou ambiente).',
  )
  process.exit(1)
}

// ── O mesmo cálculo de src/lib/publicacoes/fingerprint.ts ─────────────────────
//
// Copiado, e não importado: o script roda em Node puro, sem o resolvedor de
// caminhos do Next. Se um dia divergir daquele arquivo, é este script que passa
// a mentir — mantenha os dois iguais.

async function publicationFingerprint(cnjNumber, contentText) {
  const content = (contentText ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  if (!content) return null

  const raw = `${(cnjNumber ?? '').replace(/\D/g, '')}|${content}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

// ── Verificação ───────────────────────────────────────────────────────────────

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

const PAGE = 500
let from = 0
let checked = 0
let mismatches = 0
let nulls = 0

for (;;) {
  const { data, error } = await supabase
    .from('publications')
    .select('id, cnj_number, content_text, content_fingerprint')
    .order('sequence_number')
    .range(from, from + PAGE - 1)

  if (error) {
    console.error('Consulta falhou:', error.message)
    process.exit(1)
  }

  if (!data || data.length === 0) break

  for (const row of data) {
    const expected = await publicationFingerprint(row.cnj_number, row.content_text)
    checked++

    if (expected === null) {
      nulls++
      if (row.content_fingerprint !== null) {
        mismatches++
        console.error(
          `divergência ${row.id}: SQL gravou ${row.content_fingerprint}, JS calculou null`,
        )
      }
      continue
    }

    if (row.content_fingerprint !== expected) {
      mismatches++
      console.error(
        `divergência ${row.id}: SQL ${row.content_fingerprint ?? 'null'} != JS ${expected}`,
      )
    }
  }

  if (data.length < PAGE) break
  from += PAGE
}

console.log(`\n${checked} publicação(ões) conferida(s).`)
console.log(`${nulls} sem conteúdo (fingerprint nulo, esperado).`)

if (mismatches > 0) {
  console.error(`\n${mismatches} DIVERGÊNCIA(S). A deduplicação não é confiável neste estado.`)
  console.error(
    'Compare a normalização de public.publication_fingerprint (migration 46) com a de ' +
      'src/lib/publicacoes/fingerprint.ts.',
  )
  process.exit(1)
}

console.log('Paridade SQL ↔ JS confirmada.')
