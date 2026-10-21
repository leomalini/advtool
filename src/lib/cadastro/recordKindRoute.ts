import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { RecordKind } from '@/types/cliente.types'

/**
 * Leva o cadastro para a ficha do estado dele (migration 78): cliente abre em
 * `/clientes/[id]`, pessoa em `/pessoas/[id]`. Chamado no `page.tsx` das duas,
 * depois do `requirePermission`.
 *
 * Existe para os links que ficaram para trás quando o registro mudou de
 * estado — um favorito, uma aba aberta, o "voltar" do navegador depois de
 * "Tornar cliente". Sem isto a ficha de pessoa mostraria um cliente sem
 * processos nem pendências, e a de cliente ofereceria portal a quem não é.
 *
 * No servidor, antes do render, e não num efeito da página: a ficha errada
 * piscaria antes de trocar.
 *
 * Registro não encontrado (ou fora da RLS) segue para a página, que já sabe
 * dizer "não encontrado". Erro da consulta também segue: a ficha do outro
 * estado continua sendo um lugar onde dá para trabalhar, e travar a navegação
 * por uma falha de leitura seria pior.
 */
export async function redirectToRecordKind(id: string, current: RecordKind): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clients')
    .select('is_client')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) return

  const actual: RecordKind = data.is_client ? 'client' : 'person'
  if (actual === current) return

  redirect(actual === 'client' ? `/clientes/${id}` : `/pessoas/${id}`)
}
