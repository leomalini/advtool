import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { AiSettingsStorageError } from './panelSettings'

/** Corpo JSON validado, ou a resposta 400 pronta. */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (parsed.success) return { ok: true, data: parsed.data }
  const message = parsed.error.issues[0]?.message ?? 'Requisição inválida.'
  return { ok: false, response: NextResponse.json({ error: message }, { status: 400 }) }
}

/** Erro inesperado de uma rota do painel: detalhe no log, frase genérica na tela. */
export function settingsFailure(error: unknown): NextResponse {
  console.error('[ia-config] rota do painel falhou:', error)
  const message =
    error instanceof AiSettingsStorageError
      ? 'Não foi possível gravar a configuração agora.'
      : 'Erro inesperado nas configurações da IA.'
  return NextResponse.json({ error: message }, { status: 503 })
}
