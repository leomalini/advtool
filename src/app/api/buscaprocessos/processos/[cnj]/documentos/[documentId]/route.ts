import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { downloadDocumentoPublico, BpApiError, BpPendingError } from '@/lib/buscaprocessos/client'

/**
 * Repassa o download de um documento público.
 *
 * O `downloadUrl` que a API devolve exige a API key, que é server-only — o
 * navegador tomaria 401 se apontasse direto para lá. Esta rota busca com a
 * chave e devolve o arquivo, preservando tipo e nome.
 *
 * Cobrado por download (R$ 0,20). Por isso exige sessão: uma rota aberta seria
 * um jeito de queimar créditos de fora.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cnj: string; documentId: string }> },
): Promise<NextResponse | Response> {
  const { cnj, documentId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const upstream = await downloadDocumentoPublico(cnj, documentId)

    const headers = new Headers()
    headers.set('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream')
    const disposition = upstream.headers.get('content-disposition')
    headers.set('Content-Disposition', disposition ?? `inline; filename="${documentId}.pdf"`)
    // Documento de tribunal não muda; o cache do navegador evita um segundo
    // download — que seria uma segunda cobrança.
    headers.set('Cache-Control', 'private, max-age=3600')

    return new Response(upstream.body, { status: 200, headers })
  } catch (err) {
    if (err instanceof BpPendingError) {
      return NextResponse.json({ pending: true, message: err.message }, { status: 202 })
    }
    if (err instanceof BpApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[buscaprocessos/documento-download]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
