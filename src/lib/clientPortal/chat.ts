/**
 * A conversa do assistente do portal no banco: limite de uso, histórico e
 * registro de cada turno (`client_portal_chat_messages`, migration 64).
 *
 * Roda pela service_role, como o resto deste diretório: quem chama é
 * `/api/portal/<token>/assistente`, depois de `requirePortalSession`. Toda
 * consulta filtra por `link_id` — é o que impede o id de conversa, que vem do
 * navegador, de alcançar a conversa de outro link.
 */

import type { UIMessage } from 'ai'
import { createAdminClient } from '@/lib/supabase/admin'

/** Perguntas por link. Uma dúvida de verdade raramente passa de meia dúzia de
 * mensagens; o teto existe para que um link com CPF confirmado não esgote a
 * cota do provedor — que é a mesma do Assistente da equipe. */
const MAX_QUESTIONS_PER_HOUR = 10
const MAX_QUESTIONS_PER_DAY = 30

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** Mensagens anteriores que voltam ao modelo a cada turno (5 idas e voltas). O
 * resto da conversa continua gravado; só não entra no contexto. */
const MAX_HISTORY_MESSAGES = 10

export type PortalChatRole = 'user' | 'assistant'

export type PortalChatQuota = { ok: true } | { ok: false; reason: 'hour' | 'day' | 'error' }

/**
 * O link ainda pode perguntar?
 *
 * Falha FECHADA: sem conseguir contar, não chama o modelo. É o contrário do
 * rate limit do CPF em `access.ts`, que falha aberto para não trancar o
 * cliente fora da própria página — aqui o que está em jogo é a cota, e a
 * página continua funcionando sem o chat.
 *
 * Duas perguntas simultâneas do mesmo link podem passar juntas pelo limite. O
 * chat da página só manda uma por vez, então o excedente possível é de uma ou
 * duas perguntas — não vale uma trava no banco.
 */
export async function checkPortalChatQuota(linkId: string): Promise<PortalChatQuota> {
  const now = Date.now()
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('client_portal_chat_messages')
    .select('created_at')
    .eq('link_id', linkId)
    .eq('role', 'user')
    .gte('created_at', new Date(now - DAY_MS).toISOString())
    .order('created_at', { ascending: false })
    .limit(MAX_QUESTIONS_PER_DAY)

  if (error) {
    console.error('[portal-ia] contagem de perguntas falhou:', error.message)
    return { ok: false, reason: 'error' }
  }

  const rows = (data ?? []) as { created_at: string }[]
  if (rows.length >= MAX_QUESTIONS_PER_DAY) return { ok: false, reason: 'day' }

  const lastHour = rows.filter((row) => Date.parse(row.created_at) >= now - HOUR_MS).length
  if (lastHour >= MAX_QUESTIONS_PER_HOUR) return { ok: false, reason: 'hour' }

  return { ok: true }
}

/**
 * As últimas mensagens da conversa, da mais antiga para a mais nova.
 *
 * `parts` vem do banco como JSON sem tipo: quem chama valida contra as tools
 * (`safeValidateUIMessages`) antes de mandar ao modelo. Lança em erro de
 * banco — sem histórico confiável, a rota prefere recusar o turno a responder
 * fora de contexto.
 */
export async function loadPortalChatHistory(
  linkId: string,
  conversationId: string
): Promise<UIMessage[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('client_portal_chat_messages')
    .select('id, role, parts')
    .eq('link_id', linkId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(MAX_HISTORY_MESSAGES)

  if (error) {
    console.error('[portal-ia] leitura do histórico falhou:', error.message)
    throw new Error('Não foi possível carregar a conversa.')
  }

  const rows = (data ?? []) as { id: string; role: PortalChatRole; parts: UIMessage['parts'] }[]
  return rows.reverse().map((row) => ({ id: row.id, role: row.role, parts: row.parts }))
}

/**
 * Deixa a conversa alternando pergunta e resposta, começando por pergunta.
 *
 * Dois casos quebram a alternância, e o provedor pode recusar o pedido por
 * causa deles:
 *   • turno que falhou grava a pergunta (ela conta no limite) e não grava
 *     resposta — de duas perguntas seguidas, fica a mais nova, que é a que o
 *     cliente refez;
 *   • o corte de `MAX_HISTORY_MESSAGES` pode começar numa resposta, que sem a
 *     pergunta dela não faz sentido.
 */
export function alternateTurns<MESSAGE extends UIMessage>(messages: MESSAGE[]): MESSAGE[] {
  const result: MESSAGE[] = []

  for (const message of messages) {
    const previous = result.at(-1)

    if (message.role === 'user' && previous?.role === 'user') {
      result[result.length - 1] = message
      continue
    }
    if (message.role === 'assistant' && previous?.role !== 'user') continue

    result.push(message)
  }

  return result
}

export interface SavePortalChatMessageInput {
  linkId: string
  clientId: string
  conversationId: string
  role: PortalChatRole
  parts: UIMessage['parts']
}

/** Grava um turno. `false` em erro — a rota decide o que isso significa: para
 * a pergunta, recusar (sem registro o limite não conta); para a resposta, só
 * registrar no log, porque o cliente já a recebeu. */
export async function savePortalChatMessage(input: SavePortalChatMessageInput): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('client_portal_chat_messages').insert({
      link_id: input.linkId,
      client_id: input.clientId,
      conversation_id: input.conversationId,
      role: input.role,
      parts: input.parts,
    })
    if (error) {
      console.error('[portal-ia] gravação da mensagem falhou:', error.code, error.message)
      return false
    }
    return true
  } catch (error) {
    console.error('[portal-ia] gravação da mensagem falhou:', error)
    return false
  }
}
