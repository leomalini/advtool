/** Espelha `public.document_templates` (migration 62). */
export interface DocumentTemplate {
  id: string
  name: string
  description: string | null
  /** Caminho no bucket `attachments`, em `modelos/<id>/…`. */
  file_path: string
  file_name: string
  /** Todos os campos `{...}` do arquivo, detectados no upload. Quais são de
   * cadastro e quais a IA redige decide o catálogo (`ia/templates/catalog.ts`). */
  fields: string[]
  created_by: string
  created_at: string
  updated_at: string
}
