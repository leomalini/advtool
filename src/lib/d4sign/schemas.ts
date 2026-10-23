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

const safeSchema = z.object({
  'uuid-safe': z.string().min(1),
  'name-safe': z.string(),
})

/** `GET /safes` — `uuid-safe` e `name-safe` de cada cofre. */
export const safeListSchema = z.union([
  z.array(safeSchema),
  safeSchema.transform((safe) => [safe]),
])

const balanceObjectSchema = z.object({ credit: count, sent: count })

/** `GET /account/balance` — `credit`, `sent` e `used_balance` ("372/999"). */
export const balanceSchema = z.union([
  balanceObjectSchema,
  z
    .array(balanceObjectSchema)
    .length(1)
    .transform(([balance]) => balance),
])

/** `POST /folders/{cofre}/create` → `{ message: "Folder created", uuid }`. */
export const createdFolderSchema = z.object({ uuid: z.string().min(1) })
