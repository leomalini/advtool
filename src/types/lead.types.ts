import type { BaseEntity, Profile } from './common.types'

export type LeadOrigin =
  | 'google_ads'
  | 'instagram'
  | 'facebook'
  | 'organic'
  | 'referral'

export const LEAD_ORIGIN_LABELS: Record<LeadOrigin, string> = {
  google_ads: 'Google Ads',
  instagram: 'Instagram',
  facebook: 'Facebook',
  organic: 'Orgânico',
  referral: 'Indicação',
}

export interface LeadStage {
  id: string
  name: string
  slug: string
  color: string
  position: number
  is_lost: boolean
}

export interface Lead extends BaseEntity {
  name: string
  phone: string | null
  email: string | null
  origin: LeadOrigin | null
  stage_id: string
  position: number
  assigned_to: string | null
  notes: string | null
  created_by: string
}

export interface LeadWithRelations extends Lead {
  stage: LeadStage
  assignee: Profile | null
  creator: Profile
}

export interface LeadMovement {
  id: string
  lead_id: string
  from_stage_id: string | null
  to_stage_id: string
  moved_by: string
  notes: string | null
  created_at: string
  from_stage?: LeadStage
  to_stage?: LeadStage
  mover?: Profile
}

export interface LeadComment extends BaseEntity {
  lead_id: string
  author_id: string
  content: string
  author?: Profile
}

export interface KanbanColumn {
  stage: LeadStage
  leads: LeadWithRelations[]
}
