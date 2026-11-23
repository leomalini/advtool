// Server-side. Lê a configuração do escritório pelo client que a rota passar.
import type { SupabaseClient } from '@supabase/supabase-js'

/** O formato aceito pela coluna `office_settings.infinitepay_handle`. */
const HANDLE_FORMAT = /^[^\s$]+$/

/**
 * A InfiniteTag que vale só no desenvolvimento (`INFINITEPAY_DEV_HANDLE`).
 *
 * O banco local é o mesmo da produção, e a conta configurada lá é a do
 * escritório: testar com um Pix de verdade sem esta troca mandaria o dinheiro
 * para a conta do escritório, ou obrigaria a mexer na configuração que a
 * produção usa. Fora de `next dev` a variável é ignorada, mesmo que exista.
 */
export function devHandleOverride(): string | null {
  if (process.env.NODE_ENV !== 'development') return null
  const value = process.env.INFINITEPAY_DEV_HANDLE?.trim().replace(/^\$/, '')
  return value && HANDLE_FORMAT.test(value) ? value : null
}

/** A conta que recebe os links novos: a do desenvolvimento, se houver, senão a
 * configurada em Configurações → Pagamentos. Null sem nenhuma. */
export async function resolveInfinitePayHandle(supabase: SupabaseClient): Promise<string | null> {
  const devHandle = devHandleOverride()
  if (devHandle) return devHandle

  const { data, error } = await supabase
    .from('office_settings')
    .select('infinitepay_handle')
    .maybeSingle()
  if (error) throw error
  return (data as { infinitepay_handle: string | null } | null)?.infinitepay_handle ?? null
}
