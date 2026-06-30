import { createClient } from '@/lib/supabase/client'
import type { LeadWithRelations, LeadStage, LeadMovement, LeadComment } from '@/types/lead.types'
import type { CreateLeadInput, UpdateLeadInput, MoveLeadInput, LeadCommentInput } from '@/schemas/lead.schema'

const supabase = createClient()

export async function getLeadStages(): Promise<LeadStage[]> {
  const { data, error } = await supabase
    .from('lead_stages')
    .select('*')
    .order('position')

  if (error) throw error
  return data
}

export async function getLeads(): Promise<LeadWithRelations[]> {
  const { data, error } = await supabase
    .from('leads')
    .select(`
      *,
      stage:lead_stages(*),
      assignee:profiles!leads_assigned_to_fkey(id, full_name, avatar_url, role, created_at),
      creator:profiles!leads_created_by_fkey(id, full_name, avatar_url, role, created_at)
    `)
    .order('position')

  if (error) throw error
  return data as LeadWithRelations[]
}

export async function createLead(
  input: CreateLeadInput,
  userId: string
): Promise<LeadWithRelations> {
  const { data: stageLeads } = await supabase
    .from('leads')
    .select('position')
    .eq('stage_id', input.stage_id)
    .order('position', { ascending: false })
    .limit(1)

  const position = stageLeads?.[0]?.position != null ? stageLeads[0].position + 1 : 0

  const { data, error } = await supabase
    .from('leads')
    .insert({ ...input, created_by: userId, position })
    .select(`
      *,
      stage:lead_stages(*),
      assignee:profiles!leads_assigned_to_fkey(id, full_name, avatar_url, role, created_at),
      creator:profiles!leads_created_by_fkey(id, full_name, avatar_url, role, created_at)
    `)
    .single()

  if (error) throw error

  await supabase.from('activities').insert({
    type: 'lead_created',
    entity_type: 'lead',
    entity_id: data.id,
    entity_title: data.name,
    actor_id: userId,
  })

  return data as LeadWithRelations
}

export async function updateLead(input: UpdateLeadInput): Promise<void> {
  const { id, ...rest } = input
  const { error } = await supabase.from('leads').update(rest).eq('id', id)
  if (error) throw error
}

export async function deleteLead(id: string): Promise<void> {
  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) throw error
}

export async function moveLead(input: MoveLeadInput, userId: string): Promise<void> {
  const { data: lead } = await supabase
    .from('leads')
    .select('stage_id')
    .eq('id', input.lead_id)
    .single()

  const { error } = await supabase
    .from('leads')
    .update({ stage_id: input.to_stage_id, position: input.position })
    .eq('id', input.lead_id)

  if (error) throw error

  if (lead && lead.stage_id !== input.to_stage_id) {
    await supabase.from('lead_movements').insert({
      lead_id: input.lead_id,
      from_stage_id: lead.stage_id,
      to_stage_id: input.to_stage_id,
      moved_by: userId,
    })

    const { data: leadData } = await supabase
      .from('leads')
      .select('name')
      .eq('id', input.lead_id)
      .single()

    if (leadData) {
      await supabase.from('activities').insert({
        type: 'lead_moved',
        entity_type: 'lead',
        entity_id: input.lead_id,
        entity_title: leadData.name,
        actor_id: userId,
        metadata: { from_stage_id: lead.stage_id, to_stage_id: input.to_stage_id },
      })
    }
  }
}

export async function getLeadMovements(leadId: string): Promise<LeadMovement[]> {
  const { data, error } = await supabase
    .from('lead_movements')
    .select(`
      *,
      from_stage:lead_stages!lead_movements_from_stage_id_fkey(*),
      to_stage:lead_stages!lead_movements_to_stage_id_fkey(*),
      mover:profiles!lead_movements_moved_by_fkey(id, full_name, avatar_url, role, created_at)
    `)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as LeadMovement[]
}

export async function getLeadComments(leadId: string): Promise<LeadComment[]> {
  const { data, error } = await supabase
    .from('lead_comments')
    .select(`
      *,
      author:profiles!lead_comments_author_id_fkey(id, full_name, avatar_url, role, created_at)
    `)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data as LeadComment[]
}

export async function addLeadComment(
  leadId: string,
  input: LeadCommentInput,
  userId: string
): Promise<LeadComment> {
  const { data, error } = await supabase
    .from('lead_comments')
    .insert({ lead_id: leadId, author_id: userId, content: input.content })
    .select(`
      *,
      author:profiles!lead_comments_author_id_fkey(id, full_name, avatar_url, role, created_at)
    `)
    .single()

  if (error) throw error
  return data as LeadComment
}

export async function deleteLeadComment(id: string): Promise<void> {
  const { error } = await supabase.from('lead_comments').delete().eq('id', id)
  if (error) throw error
}
