import { createClient } from '@/lib/supabase/client'
import { AI_FILE_TYPES, aiFileTypeFromName, sanitizeFileName } from '@/features/ia/files/constants'
import { parseFieldSettings } from '@/schemas/documentTemplate.schema'
import type {
  DocumentTemplate,
  TemplateCategory,
  TemplateFieldSettings,
} from '@/types/documentTemplate.types'
import { settingsForFields } from '../templates/fieldSettings'

const supabase = createClient()

const BUCKET = 'attachments'
const TEMPLATE_SELECT =
  'id, name, description, category, file_path, file_name, fields, field_settings, created_by, ' +
  'created_at, updated_at'

function toTemplate(row: Record<string, unknown>): DocumentTemplate {
  return {
    ...(row as unknown as DocumentTemplate),
    fields: (row.fields as string[] | null) ?? [],
    field_settings: parseFieldSettings(row.field_settings),
  }
}

export async function getTemplates(): Promise<DocumentTemplate[]> {
  const { data, error } = await supabase
    .from('document_templates')
    .select(TEMPLATE_SELECT)
    .order('name')
  if (error) throw error
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toTemplate)
}

/**
 * Campos do modelo, lidos no navegador antes de salvar — a tela mostra o que
 * foi encontrado e recusa na hora um modelo com chave aberta, em vez de o erro
 * aparecer só quando alguém gerar um documento.
 *
 * O `docxtemplater` vem sob demanda: só quem sobe um modelo paga o download.
 * Lança `TemplateSyntaxError` (de `templates/docx`) com os campos mal formados.
 */
export async function inspectTemplateFile(file: File): Promise<string[]> {
  if (aiFileTypeFromName(file.name)?.kind !== 'docx') {
    throw new Error('O modelo precisa ser um arquivo .docx (Word).')
  }
  const { inspectTemplateFields } = await import('../templates/docx')
  return inspectTemplateFields(new Uint8Array(await file.arrayBuffer()))
}

function buildTemplatePath(templateId: string, fileName: string): string {
  return `modelos/${templateId}/${Date.now()}-${sanitizeFileName(fileName)}`
}

async function uploadTemplateFile(path: string, file: File): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: AI_FILE_TYPES.docx.mediaType })
  if (error) throw error
}

/** Falhar aqui deixa um arquivo órfão, bem menos grave que abortar uma
 * operação que já aconteceu — por isso loga e segue. */
async function removeTemplateFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) console.error('[modelos] remoção do arquivo falhou:', path, error.message)
}

export interface TemplateFormInput {
  name: string
  description: string
  category: TemplateCategory
  fieldSettings: TemplateFieldSettings
}

export async function createTemplate(
  input: TemplateFormInput & { file: File },
  userId: string,
): Promise<DocumentTemplate> {
  const fields = await inspectTemplateFile(input.file)

  const id = crypto.randomUUID()
  const filePath = buildTemplatePath(id, input.file.name)
  await uploadTemplateFile(filePath, input.file)

  const { data, error } = await supabase
    .from('document_templates')
    .insert({
      id,
      name: input.name.trim(),
      description: input.description.trim() || null,
      category: input.category,
      file_path: filePath,
      file_name: input.file.name,
      fields,
      field_settings: settingsForFields(fields, input.fieldSettings),
      created_by: userId,
    })
    .select(TEMPLATE_SELECT)
    .single()

  if (error) {
    // Mesmo rollback de `uploadDocument`: arquivo sem linha ficaria órfão.
    await removeTemplateFile(filePath)
    throw error
  }
  return toTemplate(data as unknown as Record<string, unknown>)
}

/**
 * Atualiza nome, categoria, descrição e definição dos campos — e, com `file`,
 * troca o .docx. O arquivo novo sobe antes de a linha mudar e o antigo só sai
 * depois: se algo falhar no meio, o modelo continua apontando para um arquivo
 * que existe.
 */
export async function updateTemplate(
  template: Pick<DocumentTemplate, 'id' | 'file_path' | 'fields'>,
  input: TemplateFormInput & { file: File | null },
): Promise<DocumentTemplate> {
  const replacement = input.file
    ? {
        file: input.file,
        fields: await inspectTemplateFile(input.file),
        path: buildTemplatePath(template.id, input.file.name),
      }
    : null
  if (replacement) await uploadTemplateFile(replacement.path, replacement.file)

  const fields = replacement?.fields ?? template.fields
  const { data, error } = await supabase
    .from('document_templates')
    .update({
      name: input.name.trim(),
      description: input.description.trim() || null,
      category: input.category,
      field_settings: settingsForFields(fields, input.fieldSettings),
      ...(replacement
        ? { file_path: replacement.path, file_name: replacement.file.name, fields }
        : {}),
    })
    .eq('id', template.id)
    .select(TEMPLATE_SELECT)
    .single()

  if (error) {
    if (replacement) await removeTemplateFile(replacement.path)
    throw error
  }
  if (replacement) await removeTemplateFile(template.file_path)
  return toTemplate(data as unknown as Record<string, unknown>)
}

/** Linha primeiro, arquivo depois — mesma ordem de `deleteDocument`: se a
 * remoção do arquivo falhar, sobra só um objeto invisível, não uma linha
 * apontando para nada. */
export async function deleteTemplate(
  template: Pick<DocumentTemplate, 'id' | 'file_path'>,
): Promise<void> {
  const { error } = await supabase.from('document_templates').delete().eq('id', template.id)
  if (error) throw error
  await removeTemplateFile(template.file_path)
}

/** Bytes do .docx do modelo, para preencher no navegador. */
export async function downloadTemplateBytes(filePath: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(BUCKET).download(filePath)
  if (error) throw error
  return new Uint8Array(await data.arrayBuffer())
}
