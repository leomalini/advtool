import type { SupabaseClient } from '@supabase/supabase-js'

export type EnsureConversationResult = 'ok' | 'not-found' | 'error'

/**
 * Garante que a conversa existe e é de quem pede.
 *
 * Cria no primeiro uso — que pode ser o primeiro turno do chat ou o primeiro
 * anexo, que sobe antes da primeira mensagem. Por isso o título só é gravado
 * quando ainda está vazio: a conversa aberta por um anexo nasce sem título, e
 * o primeiro turno completa.
 *
 * O `ignoreDuplicates` engole o conflito com uma conversa de OUTRA pessoa
 * (mesmo id). A leitura seguinte passa pela RLS de dono: se não voltar, não é
 * sua — `not-found`, sem dizer se existe.
 */
export async function ensureConversation(
  supabase: SupabaseClient,
  { id, userId, title }: { id: string; userId: string; title: string | null },
): Promise<EnsureConversationResult> {
  const { error: upsertError } = await supabase
    .from('ai_conversations')
    .upsert({ id, user_id: userId, title }, { onConflict: 'id', ignoreDuplicates: true })
  if (upsertError) {
    console.error('[ia] upsert conversa falhou:', upsertError.code, upsertError.message)
    return 'error'
  }

  const { data, error } = await supabase
    .from('ai_conversations')
    .select('id, title')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[ia] leitura da conversa falhou:', error.code, error.message)
    return 'error'
  }
  if (!data) return 'not-found'

  if (!data.title && title) {
    const { error: titleError } = await supabase
      .from('ai_conversations')
      .update({ title })
      .eq('id', id)
      .is('title', null)
    if (titleError) {
      // Sem título a conversa só aparece como "Sem título" na lista — não é
      // motivo para derrubar o turno.
      console.error('[ia] título da conversa falhou:', titleError.code, titleError.message)
    }
  }

  return 'ok'
}
