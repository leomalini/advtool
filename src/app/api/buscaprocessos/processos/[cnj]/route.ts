import { NextRequest, NextResponse } from 'next/server'
import { getProcessoByCnj, BpApiError, BpPendingError } from '@/lib/buscaprocessos/client'
import { toLookupResult } from '@/lib/buscaprocessos/mapCapa'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cnj: string }> },
): Promise<NextResponse> {
  const { cnj } = await params

  try {
    const { data: processo } = await getProcessoByCnj(cnj, req.signal)
    return NextResponse.json(toLookupResult(processo))
  } catch (err) {
    // 202: a consulta saiu da janela síncrona. Não é erro — devolvemos o
    // requestId para a tela reler o resultado em /api/buscaprocessos/requests.
    if (err instanceof BpPendingError) {
      return NextResponse.json(
        {
          pending: true,
          requestId: err.requestId,
          message: err.message,
          retryAfterMs: err.pollAfterMs,
        },
        { status: 202 },
      )
    }
    if (err instanceof BpApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if (err instanceof Error && err.name === 'TimeoutError') {
      return NextResponse.json({ error: 'Timeout na API BuscaProcessos' }, { status: 504 })
    }
    // Sem este log, uma falha de mapeamento (a API responde 200 e o parse
    // quebra aqui) chegava ao usuário como um 500 opaco, indistinguível de
    // uma falha da própria API.
    console.error('[buscaprocessos/cnj]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
