import { tool } from 'ai'
import { z } from 'zod'
import { AI_FILE_TYPES } from '../files/constants'
import { downloadBytes, saveGeneratedFile } from '../files/storage'
import { splitTemplateFields } from '../templates/catalog'
import { renderTemplate, TemplateSyntaxError, toTemplateText } from '../templates/docx'
import { resolveTemplateFields } from '../templates/resolveFields'
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
  file_path: string
  fields: string[]
}

/**
 * Texto que a IA escreveu para um campo, como texto puro. O modelo às vezes
 * responde em Markdown mesmo instruído a não fazer; num .docx os asteriscos e
 * cerquilhas sairiam literais no meio da petição.
 */
function toPlainText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim()
}

export function createTemplateTools(supabase: ToolClient, context: TemplateToolsContext) {
  return {
    listar_modelos: tool({
      description:
        'Modelos de documento do escritório (.docx): petições, procurações, contratos. Para cada ' +
        'um, os campos do cadastro (o sistema preenche) e os campos a redigir (você escreve o ' +
        'texto). Use antes de gerar_documento_de_modelo.',
      inputSchema: z.object({
        termo: z.string().max(120).optional().describe('Trecho do nome do modelo.'),
      }),
      execute: async ({ termo }) => {
        let query = supabase
          .from('document_templates')
          .select('id, name, description, fields')
          .order('name')
        if (termo?.trim()) query = query.ilike('name', `%${termo.trim().replace(/[%_]/g, ' ')}%`)

        const { data, error } = await query
        if (error) return toolError('os modelos', error)

        return {
          modelos: ((data ?? []) as Array<Omit<TemplateRow, 'file_path'>>).map((row) => {
            const { cadastro, redigidos } = splitTemplateFields(row.fields ?? [])
            return {
              id: row.id,
              nome: row.name,
              descricao: row.description,
              campos_do_cadastro: cadastro,
              campos_a_redigir: redigidos,
            }
          }),
        }
      },
    }),

    gerar_documento_de_modelo: tool({
      description:
        'Gera um .docx a partir de um modelo do escritório, no formato original do modelo. Os ' +
        'campos do cadastro vêm do banco pelo cliente_id/processo_id — não os informe. Em ' +
        '`textos`, escreva cada campo a redigir listado por listar_modelos: texto simples, sem ' +
        'Markdown, parágrafos separados por linha em branco. O arquivo fica na conversa para o ' +
        'usuário baixar e revisar.',
      inputSchema: z.object({
        modelo_id: z.string().uuid(),
        cliente_id: z.string().uuid(),
        processo_id: z.string().uuid().optional(),
        textos: z
          .array(
            z.object({
              campo: z.string().describe('Nome do campo a redigir, sem chaves.'),
              texto: z.string().max(30000),
            }),
          )
          .optional(),
        nome_arquivo: z
          .string()
          .max(120)
          .optional()
          .describe('Nome do arquivo sem extensão. Padrão: "<modelo> - <cliente>".'),
      }),
      execute: async ({ modelo_id, cliente_id, processo_id, textos, nome_arquivo }) => {
        try {
          const { data: template, error } = await supabase
            .from('document_templates')
            .select('id, name, description, file_path, fields')
            .eq('id', modelo_id)
            .maybeSingle()
          if (error) return toolError('o modelo', error)
          if (!template) return { error: 'Modelo não encontrado ou sem acesso.' }

          const row = template as TemplateRow
          const { cadastro, redigidos } = splitTemplateFields(row.fields ?? [])

          const { values, notes } = await resolveTemplateFields(supabase, {
            fields: cadastro,
            clientId: cliente_id,
            processId: processo_id ?? null,
            userId: context.userId,
            now: new Date(),
          })

          // Só campos de TEXTO vêm da IA. Um "campo" de cadastro em `textos` é
          // ignorado: dado de cadastro sai do banco, nunca do modelo.
          const written: Record<string, string> = {}
          const ignored: string[] = []
          for (const { campo, texto } of textos ?? []) {
            const name = campo.replace(/[{}]/g, '').trim()
            if (redigidos.includes(name)) written[name] = toTemplateText(toPlainText(texto))
            else ignored.push(name)
          }

          const source = await downloadBytes(supabase, DOCUMENTS_BUCKET, row.file_path)
          const rendered = renderTemplate(source, { ...written, ...values })

          const displayName = values.cliente_nome ?? (await fetchClientName(supabase, cliente_id))
          const baseName = nome_arquivo?.trim() || [row.name, displayName].filter(Boolean).join(' - ')
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
            modelo: row.name,
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

/** Nome do cliente para o nome do arquivo, quando o modelo não usa
 * {cliente_nome} (e por isso ele não foi resolvido). */
async function fetchClientName(supabase: ToolClient, clientId: string): Promise<string | null> {
  const { data } = await supabase
    .from('clients')
    .select('type, name, company_name, trade_name')
    .eq('id', clientId)
    .maybeSingle()
  return clientLabel(data as Parameters<typeof clientLabel>[0])
}
