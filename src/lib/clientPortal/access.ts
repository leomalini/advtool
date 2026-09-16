/**
 * Validação do link público e registro de cada tentativa.
 *
 * Este módulo é o único caminho pelo qual `/api/portal/*` chega ao banco, e
 * roda sempre pela service_role — a rota é anônima por natureza, então não há
 * sessão nem RLS a se apoiar. Toda a autorização do portal está aqui.
 *
 * Regra que organiza o arquivo: **nenhuma tentativa sai sem log**. Rota
 * pública sem rastro não dá para investigar, e a sequência de recusas é
 * justamente o que denuncia alguém tentando adivinhar um CPF.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { bytesToHex, hashPortalToken, looksLikePortalToken, onlyDigits } from './token'
import { PORTAL_SESSION_COOKIE, verifyPortalSessionCookie } from './session'
import type { ClientPortalAccessOutcome, PortalChallenge } from '@/types/clientPortal.types'

/** Tentativas recusadas toleradas por origem, dentro da janela. CPF tem 11
 * dígitos: com 10 chances a cada 15 minutos, varrer o espaço levaria mais
 * tempo do que o universo tem. */
const MAX_FAILED_ATTEMPTS = 10
const RATE_LIMIT_WINDOW_MINUTES = 15

/**
 * Link inválido, revogado e expirado respondem com a MESMA mensagem de
 * propósito: distinguir os três diria a quem tem um token qualquer se ele já
 * existiu, o que é informação que só serve para quem está tentando adivinhar.
 * A diferença entre os casos fica no log, onde o escritório a lê.
 */
export const INVALID_LINK_MESSAGE =
  'Este link de acompanhamento não é mais válido. Fale com o escritório para receber um novo.'

export interface PortalLinkRow {
  id: string
  client_id: string
  revoked_at: string | null
  expires_at: string | null
  access_count: number
}

export interface PortalClientRow {
  id: string
  type: 'individual' | 'company'
  name: string | null
  company_name: string | null
  trade_name: string | null
  cpf: string | null
  cnpj: string | null
}

/**
 * O IP entra no banco como hash porque o único uso que se faz dele é contar
 * tentativas da mesma origem — para isso, o hash serve igual, e o endereço em
 * claro não fica guardado.
 */
export async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))
  return bytesToHex(new Uint8Array(digest)).slice(0, 32)
}

/** O IP do cliente atrás do proxy do host. Null quando nenhum cabeçalho
 * confiável chega — o log aceita, e o rate limit então não se aplica àquela
 * requisição em vez de bloquear todo mundo junto num balde só. */
export function clientIpFrom(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || null
  return headers.get('x-real-ip')?.trim() || null
}

export interface LogAttemptInput {
  outcome: ClientPortalAccessOutcome
  linkId?: string | null
  clientId?: string | null
  ipHash?: string | null
  userAgent?: string | null
}

/** Best-effort, como as demais escritas de telemetria do projeto: falhar ao
 * registrar não pode derrubar o acesso de um cliente legítimo. */
export async function logPortalAttempt(input: LogAttemptInput): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('client_portal_access_log').insert({
      link_id: input.linkId ?? null,
      client_id: input.clientId ?? null,
      outcome: input.outcome,
      ip_hash: input.ipHash ?? null,
      user_agent: input.userAgent?.slice(0, 300) ?? null,
    })
    if (error) console.error('[portal] log de acesso falhou:', error.message)
  } catch (error) {
    console.error('[portal] log de acesso falhou:', error)
  }
}

/**
 * Já passou do limite de recusas nesta janela?
 *
 * Contado no banco, e não numa `Map` em memória, porque o processo do Next em
 * produção não é único nem duradouro: em serverless, cada invocação pode
 * começar com a memória zerada, e um limite que reinicia sozinho não limita
 * nada. A consulta é um índice sobre `created_at`.
 */
export async function isRateLimited(ipHash: string | null): Promise<boolean> {
  if (!ipHash) return false

  const since = new Date(
    Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000
  ).toISOString()

  const admin = createAdminClient()
  const { count, error } = await admin
    .from('client_portal_access_log')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .neq('outcome', 'granted')
    .gte('created_at', since)

  if (error) {
    console.error('[portal] contagem de tentativas falhou:', error.message)
    return false
  }

  return (count ?? 0) >= MAX_FAILED_ATTEMPTS
}

export type ResolveLinkResult =
  | { ok: true; link: PortalLinkRow; client: PortalClientRow }
  | { ok: false; outcome: Exclude<ClientPortalAccessOutcome, 'granted'>; linkId?: string; clientId?: string }

/**
 * Token → link + cliente, ou o motivo da recusa.
 *
 * Não registra nada: quem chama decide o desfecho final (um token válido ainda
 * pode esbarrar no documento) e loga uma vez só, com o resultado de verdade.
 */
