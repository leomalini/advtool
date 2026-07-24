import { z } from 'zod'
import { CRM_LEGAL_AREAS, CRM_TAGS } from './crmItem.schema'

export const legalProcessSchema = z.object({
  // Campos do crm_item (item genérico do CRM que representa este processo)
  title: z.string().max(200).optional().nullable(),
  client_id: z.string().uuid('ID de cliente inválido').optional().nullable(),
  legal_area: z.enum(CRM_LEGAL_AREAS).optional().nullable(),
  column_id: z.string().min(1, 'Selecione uma etapa'),
  assigned_to: z.string().uuid().optional().nullable(),
  tags: z.array(z.enum(CRM_TAGS)),
  next_deadline: z.string().min(1, 'Informe o próximo prazo'),
  next_task_summary: z.string().max(300).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),

  // Campos jurídicos (legal_processes)
  cnj_number: z.string().min(1, 'Número CNJ obrigatório').max(25),
  court: z.string().max(200).optional().nullable(),
  court_division: z.string().max(200).optional().nullable(),
  plaintiff: z.string().max(200).optional().nullable(),
  defendant: z.string().max(200).optional().nullable(),
  opposing_counsel: z.string().max(200).optional().nullable(),
})

export type LegalProcessInput = z.infer<typeof legalProcessSchema>
