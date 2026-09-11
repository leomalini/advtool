import { z } from 'zod'

export const CRM_LEGAL_AREAS = [
  'trabalhista',
  'civel',
  'familia',
  'tributario',
  'criminal',
  'previdenciario',
  'consumidor',
] as const

export const CRM_TAGS = [
  'urgente',
  'prazo-fatal',
  'audiencia',
  'aguardando-cliente',
  'prioridade-alta',
  'recurso',
  'acordo',
  'novo',
] as const

export type CrmLegalArea = (typeof CRM_LEGAL_AREAS)[number]

/**
 * Etiqueta de um item do CRM.
 *
 * `CRM_TAGS` são as que vêm de fábrica, mas a lista NÃO é fechada: o
 * formulário permite criar uma na hora. O `(string & {})` mantém o
 * autocompletar das conhecidas sem recusar as novas — e a coluna `tags` já é
 * `text[]` sem CHECK desde a migration 9, então o banco sempre aceitou.
 */
export type CrmTag = (typeof CRM_TAGS)[number] | (string & {})

/** Uma etiqueta gravável: texto curto e sem espaços nas pontas. O limite
 * existe para a etiqueta caber no chip — não é regra do banco. */
export const crmTagSchema = z
  .string()
  .trim()
  .min(1, 'Etiqueta vazia')
  .max(40, 'Etiqueta muito longa')

export const crmItemSchema = z.object({
  title: z.string().min(1, 'Informe o título do caso').max(200),
  client_id: z.string().uuid('ID de cliente inválido').optional().nullable(),
  legal_area: z.enum(CRM_LEGAL_AREAS).optional().nullable(),
  workflow_id: z.string().min(1, 'Selecione um workflow'),
  column_id: z.string().min(1, 'Selecione uma etapa'),
  assigned_to: z.string().uuid().optional().nullable(),
  tags: z.array(crmTagSchema),
  next_deadline: z.string().min(1, 'Informe o próximo prazo'),
  next_task_summary: z.string().max(300).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  legal_process_id: z.string().uuid().optional().nullable(),
})

export type CrmItemInput = z.infer<typeof crmItemSchema>
