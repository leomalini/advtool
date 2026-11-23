import { publicAppBaseUrl } from '@/lib/appUrl'
import { deriveBillingToken } from './token'

/** O caminho da página pública da cobrança. */
export const BILLING_PAGE_PATH = '/pagar'

/**
 * A base da URL que o escritório manda ao cliente.
 *
 * Em produção, `APP_PUBLIC_URL`: é o endereço que o cliente alcança. Fora dela,
 * a origem de quem pediu — o `.env` local aponta `APP_PUBLIC_URL` para a
 * produção, e um link gerado no desenvolvimento abriria a página de lá, que
 * ainda não tem o código novo.
 */
export function billingPageBaseUrl(requestOrigin: string): string {
  if (process.env.NODE_ENV !== 'production') return requestOrigin.replace(/\/+$/, '')
  return publicAppBaseUrl() ?? requestOrigin.replace(/\/+$/, '')
}

/** `/pagar/<token>` da cobrança, sem a base — o portal usa assim, na mesma
 * origem. */
export async function billingPagePath(billingId: string): Promise<string> {
  return `${BILLING_PAGE_PATH}/${await deriveBillingToken(billingId)}`
}

/** A URL completa que o escritório manda. */
export async function billingPageUrl(billingId: string, requestOrigin: string): Promise<string> {
  return `${billingPageBaseUrl(requestOrigin)}${await billingPagePath(billingId)}`
}
