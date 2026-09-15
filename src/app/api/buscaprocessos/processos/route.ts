import { NextRequest, NextResponse } from 'next/server'
import {
  searchProcessosByDocument,
  BpApiError,
  BpPendingError,
} from '@/lib/buscaprocessos/client'
import {
  isStale,
  isValidDocument,
  normalizeDocument,
  stripRaw,
  type DocumentSearchResponse,
} from '@/lib/buscaprocessos/documentSearch'
import type { BpEnvolvidoResumo, BpProcessoCapa } from '@/lib/buscaprocessos/types'
import { createClient } from '@/lib/supabase/server'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'

/** Linha de `document_process_searches` na forma que esta rota lê. */
interface CachedSearch {
  document_type: string | null
  envolvido: BpEnvolvidoResumo | null
  total: number
  result: BpProcessoCapa[]
  searched_at: string
}

/**
 * Lista os processos vinculados a um CPF ou CNPJ.
 *
 * ── Por que esta rota é mais dura que as outras da integração ──
 *
 * É a consulta mais pesada que temos, e a única em que o consumo depende do
 * resultado: quanto mais processos a pessoa tiver, maior ele é. Duas
 * consequências desenham o que está abaixo:
 *
 *  1. Repetir a mesma consulta é desperdício puro — daí o cache em
 *     `document_process_searches`.
 *  2. Uma rota aberta aqui é uma torneira ligada. Antes desta versão não havia
 *     autenticação nenhuma. A permissão é conferida ANTES da chamada externa,
 *     porque depois dela a RLS não protege mais nada: a consulta já aconteceu.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const rawDocument = req.nextUrl.searchParams.get('cpf_cnpj')
  if (!rawDocument) {
    return NextResponse.json(
      { error: 'Parâmetro cpf_cnpj é obrigatório' },
      { status: 400 },
    )
  }

  const document = normalizeDocument(rawDocument)
  if (!isValidDocument(document)) {
    return NextResponse.json(
      { error: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) completo' },
      { status: 422 },
    )
  }

  const page = Number(req.nextUrl.searchParams.get('page') ?? '1')
  if (!Number.isInteger(page) || page < 1) {
    return NextResponse.json({ error: 'Parâmetro page inválido' }, { status: 422 })
  }

  const force = req.nextUrl.searchParams.get('force') === '1'

  // De qual ficha a busca partiu, quando partiu de uma. Validado aqui porque
  // um valor torto só falharia lá na gravação — depois de a consulta já ter
  // acontecido — e o resultado sairia sem cache por um motivo invisível.
  const rawClientId = req.nextUrl.searchParams.get('client_id')
  const clientId =
    rawClientId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawClientId)
      ? rawClientId
      : null
  if (rawClientId && !clientId) {
    return NextResponse.json({ error: 'Parâmetro client_id inválido' }, { status: 422 })
  }

  // O cache guarda a primeira página, que é a resposta inteira no caso comum
  // (a API devolve 100 por página). Guardar a página 2 sob a mesma chave
  // faria a próxima busca responder o pedaço errado como se fosse o todo.
  const cacheable = page === 1

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  if (cacheable && !force) {
    // Sem `.single()`: documento nunca buscado é ausência esperada, não erro.
    const { data: cached, error } = await supabase
      .from('document_process_searches')
      .select('document_type, envolvido, total, result, searched_at')
      .eq('document', document)
      .order('searched_at', { ascending: false })
      .limit(1)
      .maybeSingle<CachedSearch>()

    if (error) {
      // Cache indisponível não impede a consulta — só deixa de economizar.
      console.error('[buscaprocessos/processos] leitura do cache falhou:', error.message)
    } else if (cached && !isStale(cached.searched_at)) {
      const body: DocumentSearchResponse = {
        document,
        documentType: cached.document_type,
        envolvido: cached.envolvido,
        processos: cached.result ?? [],
        total: cached.total,
        fromCache: true,
        searchedAt: cached.searched_at,
      }
      return NextResponse.json(body)
    }
  }

  // Daqui para baixo a chamada externa acontece. Quem só pode VER processos
  // alcança o cache acima, mas não dispara uma consulta nova.
  const guard = await requirePermissionApi('processos', 'create')
  if (!guard.ok) return guard.response

  try {
    const { data, meta } = await searchProcessosByDocument(document, page)
    const processos = stripRaw(data.processos ?? [])
    const total = data.total ?? processos.length
    const searchedAt = new Date().toISOString()

    if (cacheable) {
      const { error } = await supabase.from('document_process_searches').insert({
        document,
        document_type: data.documentType ?? null,
        client_id: clientId,
        envolvido: data.envolvido ?? null,
        total,
        result: processos,
        credits_charged: meta?.creditsCharged ?? null,
        searched_by: guard.userId,
        searched_at: searchedAt,
      })

      // A consulta já aconteceu: falhar aqui não pode engolir o resultado. Mas
      // o log precisa ser barulhento, porque significa que a próxima busca do
      // mesmo documento vai consultar de novo.
      if (error) {
        console.error(
          '[buscaprocessos/processos] busca NÃO foi gravada no cache:',
          error.message,
        )
      }
    }

    const body: DocumentSearchResponse = {
      document,
      documentType: data.documentType ?? null,
      envolvido: data.envolvido ?? null,
      processos,
      total,
      fromCache: false,
      searchedAt,
    }
    return NextResponse.json(body)
  } catch (err) {
    // 202: a consulta passou da janela síncrona. O resultado sai depois em
    // /api/buscaprocessos/requests/{requestId} — e `kind` diz a ele que o que
    // vem de lá é uma LISTA, não a capa de um processo.
    if (err instanceof BpPendingError) {
      return NextResponse.json(
        {
          pending: true,
          kind: 'documento',
          requestId: err.requestId,
          message: err.message,
          retryAfterMs: err.pollAfterMs,
        },
        { status: 202 },
      )
    }
    if (err instanceof BpApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if (err instanceof Error && err.name === 'TimeoutError') {
      return NextResponse.json({ error: 'Timeout na API BuscaProcessos' }, { status: 504 })
    }
    // Sem este log, uma falha de mapeamento (a API responde 200 e o parse
    // quebra aqui) chegava ao usuário como um 500 opaco, indistinguível de
    // uma falha da própria API.
    console.error('[buscaprocessos/processos]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

