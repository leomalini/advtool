import { NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { syncProcessoFromBp, SYNC_BLOCKS, type SyncResult } from '@/lib/buscaprocessos/sync'
import { BpApiError } from '@/lib/buscaprocessos/client'
import { enqueueProcessWork } from '@/features/ia/batch/arrival'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import {
  linkOfficeClientsOnProcess,
  type OfficeClientsResult,
} from '@/lib/clientes/officeClients'

/** Segundos. Inclui o `after` que manda o resumo e o portal para o lote. */
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
    // Só quando as movimentações foram consultadas agora. Os trabalhos do lote
    // conferem se há novidade e se o processo já tem resumo/respostas antes
    // de gastar.
    if (result.synced.includes('movimentacoes')) {
      const legalProcessId = parsed.data.legal_process_id
      after(async () => {
        await enqueueProcessWork(legalProcessId)
      })
    }

    const officeClients = await registerOfficeClients(
      parsed.data.legal_process_id,
      parsed.data.cnj,
      result,
      parsed.data.assume_fresh,
    )
    return NextResponse.json({ ...result, officeClients })
  } catch (err) {
    if (err instanceof BpApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[buscaprocessos/sync]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/**
 * Cadastra o cliente que o escritório representa no processo, pela capa que
 * acabou de chegar — no cadastro ela vem do formulário (`assume_fresh`), na
 * sincronização vem da consulta.
 *
 * Só com capa nova: rodar em toda sincronização recriaria, a cada clique, o
 * cliente que alguém apagou de propósito.
 *
 * Pelo client de `service_role`, como no webhook: é uma ação do sistema, não de
 * quem clicou — o cadastro sai assinado pelo advogado da parte, e o aviso do
 * sino só é gravável por ele. Quem chega aqui já passou pela sessão acima.
 * Best-effort: falhar aqui não desfaz a sincronização.
 */
async function registerOfficeClients(
  legalProcessId: string,
  cnj: string,
  result: SyncResult,
  assumeFresh: readonly string[] | undefined,
): Promise<OfficeClientsResult | null> {
  const capaFresh =
    result.synced.includes('capa') ||
    (Boolean(assumeFresh?.includes('capa')) && result.skipped.includes('capa'))
  if (!capaFresh || !hasServiceRoleKey()) return null

  try {
    return await linkOfficeClientsOnProcess(createAdminClient(), legalProcessId, {
      source: 'sync',
      cnj,
    })
  } catch (err) {
    console.error('[buscaprocessos/sync] cadastro automático do cliente:', err)
    return null
  }
}
