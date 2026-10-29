import { NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { syncProcessoFromBp, SYNC_BLOCKS } from '@/lib/buscaprocessos/sync'
import { BpApiError } from '@/lib/buscaprocessos/client'
import { refreshProcessSummary } from '@/features/processos/summary/refreshProcessSummary'

/** Segundos. Inclui o `after` que refaz o resumo por IA depois de responder. */
export const maxDuration = 120

const syncSchema = z.object({
  legal_process_id: z.string().uuid('legal_process_id inválido'),
  cnj: z.string().min(1, 'Número CNJ obrigatório'),
  /** Ausente = capa, movimentações e documentos (`DEFAULT_SYNC_BLOCKS`). */
  blocks: z.array(z.enum(SYNC_BLOCKS)).nonempty().optional(),
  /** Reconsulta blocos já em cache: `true` para todos, ou a lista dos que
   * devem ser refeitos. Cada bloco forçado custa crédito. */
  force: z.union([z.boolean(), z.array(z.enum(SYNC_BLOCKS)).nonempty()]).optional(),
  /** Blocos já obtidos por outro caminho: carimba sem consultar nem cobrar. */
  assume_fresh: z.array(z.enum(SYNC_BLOCKS)).nonempty().optional(),
})

/**
 * Popula o processo com os dados da BuscaProcessos: capa, movimentações e
 * documentos públicos (o resumo da BuscaProcessos só se pedido pelo nome).
 *
 * Roda no servidor porque só aqui existe a API key. A resposta diz o que foi
 * consultado, o que veio do cache e quanto custou. Se vieram movimentações, o
 * resumo por IA do processo se refaz depois da resposta (fase 2b).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const parsed = syncSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos', issues: parsed.error.issues },
      { status: 422 },
    )
  }

  const supabase = await createClient()

  // A gravação passa pelo client de sessão de propósito: a RLS de `processos`
  // decide quem pode escrever, do mesmo jeito que decidiria pela tela.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const result = await syncProcessoFromBp(supabase, {
      legalProcessId: parsed.data.legal_process_id,
      cnj: parsed.data.cnj,
      blocks: parsed.data.blocks,
      force: parsed.data.force,
      assumeFresh: parsed.data.assume_fresh,
    })
    // Só quando as movimentações foram consultadas agora; a função confere se
    // há novidade e se o processo tem resumo antes de gastar.
    if (result.synced.includes('movimentacoes')) {
      const legalProcessId = parsed.data.legal_process_id
      after(() => refreshProcessSummary(legalProcessId, 'sync'))
    }
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof BpApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[buscaprocessos/sync]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
