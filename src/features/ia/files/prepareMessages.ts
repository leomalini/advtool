import type { SupabaseClient } from '@supabase/supabase-js'
import type { AssistantUIMessage } from '../tools'
import { aiFileKindFromMediaType, isReadAsFile, parseAiFileUrl } from './constants'

type Part = AssistantUIMessage['parts'][number]

/** Anexo com URL que não é `ai-file://` — vira 400 na rota. */
export class InvalidAttachmentError extends Error {}

function textPart(text: string): Part {
  return { type: 'text', text }
}

/**
 * O histórico como o MODELO deve vê-lo (o que vai para o banco continua sendo
 * o original — isto não é gravado).
 *
 * Anexos da última mensagem do usuário chegam inteiros: PDF e imagem como
 * arquivo (resolvido depois pelo download de `ai-file://`), Word/Excel/CSV/TXT
 * como o texto extraído no registro. Anexos de mensagens anteriores viram uma
 * referência de uma linha — reenviar todo PDF da conversa a cada pergunta
 * encareceria cada turno e logo passaria do limite de 100 MB do pedido. Se o
 * modelo precisar de um deles de novo, chama `ler_arquivo`.
 *
 * Lança `InvalidAttachmentError` para qualquer anexo que não seja uma
 * referência nossa: aceitar URL arbitrária faria o servidor buscar endereço
 * escolhido pelo cliente (SSRF).
 */
export async function prepareMessagesForModel(
  messages: AssistantUIMessage[],
  supabase: SupabaseClient,
): Promise<AssistantUIMessage[]> {
  const ids = new Set<string>()
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== 'file') continue
      const id = parseAiFileUrl(part.url)
      if (!id) throw new InvalidAttachmentError('Anexo com referência inválida.')
      ids.add(id)
    }
  }
  if (ids.size === 0) return messages

  const { data, error } = await supabase
    .from('ai_files')
    .select('id, file_name, media_type, extracted_text')
    .in('id', [...ids])
  if (error) throw error

  const rows = new Map(
    (data ?? []).map((row) => [
      row.id as string,
      row as { id: string; file_name: string; media_type: string; extracted_text: string | null },
    ]),
  )

  const lastUserIndex = messages.findLastIndex((message) => message.role === 'user')

  return messages.map((message, index) => {
    if (!message.parts.some((part) => part.type === 'file')) return message
    const isCurrent = index === lastUserIndex

    return {
      ...message,
      parts: message.parts.map((part): Part => {
        if (part.type !== 'file') return part
        // Validado no laço acima.
        const row = rows.get(parseAiFileUrl(part.url) as string)
        if (!row) return textPart(`[Anexo "${part.filename ?? 'sem nome'}" indisponível.]`)

        if (!isCurrent) {
          return textPart(
            `[Anexo "${row.file_name}" (id: ${row.id}) enviado numa mensagem anterior. ` +
              'Para consultá-lo de novo, use ler_arquivo com origem "conversa".]',
          )
        }

        const kind = aiFileKindFromMediaType(row.media_type)
        if (kind && isReadAsFile(kind)) {
          // O MIME e o nome vêm do banco, não do que o cliente mandou.
          return { ...part, mediaType: row.media_type, filename: row.file_name }
        }
        return textPart(
          `Conteúdo do anexo "${row.file_name}" (id: ${row.id}):\n\n` +
            (row.extracted_text ?? '[arquivo sem texto extraível]'),
        )
      }),
    }
  })
}
