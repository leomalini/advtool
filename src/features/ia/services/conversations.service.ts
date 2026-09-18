import { createClient } from '@/lib/supabase/client'
import type { AssistantUIMessage } from '../tools'
import { removeConversationFiles } from './aiFiles.service'

const supabase = createClient()

export interface AiConversation {
  id: string
  title: string | null
  created_at: string
  updated_at: string
}

/** Conversas do usuário, mais recente primeiro. A RLS já filtra por dono. */
export async function getConversations(): Promise<AiConversation[]> {
  const { data, error } = await supabase
    .from('ai_conversations')
    .select('id, title, created_at, updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as AiConversation[]
}

/** Mensagens gravadas pela rota, na ordem em que o chat as mostrou. */
export async function getConversationMessages(
  conversationId: string,
): Promise<AssistantUIMessage[]> {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('id, role, parts')
    .eq('conversation_id', conversationId)
    .order('position')
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id as string,
    role: row.role as 'user' | 'assistant',
    parts: row.parts as AssistantUIMessage['parts'],
  }))
}

export async function deleteConversation(id: string): Promise<void> {
  // Arquivos primeiro: depois do delete, as linhas de `ai_files` (que dizem
  // onde estão os objetos) já teriam sumido em cascata.
  try {
    await removeConversationFiles(id)
  } catch (error) {
    // Não impede apagar a conversa — o pedido do usuário é esse. O objeto que
    // sobrar fica na pasta dele, invisível para os outros.
    console.error('[ia] remoção dos arquivos da conversa falhou:', id, error)
  }

  const { error } = await supabase.from('ai_conversations').delete().eq('id', id)
  if (error) throw error
}
