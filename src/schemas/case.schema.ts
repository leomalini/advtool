import { z } from 'zod'

export const CASE_LEGAL_AREAS = [
  'trabalhista',
  'civel',
  'familia',
  'tributario',
  'criminal',
  'previdenciario',
  'consumidor',
] as const

export const CASE_TAGS = [
  'urgente',
  'prazo-fatal',
  'audiencia',
  'aguardando-cliente',
  'prioridade-alta',
  'recurso',
  'acordo',
  'novo',
] as const

export type CaseLegalArea = (typeof CASE_LEGAL_AREAS)[number]
export type CaseTag = (typeof CASE_TAGS)[number]

export const caseSchema = z.object({
  title: z.string().max(200).optional().nullable(),
  client_id: z.string().uuid('ID de cliente inválido').optional().nullable(),
  cnj_number: z.string().max(25).optional().nullable(),
  court: z.string().max(200).optional().nullable(),
  court_division: z.string().max(200).optional().nullable(),
  legal_area: z.enum(CASE_LEGAL_AREAS).optional().nullable(),
  workflow_id: z.string().min(1, 'Selecione um workflow'),
  column_id: z.string().min(1, 'Selecione uma etapa'),
  assigned_to: z.string().uuid().optional().nullable(),
  tags: z.array(z.enum(CASE_TAGS)),
  next_deadline: z.string().optional().nullable(),
  next_task_summary: z.string().max(300).optional().nullable(),
  plaintiff: z.string().max(200).optional().nullable(),
  defendant: z.string().max(200).optional().nullable(),
  opposing_counsel: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
})

export type CaseInput = z.infer<typeof caseSchema>
