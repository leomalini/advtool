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

  return parsed.data.map((safe) => ({ uuid: safe['uuid-safe'], name: safe['name-safe'] }))
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
 * Registra (ou troca) o endereço que recebe os avisos dos documentos do cofre
 * — webhook 2.0, um para o cofre inteiro, em vez de uma chamada a mais por
 * envio. A resposta não é documentada: o 200 basta.
 *
 * Por ser do cofre, avisa também os documentos enviados pelo painel da
 * D4Sign; esses chegam como entregas sem envio correspondente.
 */
export async function registerSafeWebhook(safeUuid: string, url: string): Promise<void> {
  await d4signRequest('/webhooks/v2/', { json: { type: 'cofre', uuid: safeUuid, url } })
}
