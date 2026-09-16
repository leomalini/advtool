import { NextRequest, NextResponse } from 'next/server'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { buildPortalUrl, generatePortalToken, onlyDigits } from '@/lib/clientPortal/token'
import { openPortalToken, sealPortalToken } from '@/lib/clientPortal/vault'
import type { ClientPortalLink, IssuedClientPortalLink } from '@/types/clientPortal.types'

/**
 * O link de acompanhamento, do lado do escritório.
 *
 *   GET    — o link ativo do cliente (sem o token: ele não existe mais aqui).
 *   POST   — emite um novo, revogando o anterior.
 *   DELETE — revoga o atual.
 *
 * Usa a service_role porque `client_portal_links` grava o hash do token e
 * porque a emissão revoga a linha anterior na mesma operação — mas só depois
 * de `requirePermissionApi('clientes', 'update')` confirmar quem está pedindo,
 * conforme a regra 2 de `lib/supabase/admin.ts`.
 */

const LINK_FIELDS =
  'id, client_id, token_hint, expires_at, revoked_at, last_accessed_at, access_count, created_at'

/** `token_sealed` só sai do banco para ser decifrado aqui dentro — o valor
 * cifrado nunca vai para a resposta. */
const LINK_FIELDS_WITH_TOKEN = `${LINK_FIELDS}, token_sealed`

type LinkRow = Omit<ClientPortalLink, 'url'> & { token_sealed: string | null }

/** A linha do banco como a tela a consome: sem o texto cifrado, com a URL
 * pronta (ou `null`, quando o token não pôde ser aberto). */
async function toClientLink(
  row: LinkRow,
  origin: string
): Promise<ClientPortalLink> {
  const { token_sealed, ...link } = row
  const token = await openPortalToken(token_sealed)

  return { ...link, url: token ? buildPortalUrl(origin, token) : null }
}

function serviceUnavailable() {
  return NextResponse.json(
    {
      error:
        'Link de acompanhamento indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.',
    },
    { status: 503 }
  )
}

/** A base pública do link. `APP_PUBLIC_URL` tem prioridade porque o link é
 * copiado e mandado para fora: em produção atrás de proxy, o `origin` da
 * requisição pode ser o endereço interno do container. */
function publicOrigin(request: NextRequest): string {
  return process.env.APP_PUBLIC_URL?.trim() || request.nextUrl.origin
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermissionApi('clientes', 'view')
  if (!guard.ok) return guard.response
  if (!hasServiceRoleKey()) return serviceUnavailable()

  const { id } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('client_portal_links')
    .select(LINK_FIELDS_WITH_TOKEN)
    .eq('client_id', id)
    .is('revoked_at', null)
    .maybeSingle()

  if (error) {
    console.error('[portal-link] consulta falhou:', error.message)
    return NextResponse.json({ error: 'Erro ao carregar o link.' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ link: null })

  const link = await toClientLink(data as unknown as LinkRow, publicOrigin(request))

  // A resposta carrega a URL de acompanhamento de um cliente: cache
  // compartilhado no caminho poderia entregá-la na tela de outro usuário.
  return NextResponse.json({ link }, { headers: { 'Cache-Control': 'no-store, private' } })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermissionApi('clientes', 'update')
  if (!guard.ok) return guard.response
  if (!hasServiceRoleKey()) return serviceUnavailable()

  const { id } = await params
  const admin = createAdminClient()

  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('id, type, cpf, cnpj')
    .eq('id', id)
    .maybeSingle()

  if (clientError) {
    console.error('[portal-link] consulta do cliente falhou:', clientError.message)
    return NextResponse.json({ error: 'Erro ao carregar o cliente.' }, { status: 500 })
  }
  if (!client) {
    return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
  }

  // Sem documento cadastrado não há segundo fator, e o link viraria acesso
  // para quem quer que receba a mensagem encaminhada. Recusar aqui é o que
  // mantém a promessa da tela: "só quem conhece o CPF entra".
  const document = client.type === 'company' ? client.cnpj : client.cpf
  const expectedLength = client.type === 'company' ? 14 : 11
  if (!document || onlyDigits(document).length !== expectedLength) {
    return NextResponse.json(
      {
        error:
          client.type === 'company'
            ? 'Cadastre o CNPJ do cliente antes de gerar o link: ele é o que o cliente digita para entrar.'
            : 'Cadastre o CPF do cliente antes de gerar o link: ele é o que o cliente digita para entrar.',
      },
      { status: 409 }
    )
  }

  // Revoga o anterior ANTES de inserir: o índice único permite um só link
  // ativo por cliente, então a ordem inversa falharia com violação de chave.
  const { error: revokeError } = await admin
    .from('client_portal_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('client_id', id)
    .is('revoked_at', null)

  if (revokeError) {
    console.error('[portal-link] revogação do anterior falhou:', revokeError.message)
    return NextResponse.json({ error: 'Erro ao gerar o link.' }, { status: 500 })
  }

  const { token, tokenHash, tokenHint } = await generatePortalToken()

  const { data, error } = await admin
    .from('client_portal_links')
    .insert({
      client_id: id,
      token_hash: tokenHash,
      token_hint: tokenHint,
      // Cifrado, para a tela poder reexibir o link depois sem obrigar a
      // emitir outro. O `token_hash` acima é o que a validação do acesso usa.
      token_sealed: await sealPortalToken(token),
      created_by: guard.userId,
    })
    .select(LINK_FIELDS)
    .single()

  if (error) {
    console.error('[portal-link] emissão falhou:', error.message)
    return NextResponse.json({ error: 'Erro ao gerar o link.' }, { status: 500 })
  }

  const issued: IssuedClientPortalLink = {
    ...(data as unknown as Omit<ClientPortalLink, 'url'>),
    url: buildPortalUrl(publicOrigin(request), token),
  }

  return NextResponse.json(
    { link: issued },
    { status: 201, headers: { 'Cache-Control': 'no-store, private' } }
  )
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermissionApi('clientes', 'update')
  if (!guard.ok) return guard.response
  if (!hasServiceRoleKey()) return serviceUnavailable()

  const { id } = await params
  const admin = createAdminClient()

  const { error } = await admin
    .from('client_portal_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('client_id', id)
    .is('revoked_at', null)

  if (error) {
    console.error('[portal-link] revogação falhou:', error.message)
    return NextResponse.json({ error: 'Erro ao revogar o link.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
