import { createClient } from '@/lib/supabase/client'
import { AI_FILE_TYPES, aiFileTypeFromName, sanitizeFileName } from '@/features/ia/files/constants'
import { inspectTemplateFields } from '@/features/ia/templates/docx'
import type { DocumentTemplate } from '@/types/documentTemplate.types'

const supabase = createClient()

const BUCKET = 'attachments'
const TEMPLATE_SELECT =
  'id, name, description, file_path, file_name, fields, created_by, created_at, updated_at'

export async function getTemplates(): Promise<DocumentTemplate[]> {
  const { data, error } = await supabase
    .from('document_templates')
    .select(TEMPLATE_SELECT)
    .order('name')
  if (error) throw error
  return (data ?? []) as DocumentTemplate[]
}

/**
 * Campos do modelo, lidos no navegador antes de salvar — a tela mostra o que
 * foi encontrado e recusa na hora um modelo com chave aberta, em vez de o erro
 * aparecer só quando alguém pedir uma petição.
 *
 * Lança `TemplateSyntaxError` (de `ia/templates/docx`) com os campos mal formados.
 */
export async function inspectTemplateFile(file: File): Promise<string[]> {
  if (aiFileTypeFromName(file.name)?.kind !== 'docx') {
    throw new Error('O modelo precisa ser um arquivo .docx (Word).')
  }
  return inspectTemplateFields(new Uint8Array(await file.arrayBuffer()))
}

export async function createTemplate(
  input: { name: string; description: string; file: File },
  userId: string,
): Promise<DocumentTemplate> {
  const fields = await inspectTemplateFile(input.file)

  const id = crypto.randomUUID()
  const filePath = `modelos/${id}/${Date.now()}-${sanitizeFileName(input.file.name)}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, input.file, { contentType: AI_FILE_TYPES.docx.mediaType })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('document_templates')
    .insert({
      id,
      name: input.name.trim(),
      description: input.description.trim() || null,
      file_path: filePath,
      file_name: input.file.name,
      fields,
      created_by: userId,
    })
    .select(TEMPLATE_SELECT)
    .single()

  if (error) {
    // Mesmo rollback de `uploadDocument`: arquivo sem linha ficaria órfão.
    await supabase.storage.from(BUCKET).remove([filePath])
    throw error
  }
  return data as DocumentTemplate
}

/** Linha primeiro, arquivo depois — mesma ordem de `deleteDocument`: se a
 * remoção do arquivo falhar, sobra só um objeto invisível, não uma linha
 * apontando para nada. */
export async function deleteTemplate(template: Pick<DocumentTemplate, 'id' | 'file_path'>): Promise<void> {
  const { error } = await supabase.from('document_templates').delete().eq('id', template.id)
  if (error) throw error

  const { error: removeError } = await supabase.storage.from(BUCKET).remove([template.file_path])
  if (removeError) {
    console.error('[modelos] remoção do arquivo falhou:', template.file_path, removeError.message)
  }
}
