import { z } from 'zod'

/**
 * As respostas da D4Sign que a fundação usa. A documentação mostra os campos,
 * mas não o envelope (lista ou objeto) nem o tipo dos números: cada schema
 * aceita as leituras plausíveis até o spike dizer qual chega.
 */

/** Contagem que pode chegar como número ou como texto. */
const count = z.union([
  z.number().int().nonnegative(),
  z.string().trim().regex(/^\d+$/).transform(Number),
])

/**
 * `GET /safes`. A documentação diz `uuid-safe`, mas a produção respondeu
 * `uuid_safe` — com `name-safe` ainda de hífen (spike, 2026-10-22). Aceita as
 * duas grafias e já entrega `{ uuid, name }`.
 */
const safeSchema = z
  .object({
    uuid_safe: z.string().min(1).optional(),
    'uuid-safe': z.string().min(1).optional(),
    'name-safe': z.string(),
  })
  .transform((safe, context) => {
    const uuid = safe.uuid_safe ?? safe['uuid-safe']
    if (!uuid) {
      context.addIssue({ code: 'custom', message: 'Cofre sem uuid_safe.' })
      return z.NEVER
    }
    return { uuid, name: safe['name-safe'] }
  })

export const safeListSchema = z.union([
  z.array(safeSchema),
  safeSchema.transform((safe) => [safe]),
])

const balanceObjectSchema = z.object({ credit: count, sent: count })

/** `GET /account/balance` — `credit`, `sent` e `used_balance` ("372/999").
 * Na produção (spike, 2026-10-22) `credit` veio texto ("20") e `sent`
 * número (4), mais os blocos `sms` e `whatsapp`, que a fundação não usa. */
export const balanceSchema = z.union([
  balanceObjectSchema,
  z
    .array(balanceObjectSchema)
    .length(1)
    .transform(([balance]) => balance),
])

/** `POST /folders/{cofre}/create` → `{ message: "Folder created", uuid }`. */
export const createdFolderSchema = z.object({ uuid: z.string().min(1) })
