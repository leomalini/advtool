import { z } from 'zod'

/**
 * A mensagem avulsa que o escritório escreve para o cliente (docs/
 * emails-clientes.md, "Mensagem avulsa"). O mesmo schema valida o formulário
 * e a rota — o navegador não é a única porta.
 *
 * Texto puro: sem HTML, sem Markdown. O template escapa tudo e só preserva as
 * quebras de linha.
 */

export const CLIENT_MESSAGE_LIMITS = {
  subject: 150,
  /** Folgado para uma carta; pequeno o bastante para não virar anexo colado. */
  body: 10_000,
} as const

export const clientMessageSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, 'Escreva o assunto.')
    .max(CLIENT_MESSAGE_LIMITS.subject, `Até ${CLIENT_MESSAGE_LIMITS.subject} caracteres.`)
    // Quebra de linha no assunto viraria cabeçalho novo no e-mail.
    .refine((value) => !/[\r\n]/.test(value), 'O assunto fica numa linha só.'),
  body: z
    .string()
    .trim()
    .min(1, 'Escreva a mensagem.')
    .max(CLIENT_MESSAGE_LIMITS.body, `Até ${CLIENT_MESSAGE_LIMITS.body} caracteres.`),
})

export type ClientMessageInput = z.infer<typeof clientMessageSchema>

/** O corpo da rota: a mensagem e se é só para ver como fica. */
export const clientMessageRequestSchema = clientMessageSchema.extend({
  preview: z.boolean().default(false),
})
