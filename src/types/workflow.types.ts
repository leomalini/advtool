export interface WorkflowColumn {
  id: string
  workflow_id: string
  nome: string
  cor: string
  posicao: number
  limite: number | null
}

export interface Workflow {
  id: string
  nome: string
  descricao: string
  cor: string
  colunas: WorkflowColumn[]
}
