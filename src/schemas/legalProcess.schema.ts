import { z } from 'zod'
import { CRM_LEGAL_AREAS, crmTagSchema } from './crmItem.schema'

/** Uma parte do processo.
 *
 * Nada aqui é obrigatório — nem o nome. Uma linha em branco é a que o usuário
 * acabou de adicionar e ainda não preencheu; bloquear o salvamento por causa
 * dela seria hostil. O service descarta as sem nome antes de gravar. */
export const legalProcessPartySchema = z.object({
  name: z.string().max(200),
  document: z
    .string()
    .max(30)
    .optional()
    .nullable()
    // Vazio é legítimo (a maioria das partes vem do tribunal sem documento),
    // mas preenchido pela metade não: 11 dígitos é CPF, 14 é CNPJ, e qualquer
    // outra contagem é digitação inacabada.
    .refine(
      (v) => !v || [11, 14].includes(v.replace(/\D/g, '').length),
      'Informe um CPF ou CNPJ completo'
    ),
  polo: z.enum(['ativo', 'passivo']),
  party_type: z.string().max(100).optional().nullable(),
  position: z.number().int().nonnegative(),
  client_id: z.string().uuid().optional().nullable(),
})

export const legalProcessSchema = z.object({
  // Campos do crm_item (item genérico do CRM que representa este processo)
  title: z.string().max(200).optional().nullable(),
  client_id: z.string().uuid('ID de cliente inválido').optional().nullable(),
  legal_area: z.enum(CRM_LEGAL_AREAS).optional().nullable(),
  column_id: z.string().min(1, 'Selecione uma etapa'),
  assigned_to: z.string().uuid().optional().nullable(),
  tags: z.array(crmTagSchema),
  next_deadline: z.string().min(1, 'Informe o próximo prazo'),
  next_task_summary: z.string().max(300).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),

  // Campos jurídicos (legal_processes)
  cnj_number: z.string({ error: 'Número CNJ obrigatório' }).min(1, 'Número CNJ obrigatório').max(25),
  court: z.string().max(200).optional().nullable(),
  court_division: z.string().max(200).optional().nullable(),
  plaintiff: z.string().max(200).optional().nullable(),
  defendant: z.string().max(200).optional().nullable(),
  opposing_counsel: z.string().max(200).optional().nullable(),

  // Identificação exibida na faixa de infos do detalhe
  // Opcionais no schema porque a coluna já tem DEFAULT no banco — usar
  // .default() aqui tornaria o campo obrigatório no tipo inferido, obrigando
  // todo call site a informá-lo.
  process_type: z.enum(['judicial', 'administrativo']).optional(),
  status: z.enum(['ativo', 'arquivado', 'suspenso']).optional(),
  procedural_class: z.string().max(200).optional().nullable(),
  subject: z.string().max(300).optional().nullable(),
  comarca: z.string().max(200).optional().nullable(),
  // coerce: o input de valor entrega string; '' vira null no service.
  case_value: z.coerce.number().nonnegative().optional().nullable(),
  filing_date: z.string().optional().nullable(),

  // Ausente = o formulário não mexeu nas partes. Presente (mesmo vazio) = a
  // lista completa, que substitui a atual.
  parties: z.array(legalProcessPartySchema).optional(),
})

export type LegalProcessInput = z.infer<typeof legalProcessSchema>
