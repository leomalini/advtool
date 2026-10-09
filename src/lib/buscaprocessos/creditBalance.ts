// Server-side only: chama a BuscaProcessos com a chave da conta.
import { z } from 'zod'
import { BpApiError, getContaSaldo } from './client'

/** O `data` de `GET /v1/conta/saldo`, conferido aqui antes de ir para a tela:
 * um saldo que chegasse como texto viraria "R$ NaN" no dashboard. */
const contaSaldoSchema = z.object({
  credits: z.number(),
  currency: z.string().min(1),
  accountStatus: z.string().min(1),
})

/** O saldo de créditos da conta, para o dashboard. Só o tipo vai para a tela
 * (`import type`): este módulo arrasta o client, que tem a chave. */
export interface CreditBalance {
  /** Em `currency` — os preços da API são em reais. */
  credits: number
  /** Código ISO 4217 ("BRL"). */
  currency: string
  /** "ACTIVE" na resposta observada; os outros valores não estão documentados. */
  accountStatus: string
  /** Quando este servidor leu o saldo. `meta.servedAt` vem só com a hora
   * ("14:32:10"), sem data nem fuso, e não serve para isso. */
  checkedAt: string
}

/** A consulta não é cobrada e não tem limite de chamadas. */
export async function readCreditBalance(): Promise<CreditBalance> {
  const { data } = await getContaSaldo()
  const parsed = contaSaldoSchema.safeParse(data)

  if (!parsed.success) {
    throw new BpApiError(
      502,
      `Resposta inesperada do /v1/conta/saldo: ${JSON.stringify(data).slice(0, 300)}`,
    )
  }
  return { ...parsed.data, checkedAt: new Date().toISOString() }
}
