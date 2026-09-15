import { NextRequest, NextResponse } from 'next/server'
import { getRequestResult, BpApiError, BpPendingError } from '@/lib/buscaprocessos/client'
import { toLookupResult } from '@/lib/buscaprocessos/mapCapa'
import { stripRaw, type DocumentSearchResponse } from '@/lib/buscaprocessos/documentSearch'
import type { BpCnjLookupData, BpDocumentSearchData } from '@/lib/buscaprocessos/types'
import { createClient } from '@/lib/supabase/server'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'

/**
 * Relê o resultado de uma consulta que saiu por HTTP 202.
 *
 * `GET /v1/requests/{requestId}` reproduz a resposta final da operação
 * original — e a forma dessa resposta depende de QUAL operação era. Por isso
 * `kind`: até existir a busca por CPF/CNPJ, a capa era a única consulta nossa
 * capaz de virar assíncrona, e este arquivo mapeava tudo com `toLookupResult`.
 * Uma lista de processos passando por ali sairia como uma capa vazia, sem erro
 * nenhum — silenciosamente errada.
 *
 * Enquanto o trabalho não termina a API devolve 202 de novo, e a tela repete a
 * espera usando o `retryAfterMs` da resposta.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
): Promise<NextResponse> {
  const { requestId } = await params
  const kind = req.nextUrl.searchParams.get('kind') === 'documento' ? 'documento' : 'capa'

  // Piso de permissão: reler um resultado é ler dado de processo. A consulta
  // já aconteceu na chamada original, então aqui basta 'view'.
  const guard = await requirePermissionApi('processos', 'view')
  if (!guard.ok) return guard.response

  try {
    if (kind === 'documento') {
      const { data, meta } = await getRequestResult<BpDocumentSearchData>(requestId)
      const processos = stripRaw(data.processos ?? [])
      const total = data.total ?? processos.length
      const searchedAt = new Date().toISOString()

      // A busca que saiu por 202 aconteceu igual. Sem gravar aqui, só as
      // buscas rápidas entrariam no cache e as lentas seriam refeitas a
      // cada tentativa.
      const supabase = await createClient()
      const { error } = await supabase.from('document_process_searches').insert({
        document: data.document,
        document_type: data.documentType ?? null,
        envolvido: data.envolvido ?? null,
        total,
        result: processos,
        credits_charged: meta?.creditsCharged ?? null,
        searched_by: guard.userId,
        searched_at: searchedAt,
      })
      if (error) {
        console.error(
          '[buscaprocessos/requests] busca NÃO foi gravada no cache:',
          error.message,
        )
      }

      const body: DocumentSearchResponse = {
        document: data.document,
        documentType: data.documentType ?? null,
        envolvido: data.envolvido ?? null,
        processos,
        total,
        fromCache: false,
        searchedAt,
      }
      return NextResponse.json(body)
    }

    const { data } = await getRequestResult<BpCnjLookupData>(requestId)
    return NextResponse.json(toLookupResult(data))
  } catch (err) {
    if (err instanceof BpPendingError) {
      return NextResponse.json(
        {
          pending: true,
          kind,
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
