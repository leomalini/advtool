import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  createMonitoramento,
  listMonitoramentos,
  BpApiError,
  BpPendingError,
} from '@/lib/buscaprocessos/client'

/**
 * Espelha o schema `ProcessMonitoringRequest` do OpenAPI: só `numero_cnj` é
 * obrigatório, e os nomes são snake_case. O schema anterior exigia `numeroCnj`
 * e `webhookUrl`, campos que a API não conhece — todo POST era rejeitado.
 *
 * `legal_process_id` é nosso, não da API: quando informado, guardamos o id do
 * monitoramento no processo para poder cancelá-lo depois. Sem isso o monitor
 * fica órfão e continua sendo cobrado mensalmente.
 */
const createSchema = z.object({
  numero_cnj: z.string().min(1, 'Número CNJ obrigatório'),
  tribunal: z.string().max(50).optional().nullable(),
  frequencia: z.enum(['DIARIA', 'SEMANAL', 'MENSAL']).optional(),
  legal_process_id: z.string().uuid('legal_process_id inválido').optional(),
})

export async function GET(): Promise<NextResponse> {
  try {
    const { data } = await listMonitoramentos()
    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof BpApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    // Sem este log, uma falha de mapeamento (a API responde 200 e o parse
    // quebra aqui) chegava ao usuário como um 500 opaco, indistinguível de
    // uma falha da própria API.
    console.error('[buscaprocessos/monitoramentos]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos', issues: parsed.error.issues },
      { status: 422 },
    )
  }

  const { legal_process_id, ...monitorInput } = parsed.data

  try {
    const { data } = await createMonitoramento(monitorInput)

    if (legal_process_id) {
      // Falha ao gravar não invalida o monitoramento, que já existe do lado da
      // BuscaProcessos — mas precisa aparecer no log, senão perdemos o id e
      // com ele a única forma de cancelar a cobrança.
      const supabase = await createClient()
      const { error } = await supabase
        .from('legal_processes')
        .update({
          monitoring_id: data.id,
          monitoring_frequency: monitorInput.frequencia ?? null,
          monitoring_status: data.status ?? null,
          monitoring_synced_at: new Date().toISOString(),
        })
        .eq('id', legal_process_id)

      if (error) {
        console.error('[buscaprocessos/monitoramentos] vínculo não gravado:', error.message)
      }
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    if (err instanceof BpPendingError) {
      return NextResponse.json(
        { pending: true, message: err.message, retryAfterMs: err.pollAfterMs },
        { status: 202 },
      )
    }
    if (err instanceof BpApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[buscaprocessos/monitoramentos]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
