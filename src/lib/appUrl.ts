/**
 * A base pública da aplicação (`APP_PUBLIC_URL`), para os endereços que um
 * serviço externo chama de volta: o webhook da BuscaProcessos e o da
 * InfinitePay.
 *
 * Só a base vem do ambiente; cada integração fixa o próprio caminho no código.
 * Deixar a base vir do corpo da requisição permitiria apontar um callback para
 * outro servidor.
 */

function configuredBase(): string | null {
  const base = process.env.APP_PUBLIC_URL?.trim().replace(/\/+$/, '')
  return base || null
}

/**
 * A base que um serviço externo consegue alcançar: HTTPS e fora de localhost.
 *
 * Null quando não serve — e aí a integração segue sem entrega automática, o que
 * é honesto, em vez de registrar um endereço inalcançável e dar aparência de
 * funcionamento.
 */
export function publicAppBaseUrl(): string | null {
  const base = configuredBase()
  if (!base) return null
  if (!/^https:\/\//i.test(base)) return null
  if (/^https:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(base)) return null
  return base
}

/**
 * A mesma base aceitando HTTP e localhost — para o que sai daqui mesmo e volta
 * para cá (o disparo de teste do webhook). Null quando `APP_PUBLIC_URL` está
 * vazia ou não é uma URL HTTP.
 */
export function localAppBaseUrl(): string | null {
  const base = configuredBase()
  if (!base) return null
  if (!/^https?:\/\//i.test(base)) return null
  return base
}
