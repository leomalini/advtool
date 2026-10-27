// Server-side only. A conta: cofres, saldo e o webhook do cofre.
import type { D4SignSafe } from '@/types/d4sign.types'
import { d4signError, d4signRequest } from './client'
import { balanceSchema, safeListSchema } from './schemas'

function unexpected(path: string, body: unknown) {
  return d4signError('invalid_response', 502, path, JSON.stringify(body) ?? 'sem corpo')
}

/** Os cofres da conta, para escolher onde os envios caem. */
export async function listSafes(): Promise<D4SignSafe[]> {
  const body = await d4signRequest('/safes')
  const parsed = safeListSchema.safeParse(body)
  if (!parsed.success) throw unexpected('/safes', body)
  return parsed.data
}

export interface D4SignBalance {
  /** O que o plano libera. O mês ou o ano — o pagamento é anual — só a conta
   * real vai dizer. */
  credit: number
  sent: number
}

/** O saldo de envios. Serve também de teste das chaves: chave errada é 401. */
export async function getBalance(): Promise<D4SignBalance> {
  const body = await d4signRequest('/account/balance')
  const parsed = balanceSchema.safeParse(body)
  if (!parsed.success) throw unexpected('/account/balance', body)
  return parsed.data
}

/**
 * Registra o endereço que recebe os avisos de UM documento — webhook 2.0, no
 * envio (fase 2). Por documento, e não por cofre: o escritório tem 15 cofres
 * (um por tipo), e registrar todos esbarraria no limite de chamadas por hora;
 * assim também só chegam avisos do que o app mandou, nunca do painel. Custa
 * uma chamada por envio. A resposta não é documentada: o 200 basta.
 */
export async function registerDocumentWebhook(documentUuid: string, url: string): Promise<void> {
  await d4signRequest('/webhooks/v2/', { json: { type: 'documento', uuid: documentUuid, url } })
}
