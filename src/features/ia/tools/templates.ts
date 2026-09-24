import { tool } from 'ai'
import { z } from 'zod'
import {
  inspectTemplateFields,
  renderTemplate,
  TemplateSyntaxError,
} from '@/features/documentos/templates/docx'
import {
  classifyTemplateFields,
  type ClassifiedFields,
} from '@/features/documentos/templates/fieldSettings'
import {
  getProcessClientId,
  resolveTemplateFields,
} from '@/features/documentos/templates/resolveFields'
import { buildTemplateValues } from '@/features/documentos/templates/values'
import { parseFieldSettings } from '@/schemas/documentTemplate.schema'
import { DOCUMENT_CATEGORY_LABELS } from '@/types/document.types'
import { MANUAL_FIELD_FORMAT_LABELS, type TemplateCategory } from '@/types/documentTemplate.types'
import { AI_FILE_TYPES, AI_FILES_BUCKET } from '../files/constants'
import { downloadBytes, getAiFile, saveGeneratedFile } from '../files/storage'
import { clientLabel, toolError, type ToolClient } from './shared'

const DOCUMENTS_BUCKET = 'attachments'

export interface TemplateToolsContext {
  userId: string
  conversationId: string
}

interface TemplateRow {
  id: string
  name: string
  description: string | null
  category: TemplateCategory
  file_path: string
  fields: string[] | null
  field_settings: unknown
}

/** O modelo como o Assistente o descreve: o que o sistema preenche, o que
 * precisa vir do usuário e o que ele mesmo redige. */
function describeFields(classified: ClassifiedFields) {
  return {
    campos_do_cadastro: classified.cadastro,
    campos_manuais: classified.manual.map((field) => ({
      campo: field.name,
      rotulo: field.label,
      formato: MANUAL_FIELD_FORMAT_LABELS[field.format],
      ...(field.spelled ? { sai_tambem_por_extenso: true } : {}),
    })),
    campos_de_ia: classified.ai.map((field) => ({
      campo: field.name,
      rotulo: field.label,
      instrucao: field.instruction || undefined,
    })),
  }
}

/** Advogado padrão quando o usuário não diz: quem pede, se tiver OAB; senão o
 * único advogado ativo do escritório. Com mais de um, ninguém — e o aviso de
 * campo em branco leva o modelo a perguntar. */
async function defaultLawyerIds(supabase: ToolClient, userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_active', true)
    .not('oab_number', 'is', null)
  if (error) throw error
  const ids = (data ?? []).map((row) => row.id as string)
  if (ids.includes(userId)) return [userId]
  return ids.length === 1 ? ids : []
}

/** Nome do cliente para o nome do arquivo. */
async function fetchClientName(supabase: ToolClient, clientId: string): Promise<string | null> {
  const { data } = await supabase
    .from('clients')
    .select('type, name, company_name, trade_name')
    .eq('id', clientId)
    .maybeSingle()
  return clientLabel(data as Parameters<typeof clientLabel>[0])
}

type TemplateSource =
  | { error: string }
  | { name: string; bytes: Uint8Array; classified: ClassifiedFields }

/** O modelo cadastrado ou o .docx anexado na conversa, já com os campos
 * classificados. O anexo não tem definição gravada: vale o padrão pelo nome. */
async function loadSource(
  supabase: ToolClient,
  { templateId, fileId }: { templateId?: string; fileId?: string },
): Promise<TemplateSource> {
  if (templateId) {
    const { data, error } = await supabase
      .from('document_templates')
      .select('id, name, description, category, file_path, fields, field_settings')
      .eq('id', templateId)
      .maybeSingle()
    if (error) return toolError('o modelo', error)
    if (!data) return { error: 'Modelo não encontrado ou sem acesso.' }
    const row = data as TemplateRow
    return {
      name: row.name,
      bytes: await downloadBytes(supabase, DOCUMENTS_BUCKET, row.file_path),
      classified: classifyTemplateFields(row.fields ?? [], parseFieldSettings(row.field_settings)),
    }
  }

  const file = fileId ? await getAiFile(supabase, fileId) : null
  if (!file) return { error: 'Anexo não encontrado nesta conta.' }
  if (file.media_type !== AI_FILE_TYPES.docx.mediaType) {
    return { error: `"${file.file_name}" não é um .docx — só Word serve de modelo.` }
  }
  const bytes = await downloadBytes(supabase, AI_FILES_BUCKET, file.storage_path)
  return {
    name: file.file_name.replace(/\.docx$/i, ''),
    bytes,
    classified: classifyTemplateFields(inspectTemplateFields(bytes), {}),
  }
}

