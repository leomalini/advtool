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
 * A base dos links que o escritório manda para fora (o link de acompanhamento,
 * copiado na tela ou enviado por e-mail). `APP_PUBLIC_URL` tem prioridade: em
 * produção atrás de proxy, o `origin` da requisição pode ser o endereço interno
 * do container. Sem ela, o `origin` — que em desenvolvimento é o certo.
 *
 * Diferente das duas funções acima, não exige HTTPS: quem abre o link é uma
 * pessoa, e em desenvolvimento ela abre `http://localhost`.
 */
export function requestPublicOrigin(requestOrigin: string): string {
  return configuredBase() ?? requestOrigin
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
