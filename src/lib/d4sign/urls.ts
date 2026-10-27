import { publicAppBaseUrl } from '@/lib/appUrl'

/** O nosso endpoint de recebimento. O caminho é fixo; só a base vem do
 * ambiente (ver `lib/appUrl.ts`). */
export const D4SIGN_WEBHOOK_PATH = '/api/webhooks/d4sign'

/** HTTPS e fora de localhost — o mesmo critério de `publicAppBaseUrl`. */
function isReachable(url: string): boolean {
  if (!/^https:\/\//i.test(url)) return false
  return !/^https:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url)
}

/**
 * Onde a D4Sign entrega os avisos — o endereço que cada envio registra no
 * próprio documento.
 *
 * `D4SIGN_WEBHOOK_URL` vence `APP_PUBLIC_URL`. O `.env` local aponta
 * `APP_PUBLIC_URL` para a produção: um envio de teste feito no dev mandaria
 * os avisos para lá, e a variável própria permite apontar para um túnel ou um
 * preview.
 *
 * Null quando não há endereço que a D4Sign alcance — e aí nada é registrado.
 */
export function d4signWebhookEndpoint(): string | null {
  const override = process.env.D4SIGN_WEBHOOK_URL?.trim()
  if (override) return isReachable(override) ? override : null

  const base = publicAppBaseUrl()
  return base ? `${base}${D4SIGN_WEBHOOK_PATH}` : null
}
