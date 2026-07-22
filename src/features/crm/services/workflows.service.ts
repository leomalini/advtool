import { createClient } from '@/lib/supabase/client'
import type { Workflow } from '@/types/workflow.types'

const supabase = createClient()

export async function getWorkflows(): Promise<Workflow[]> {
  const { data, error } = await supabase
    .from('workflows')
    .select('*, colunas:workflow_columns(*)')
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data as Workflow[]).map((wf) => ({
    ...wf,
    colunas: wf.colunas.slice().sort((a, b) => a.posicao - b.posicao),
  }))
}
