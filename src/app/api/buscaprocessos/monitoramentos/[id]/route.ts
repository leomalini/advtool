import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteMonitoramento, BpApiError } from '@/lib/buscaprocessos/client'

/**
 * Cancela o monitoramento na BuscaProcessos e limpa o vínculo no processo.
 *
 * O monitoramento de processo é cobrado por mês enquanto estiver ativo
 * (`cobranca.recorrencia: 'MENSAL'` na resposta da API), então não ter rota de
 * remoção significava criar cobrança sem meio de encerrá-la pelo sistema.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params

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