export function createTemplateTools(supabase: ToolClient, context: TemplateToolsContext) {
  return {
    listar_modelos: tool({
      description:
        'Modelos de documento do escritório (.docx): petições, procurações, contratos. Para cada ' +
        'um: campos do cadastro (o sistema preenche), campos manuais (valores que o USUÁRIO ' +
        'informa — nunca invente) e campos de IA (você redige, seguindo a instrução). Use ' +
        'antes de gerar_documento_de_modelo.',
      inputSchema: z.object({
        termo: z.string().max(120).optional().describe('Trecho do nome do modelo.'),
      }),
      execute: async ({ termo }) => {
        let query = supabase
          .from('document_templates')
          .select('id, name, description, category, fields, field_settings')
          .order('name')
        if (termo?.trim()) query = query.ilike('name', `%${termo.trim().replace(/[%_]/g, ' ')}%`)

        const { data, error } = await query
        if (error) return toolError('os modelos', error)

        return {
          modelos: ((data ?? []) as Array<Omit<TemplateRow, 'file_path'>>).map((row) => ({
            id: row.id,
            nome: row.name,
            categoria: DOCUMENT_CATEGORY_LABELS[row.category],
            descricao: row.description,
            ...describeFields(
              classifyTemplateFields(row.fields ?? [], parseFieldSettings(row.field_settings)),
            ),
          })),
        }
      },
    }),

    gerar_documento_de_modelo: tool({
      description:
        'Gera um .docx no formato original de um modelo: um modelo cadastrado (modelo_id, de ' +
        'listar_modelos) OU um .docx com campos entre chaves anexado nesta conversa ' +
        '(arquivo_id). ' +
        'Os campos do cadastro vêm do banco pelos ids — não os informe. O arquivo fica na ' +
        'conversa para o usuário baixar e revisar.',
      inputSchema: z.object({
        modelo_id: z.string().uuid().optional().describe('Modelo cadastrado.'),
        arquivo_id: z
          .string()
          .uuid()
          .optional()
          .describe('Ou: .docx anexado nesta conversa, usado como modelo avulso.'),
        cliente_id: z
          .string()
          .uuid()
          .optional()
          .describe('Se omitido e houver processo, vem do processo.'),
        processo_id: z.string().uuid().optional(),
        advogados_ids: z
          .array(z.string().uuid())
          .max(5)
          .optional()
          .describe(
            'Advogados do documento (ids de membros_do_escritorio); o primeiro assina. Omita ' +
              'se o usuário não disser — vale quem pede, se tiver OAB.',
          ),
        valores: z
          .array(z.object({ campo: z.string(), valor: z.string().max(5000) }))
          .optional()
          .describe(
            'Campos MANUAIS, só com valores que o usuário informou. Valor em reais, número, ' +
              'percentual ou data como o usuário escreveu.',
          ),
        textos: z
          .array(
            z.object({
              campo: z.string().describe('Nome do campo de IA, sem chaves.'),
              texto: z.string().max(30000),
            }),
          )
          .optional()
          .describe(
            'Campos de IA: texto simples, sem Markdown, parágrafos separados por linha em branco.',
          ),
        nome_arquivo: z
          .string()
          .max(120)
          .optional()
          .describe('Nome do arquivo sem extensão. Padrão: "<modelo> - <cliente>".'),
      }),
      execute: async ({
        modelo_id,
        arquivo_id,
        cliente_id,
        processo_id,
        advogados_ids,
        valores,
        textos,
        nome_arquivo,
      }) => {
        if (!modelo_id === !arquivo_id) {
          return {
            error: 'Informe modelo_id (modelo cadastrado) ou arquivo_id (anexo), um dos dois.',
          }
        }
        try {
          const source = await loadSource(supabase, { templateId: modelo_id, fileId: arquivo_id })
          if ('error' in source) return source
          const { classified } = source

          const clientId =
            cliente_id ?? (processo_id ? await getProcessClientId(supabase, processo_id) : null)
          const lawyerIds = advogados_ids ?? (await defaultLawyerIds(supabase, context.userId))

          const { values: cadastro, notes } = await resolveTemplateFields(supabase, {
            fields: classified.cadastro,
            clientId,
            processId: processo_id ?? null,
            lawyerIds,
            now: new Date(),
          })

          // Cada valor só entra no tipo de campo a que pertence: dado de
          // cadastro sai do banco, nunca do modelo de linguagem.
          const manualNames = new Set(classified.manual.map((field) => field.name))
          const aiNames = new Set(classified.ai.map((field) => field.name))
          const manual: Record<string, string> = {}
          const ai: Record<string, string> = {}
          const ignored: string[] = []
          for (const { campo, valor } of valores ?? []) {
            const name = campo.replace(/[{}]/g, '').trim()
            if (manualNames.has(name)) manual[name] = valor
            else ignored.push(name)
          }
          for (const { campo, texto } of textos ?? []) {
            const name = campo.replace(/[{}]/g, '').trim()
            if (aiNames.has(name)) ai[name] = texto
            else ignored.push(name)
          }

          const rendered = renderTemplate(
            source.bytes,
            buildTemplateValues({ classified, cadastro, manual, ai }),
          )

          const displayName =
            cadastro.cliente_nome ?? (clientId ? await fetchClientName(supabase, clientId) : null)
          // Sem cliente, "preenchido" distingue o arquivo gerado do anexo que
          // serviu de modelo — os dois ficam lado a lado na conversa.
          const baseName =
            nome_arquivo?.trim() || `${source.name} - ${displayName ?? 'preenchido'}`
          const fileName = `${baseName.replace(/[\\/:*?"<>|]/g, ' ').trim() || 'documento'}.docx`

          const saved = await saveGeneratedFile(supabase, {
            userId: context.userId,
            conversationId: context.conversationId,
            fileName,
            mediaType: AI_FILE_TYPES.docx.mediaType,
            bytes: rendered.bytes,
          })

          return {
            arquivo_id: saved.id,
            nome: fileName,
            modelo: source.name,
            campos_faltando: rendered.missing,
            campos_ignorados: ignored,
            avisos: notes,
          }
        } catch (error) {
          if (error instanceof TemplateSyntaxError) return { error: error.message }
          console.error('[ia] tool gerar_documento_de_modelo falhou:', error)
          return { error: 'Não foi possível gerar o documento.' }
        }
      },
    }),
  }
}
