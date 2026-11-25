import { z } from 'zod'

/** Percentual com até duas casas, como as colunas `numeric` da migration 97. */
export function percentSchema(max: number) {
  return z
    .number()
    .min(0)
    .max(max)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
      message: 'Até duas casas decimais.',
    })
}

/** Multa, juros ao mês e desconto no Pix; null ou 0 desliga. A InfinitePay
 * pede o desconto maior que 0 e menor que 100. */
export const billingTermsSchema = z.object({
  lateFeePercent: percentSchema(100).nullable().optional(),
  monthlyInterestPercent: percentSchema(100).nullable().optional(),
  pixDiscountPercent: percentSchema(99.99).nullable().optional(),
})
