/**
 * Onde a BuscaProcessos deve entregar — o NOSSO endpoint de recebimento.
 *
 * O caminho é fixo no código e só a base vem do ambiente: quem configura
 * informa onde a aplicação está publicada, não uma URL qualquer. Deixar a base
 * vir do corpo da requisição permitiria apontar o callback da conta para outro
 * servidor.
 */

export const WEBHOOK_PATH = '/api/webhooks/buscaprocessos'

/**
 * Null quando a base não serve — e aí o monitoramento é criado sem entrega
 * automática, o que é honesto, em vez de registrar um endereço inalcançável e
 * dar aparência de funcionamento.
 */
export function webhookUrl(): string | null {
  const base = process.env.APP_PUBLIC_URL?.trim().replace(/\/+$/, '')
  if (!base) return null

  // A API exige HTTPS no webhook — está na descrição do próprio endpoint. Um
  // endereço em HTTP faz o cadastro voltar 422 sem dizer o porquê.
  if (!/^https:\/\//i.test(base)) return null

  // localhost não é alcançável pela BuscaProcessos.
  if (/^https:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(base)) return null

  return `${base}${WEBHOOK_PATH}`
}

/**
 * A mesma URL, mas aceitando localhost — é para o disparo de teste em HTTP, que
 * sai daqui mesmo e volta para cá. Null quando `APP_PUBLIC_URL` está vazia.
 */
export function localWebhookUrl(): string | null {
  const base = process.env.APP_PUBLIC_URL?.trim().replace(/\/+$/, '')
  if (!base) return null
  if (!/^https?:\/\//i.test(base)) return null
  return `${base}${WEBHOOK_PATH}`
}
