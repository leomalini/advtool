import { publicAppBaseUrl } from '@/lib/appUrl'

/** O nosso endpoint de recebimento. O caminho é fixo; só a base vem do
 * ambiente (ver `lib/appUrl.ts`). */
export const INFINITEPAY_WEBHOOK_PATH = '/api/webhooks/infinitepay'

/**
 * Onde a InfinitePay entrega os pagamentos, sem o token — para a tela mostrar
 * se a confirmação automática é possível.
 *
 * Null quando a aplicação não está publicada num endereço que a InfinitePay
 * alcance: o link sai sem webhook, e a baixa passa a depender de o cliente
 * voltar pelo "Continuar".
 */
export function infinitePayWebhookEndpoint(): string | null {
  const base = publicAppBaseUrl()
  return base ? `${base}${INFINITEPAY_WEBHOOK_PATH}` : null
}

/** A `webhook_url` de um link: o endpoint com o token daquela cobrança. */
export function infinitePayWebhookUrl(token: string): string | null {
  const endpoint = infinitePayWebhookEndpoint()
  return endpoint ? `${endpoint}?t=${encodeURIComponent(token)}` : null
}
