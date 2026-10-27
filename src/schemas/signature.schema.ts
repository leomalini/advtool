import { z } from 'zod'
import { SIGNATURE_ACTS, SIGNER_AUTH_METHODS } from '@/types/signature.types'

/**
 * O pedido de envio para assinatura, como a tela manda e a rota confere.
 * A rota valida de novo o que depende do banco: o arquivo é do contrato (ou
 * avulso, quando não há contrato), os recursos do plano estão ligados, o
 * advogado existe.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null))

export const signerInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Informe o nome de quem assina.').max(200),
    /** Vazio só para alguém do escritório: o servidor usa o e-mail do login. */
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .nullable()
      .transform((value) => (value ? value : null))
      .pipe(z.email('E-mail inválido.').nullable()),
    /** CPF ou CNPJ, só dígitos. */
    document: z
      .string()
      .regex(/^(\d{11}|\d{14})$/, 'CPF ou CNPJ incompleto.')
      .nullable(),
    /** Celular em E.164 (+5527999998888), quando o link também vai pelo WhatsApp. */
    whatsapp: z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/, 'Celular inválido.')
      .nullable(),
    act: z.literal([...SIGNATURE_ACTS]),
    auth: z.enum(SIGNER_AUTH_METHODS),
    contractPartyId: z.uuid().nullable(),
    clientId: z.uuid().nullable(),
    profileId: z.uuid().nullable(),
  })
  .refine((signer) => signer.email !== null || signer.profileId !== null, {
    message: 'Informe o e-mail de quem assina.',
    path: ['email'],
  })
  .refine(
    (signer) =>
      !['pix', 'score'].includes(signer.auth) || (signer.document?.length ?? 0) === 11,
    { message: 'Pix e biometria pedem o CPF de quem assina.', path: ['document'] },
  )

export type SignerInput = z.infer<typeof signerInputSchema>

export const sendForSignatureSchema = z.object({
  /** O contrato do arquivo; null para um documento avulso (procuração,
   * declaração). A rota confere contra o próprio arquivo. */
  contractId: z.uuid().nullable(),
  documentId: z.uuid(),
  safe: z.object({
    uuid: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(200),
  }),
  signers: z
    .array(signerInputSchema)
    .min(1, 'Inclua ao menos uma pessoa para assinar.')
    .max(20, 'No máximo 20 signatários por envio.'),
  ordered: z.boolean(),
  message: optionalText(1000),
  /** 'yyyy-MM-dd'; a D4Sign cancela sozinha passado o dia. */
  deadline: z.iso.date().nullable(),
})

export type SendForSignatureInput = z.infer<typeof sendForSignatureSchema>
