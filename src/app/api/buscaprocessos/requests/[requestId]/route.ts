import { NextRequest, NextResponse } from 'next/server'
import { getRequestResult, BpApiError, BpPendingError } from '@/lib/buscaprocessos/client'
import { toLookupResult } from '@/lib/buscaprocessos/mapCapa'
import type { BpCnjLookupData } from '@/lib/buscaprocessos/types'

/**
 * Relê o resultado de uma consulta que saiu por HTTP 202.
 *
 * `GET /v1/requests/{requestId}` reproduz a resposta final da operação
 * original — aqui, sempre uma capa de processo, a única consulta nossa que
 * pode virar assíncrona. Enquanto o trabalho não termina a API devolve 202 de
 * novo, e a tela repete a espera usando o `retryAfterMs` da resposta.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
): Promise<NextResponse> {
  const { requestId } = await params

  try {
    const { data } = await getRequestResult<BpCnjLookupData>(requestId)
    return NextResponse.json(toLookupResult(data))
  } catch (err) {
    if (err instanceof BpPendingError) {
      return NextResponse.json(
        {
          pending: true,
          requestId: err.requestId || requestId,
          message: err.message,
          retryAfterMs: err.pollAfterMs,
        },
        { status: 202 },
      )
    }
    if (err instanceof BpApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[buscaprocessos/requests]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
