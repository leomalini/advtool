import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteMonitoramento, BpApiError } from '@/lib/buscaprocessos/client'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'

/**
 * Cancela o monitoramento na BuscaProcessos e limpa o vínculo no processo.
 *
 * O monitoramento de processo é recorrente enquanto estiver ativo
 * (`cobranca.recorrencia: 'MENSAL'` na resposta da API), então não ter rota de
 * remoção significava criá-lo sem meio de encerrá-lo pelo sistema.
 *
 * Exige 'processos:update', o mesmo do POST que cria: desligar o
 * acompanhamento de um processo é mexer na configuração dele. Sem trava, uma
 * requisição anônima que soubesse (ou adivinhasse) um id derrubava o
 * monitoramento alheio — e o escritório só descobriria pela ausência de
 * movimentações.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params

  const guard = await requirePermissionApi('processos', 'update')
  if (!guard.ok) return guard.response

  try {
    await deleteMonitoramento(id)
  } catch (err) {
    // 404 = já não existe lá. Seguimos para limpar o vínculo daqui, senão o
    // processo fica apontando para um monitoramento fantasma.
    if (err instanceof BpApiError && err.status !== 404) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if (!(err instanceof BpApiError)) {
      console.error('[buscaprocessos/monitoramentos] DELETE:', err)
      return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('legal_processes')
    .update({
      monitoring_id: null,
      monitoring_frequency: null,
      monitoring_status: null,
      monitoring_synced_at: null,
    })
    .eq('monitoring_id', id)

  if (error) {
    console.error('[buscaprocessos/monitoramentos] limpeza do vínculo falhou:', error.message)
  }

  return NextResponse.json({ removed: true })
}
