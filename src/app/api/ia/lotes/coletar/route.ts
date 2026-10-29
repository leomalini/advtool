import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { collectBatches } from '@/features/ia/batch/collect'

/** Recolher grava resultados de vários registros de uma vez. */
export const maxDuration = 60

/** Ao abrir uma tela, no máximo uma consulta à Anthropic por minuto. */
const OPEN_COLLECT_INTERVAL_MS = 60_000

/**
 * POST /api/ia/lotes/coletar — recolhe os lotes prontos (fase 5). Chamado por
 * Publicações ao abrir, para a triagem aparecer sem esperar o cron diário.
 *
 * Basta estar logado: quem grava é o servidor, com as regras de cada trabalho,
 * e o intervalo mínimo segura chamadas repetidas. A resposta só diz quanto foi
 * gravado — a tela relê as listas quando algo entrou.
 */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  return NextResponse.json(await collectBatches({ minIntervalMs: OPEN_COLLECT_INTERVAL_MS }))
}
