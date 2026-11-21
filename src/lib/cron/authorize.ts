// Server-side. O porteiro das rotas de cron (`vercel.json`).
import { timingSafeEqual } from 'node:crypto'

/**
 * A Vercel manda `Authorization: Bearer <CRON_SECRET>` quando a variável
 * existe. Sem `CRON_SECRET` configurado, recusa tudo: ninguém de fora dispara
 * gasto com IA nem envio de e-mail.
 *
 * Comparação em tempo constante — o segredo não vaza pela demora da resposta.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(request.headers.get('authorization') ?? '')
  return received.length === expected.length && timingSafeEqual(received, expected)
}
