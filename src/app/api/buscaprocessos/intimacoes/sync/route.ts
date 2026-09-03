import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { syncIntimacoes } from '@/lib/buscaprocessos/syncIntimacoes'
import { BpApiError } from '@/lib/buscaprocessos/client'

const syncSchema = z.object({
  /** Janela inicial. Omitida, a API devolve a janela corrente. */
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato yyyy-MM-dd').optional(),
})

/**
 * Busca as publicações das OABs cadastradas nos perfis e grava localmente.
 *
 * Exige sessão: a consulta é cobrada por OAB, então uma rota aberta seria um
 * jeito de queimar créditos de fora.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown = {}
  if (req.headers.get('content-length') && req.headers.get('content-length') !== '0') {
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
    }
  }

  const parsed = syncSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos', issues: parsed.error.issues },
      { status: 422 },
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const result = await syncIntimacoes(supabase, { desde: parsed.data.desde })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof BpApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[buscaprocessos/intimacoes]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
