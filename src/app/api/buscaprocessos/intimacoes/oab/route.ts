import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  getIntimacaoMonitoramento,
  createIntimacaoMonitoramento,
  deleteIntimacaoMonitoramento,
  updateIntimacaoMonitoramentoWebhook,
  BpApiError,
} from '@/lib/buscaprocessos/client'
import { webhookUrl } from '@/lib/buscaprocessos/webhookUrl'
import type {
  BpOabRef,
  BpIntimacaoMonitoramentoCriado,
} from '@/lib/buscaprocessos/types'

/**
 * Monitoramento de intimações das inscrições cadastradas nos perfis.
 *
 * O webhook registrado lá é o NOSSO endpoint de recebimento — a rota que já
 * existe em /api/webhooks/buscaprocessos e valida a assinatura HMAC. Por isso
 * o caminho é fixo no código e só a base vem do ambiente: quem configura
 * informa onde a aplicação está publicada, não uma URL qualquer.
 *
 * A base sai do ambiente, e não do corpo da requisição, porque quem usa a tela
 * não deve poder apontar o callback da conta para outro servidor.
 */
const oabSchema = z.object({
  oab_state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'UF deve ter duas letras'),
  oab_number: z.string().trim().min(1, 'Número da OAB obrigatório'),
})

/** Inscrição de perfil, já normalizada e sem repetição. */
interface ProfileOab extends BpOabRef {
  profileIds: string[]
  names: string[]
}

async function readProfileOabs(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ProfileOab[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, oab_number, oab_state')
    .not('oab_number', 'is', null)
    .not('oab_state', 'is', null)
    .order('full_name')

  if (error) throw new Error(`Leitura dos perfis falhou: ${error.message}`)

  // Dois advogados podem dividir a mesma inscrição em cadastros diferentes; o
  // monitoramento é por inscrição, então agrupa para não cobrar duas vezes.
  const byOab = new Map<string, ProfileOab>()

  for (const row of data ?? []) {
    const numero = String(row.oab_number).replace(/\D/g, '')
    const estado = String(row.oab_state).toUpperCase()
    if (!numero || estado.length !== 2) continue

    const key = `${estado}:${numero}`
    const existing = byOab.get(key)
    if (existing) {
      existing.profileIds.push(row.id as string)
      existing.names.push((row.full_name as string) ?? '')
    } else {
      byOab.set(key, {
        estado,
        numero,
        profileIds: [row.id as string],
        names: [(row.full_name as string) ?? ''],
      })
    }
  }

  return [...byOab.values()]
}

async function requireSession() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

/** Situação de cada inscrição cadastrada. Consulta gratuita, uma por OAB. */
export async function GET(): Promise<NextResponse> {
  const { supabase, user } = await requireSession()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const oabs = await readProfileOabs(supabase)

    const items = await Promise.all(
      oabs.map(async (oab) => {
        try {
          const { data } = await getIntimacaoMonitoramento(oab)
          const monitoramento = data.items?.[0] ?? null

          return {
            oab_state: oab.estado,
            oab_number: oab.numero,
            names: oab.names,
            active: monitoramento?.status === 'ACTIVE',
            webhook_url: monitoramento?.webhookUrl ?? null,
            created_at: monitoramento?.criadoEm ?? null,
          }
        } catch (err) {
          // 404 = nunca houve monitoramento para esta inscrição. Não é falha:
          // é exatamente o estado que a tela precisa mostrar.
          if (err instanceof BpApiError && err.status === 404) {
            return {
              oab_state: oab.estado,
              oab_number: oab.numero,
              names: oab.names,
              active: false,
              webhook_url: null,
              created_at: null,
            }
          }
          throw err
        }
      }),
    )

    return NextResponse.json({
      items,
      /** O que registramos lá — a tela mostra e compara com o que veio. */
      expectedWebhookUrl: webhookUrl(),
    })
  } catch (err) {
    if (err instanceof BpApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[buscaprocessos/intimacoes/oab] GET:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/** Liga o monitoramento. Cobra R$ 0,90 por inscrição nova a cada 30 dias. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { user } = await requireSession()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  const parsed = z.object({ oabs: z.array(oabSchema).nonempty() }).safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos', issues: parsed.error.issues },
      { status: 422 },
    )
  }

  const oabs: BpOabRef[] = parsed.data.oabs.map((oab) => ({
    estado: oab.oab_state,
    numero: oab.oab_number.replace(/\D/g, ''),
  }))

  try {
    // Uma chamada por inscrição: o corpo documentado aceita uma OAB por vez.
    // Sequencial, e não em paralelo, para que a primeira recusa interrompa o
    // lote em vez de seguir cobrando as próximas.
    const monitoramentos: BpIntimacaoMonitoramentoCriado[] = []
    let novas = 0
    let custo = 0
    let callbackEnabled = false

    for (const oab of oabs) {
      const { data } = await createIntimacaoMonitoramento(oab, webhookUrl() ?? undefined)

      const criados = data.monitoramentos ?? []
      const novasAqui = criados.filter((item) => !item.reused).length

      monitoramentos.push(...criados)
      novas += novasAqui
      custo += (data.billing?.billableOabs ?? novasAqui) * (data.billing?.pricePerNewOab ?? 0.9)
      callbackEnabled = callbackEnabled || (data.callback?.enabled ?? false)
    }

    return NextResponse.json({
      monitoramentos,
      /** Só as inscrições novas geram cobrança. */
      newlyCharged: novas,
      estimatedCost: custo,
      callbackEnabled,
    })
  } catch (err) {
    if (err instanceof BpApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[buscaprocessos/intimacoes/oab] POST:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/**
 * Reaponta o webhook de uma inscrição já monitorada.
 *
 * Existe porque a URL da aplicação muda — troca de domínio, sai do staging —
 * e o monitoramento cadastrado continua apontando para o endereço antigo.
 * Recriar o monitoramento cobraria de novo; isto não cobra nada.
 */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const { user } = await requireSession()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const parsed = oabSchema.safeParse({
    oab_state: req.nextUrl.searchParams.get('oab_state'),
    oab_number: req.nextUrl.searchParams.get('oab_number'),
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Inscrição inválida' },
      { status: 422 },
    )
  }

  const url = webhookUrl()
  if (!url) {
    return NextResponse.json(
      { error: 'APP_PUBLIC_URL não configurada, ou apontando para localhost.' },
      { status: 409 },
    )
  }

  try {
    const { data } = await updateIntimacaoMonitoramentoWebhook(
      { estado: parsed.data.oab_state, numero: parsed.data.oab_number.replace(/D/g, '') },
      url,
    )
    return NextResponse.json({ updated: true, webhook_url: data.webhookUrl ?? url })
  } catch (err) {
    if (err instanceof BpApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[buscaprocessos/intimacoes/oab] PUT:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

/** Desliga o monitoramento e encerra a recorrência. Não cobra. */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const { user } = await requireSession()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const oabState = req.nextUrl.searchParams.get('oab_state')
  const oabNumber = req.nextUrl.searchParams.get('oab_number')

  const parsed = oabSchema.safeParse({ oab_state: oabState, oab_number: oabNumber })
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Inscrição inválida' },
      { status: 422 },
    )
  }

  try {
    const { data } = await deleteIntimacaoMonitoramento({
      estado: parsed.data.oab_state,
      numero: parsed.data.oab_number.replace(/\D/g, ''),
    })
    return NextResponse.json({ removed: true, status: data.status })
  } catch (err) {
    if (err instanceof BpApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[buscaprocessos/intimacoes/oab] DELETE:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
