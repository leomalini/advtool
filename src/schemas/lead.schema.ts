import { z } from 'zod'

export const leadOriginSchema = z.enum([
  'google_ads',
  'instagram',
  'facebook',
  'organic',
  'referral',
])

export const createLeadSchema = z.object({
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(100),
  phone: z
    .string()
    .regex(/^[\d\s\-\(\)\+]*$/, 'Telefone inválido')
    .optional()
    .or(z.literal('')),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  origin: leadOriginSchema.optional(),
  stage_id: z.string().uuid('Etapa inválida'),
  assigned_to: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
})

export const updateLeadSchema = createLeadSchema.partial().extend({
  id: z.string().uuid(),
})

export const moveLeadSchema = z.object({
  lead_id: z.string().uuid(),
  to_stage_id: z.string().uuid(),
  position: z.number().int().min(0),
})

export const leadCommentSchema = z.object({
  content: z.string().min(1, 'Comentário não pode ser vazio').max(2000),
})

export type CreateLeadInput = z.infer<typeof createLeadSchema>
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>
export type MoveLeadInput = z.infer<typeof moveLeadSchema>
export type LeadCommentInput = z.infer<typeof leadCommentSchema>
