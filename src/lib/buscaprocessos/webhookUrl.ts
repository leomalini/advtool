import { localAppBaseUrl, publicAppBaseUrl } from '@/lib/appUrl'

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
 *
 * A API exige HTTPS no webhook — está na descrição do próprio endpoint; um
 * endereço em HTTP faz o cadastro voltar 422 sem dizer o porquê. E localhost
 * não é alcançável pela BuscaProcessos. As duas regras moram em
 * `publicAppBaseUrl`.
 */
export function webhookUrl(): string | null {
  const base = publicAppBaseUrl()
  return base ? `${base}${WEBHOOK_PATH}` : null
}

/**
 * A mesma URL, mas aceitando localhost — é para o disparo de teste em HTTP, que
 * sai daqui mesmo e volta para cá. Null quando `APP_PUBLIC_URL` está vazia.
 */
export function localWebhookUrl(): string | null {
  const base = localAppBaseUrl()
  return base ? `${base}${WEBHOOK_PATH}` : null
}