export async function resolvePortalLink(token: string): Promise<ResolveLinkResult> {
  if (!looksLikePortalToken(token)) {
    return { ok: false, outcome: 'token_invalid' }
  }

  const admin = createAdminClient()
  const tokenHash = await hashPortalToken(token)

  const { data, error } = await admin
    .from('client_portal_links')
    .select(
      'id, client_id, revoked_at, expires_at, access_count, ' +
        'client:clients(id, type, name, company_name, trade_name, cpf, cnpj)'
    )
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error) {
    console.error('[portal] consulta do link falhou:', error.message)
    return { ok: false, outcome: 'token_invalid' }
  }
  if (!data) return { ok: false, outcome: 'token_invalid' }

  // O projeto não gera tipos do banco, então o builder do supabase-js não sabe
  // a forma desta linha — o cast a declara uma vez, aqui, em vez de espalhar
  // `any` pelos acessos.
  const row = data as unknown as PortalLinkRow & { client: PortalClientRow | null }

  const client = row.client
  const link: PortalLinkRow = {
    id: row.id,
    client_id: row.client_id,
    revoked_at: row.revoked_at,
    expires_at: row.expires_at,
    access_count: row.access_count,
  }

  if (!client) {
    // Cliente apagado com o link vivo não deveria acontecer (a FK é
    // `on delete cascade`), mas devolver "inválido" é a resposta certa se
    // acontecer.
    return { ok: false, outcome: 'token_invalid', linkId: link.id }
  }
  if (link.revoked_at) {
    return { ok: false, outcome: 'token_revoked', linkId: link.id, clientId: client.id }
  }
  if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) {
    return { ok: false, outcome: 'token_expired', linkId: link.id, clientId: client.id }
  }

  return { ok: true, link, client }
}

/** Qual documento a página pede. Segue o `type` do cadastro, e não "o que
 * estiver preenchido": pedir CNPJ a uma pessoa física seria um enigma. */
export function documentKindFor(client: PortalClientRow): 'cpf' | 'cnpj' {
  return client.type === 'company' ? 'cnpj' : 'cpf'
}

/** O documento cadastrado, já normalizado. Null quando o cadastro está sem
 * ele — caso em que o link não pode ser emitido; ver a rota de emissão. */
export function expectedDocument(client: PortalClientRow): string | null {
  const raw = client.type === 'company' ? client.cnpj : client.cpf
  const digits = raw ? onlyDigits(raw) : ''
  return digits.length > 0 ? digits : null
}

/** Comparação por dígitos: o cadastro guarda com máscara, o cliente digita do
 * jeito que quiser. */
export function documentMatches(client: PortalClientRow, informed: string): boolean {
  const expected = expectedDocument(client)
  if (!expected) return false

  const given = onlyDigits(informed)
  if (given.length !== expected.length) return false

  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i)
  return diff === 0
}

/**
 * O porteiro das rotas públicas: token válido + documento já confirmado.
 *
 * Existe para que as três rotas de `/api/portal/*` não repitam a sequência
 * token → revogação → expiração → cookie. Repetir essa ordem em cada rota é
 * como uma delas acaba pulando um passo — e aqui um passo pulado é dado de
 * cliente servido a quem só tinha o link.
 *
 * Devolve ou a resposta pronta para recusar, ou o par link+cliente já validado.
 */
export type PortalGuardResult =
  | { ok: true; link: PortalLinkRow; client: PortalClientRow }
  | { ok: false; response: NextResponse }

export async function requirePortalSession(
  request: NextRequest,
  token: string
): Promise<PortalGuardResult> {
  const ipHash = await hashIp(clientIpFrom(request.headers))
  const userAgent = request.headers.get('user-agent')

  const resolved = await resolvePortalLink(token)

  if (!resolved.ok) {
    await logPortalAttempt({
      outcome: resolved.outcome,
      linkId: resolved.linkId,
      clientId: resolved.clientId,
      ipHash,
      userAgent,
    })
    return {
      ok: false,
      response: NextResponse.json({ error: INVALID_LINK_MESSAGE }, { status: 404 }),
    }
  }

  const { link, client } = resolved

  const hasSession = await verifyPortalSessionCookie(
    request.cookies.get(PORTAL_SESSION_COOKIE)?.value,
    link.id
  )

  if (!hasSession) {
    // Não é log de tentativa: ninguém tentou nada ainda. Quem abre o link pela
    // primeira vez cai aqui, e registrar isso como recusa encheria o histórico
    // de ruído e ainda alimentaria o rate limit contra o cliente legítimo.
    const challenge: PortalChallenge = {
      needs_document: true,
      document_kind: documentKindFor(client),
    }
    return {
      ok: false,
      response: NextResponse.json(challenge, { status: 401, headers: NO_STORE }),
    }
  }

  return { ok: true, link, client }
}

/** A resposta carrega dado de um cliente específico: cache compartilhado no
 * caminho poderia entregá-la a outro. */
export const NO_STORE = { 'Cache-Control': 'no-store, private' } as const

/** Nome de exibição, na mesma lógica que o resto do app usa para clientes. */
export function clientDisplayName(client: PortalClientRow): string {
  if (client.type === 'company') {
    return client.trade_name || client.company_name || 'Cliente'
  }
  return client.name || 'Cliente'
}

/** Marca o acesso no link. Best-effort: é informativo para o escritório, não
 * pode fazer a página falhar. */
export async function touchPortalLink(link: PortalLinkRow): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('client_portal_links')
      .update({
        last_accessed_at: new Date().toISOString(),
        access_count: link.access_count + 1,
      })
      .eq('id', link.id)
    if (error) console.error('[portal] atualização do link falhou:', error.message)
  } catch (error) {
    console.error('[portal] atualização do link falhou:', error)
  }
}
