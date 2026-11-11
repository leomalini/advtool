import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermissionApi } from '@/lib/auth/requirePermissionApi'
import { lookupCpf, type CpfLookupFailure } from '@/lib/apicpf/cpf'

const querySchema = z.object({
  cpf: z.string().regex(/^\d{11}$/, 'CPF deve ter 11 dígitos sem formatação'),
})

const FAILURES: Record<CpfLookupFailure, { status: number; error: string }> = {
  invalid: { status: 400, error: 'CPF inválido.' },
  not_found: { status: 404, error: 'Nenhuma pessoa encontrada com este CPF.' },
  no_credits: {
    status: 402,
    error: 'Sem créditos na apicpf para consultar este CPF. Renove o plano ou compre créditos.',
  },
  rate_limited: {
    status: 429,
    error: 'Limite de consultas de CPF atingido. Tente de novo em alguns minutos.',
  },
  not_configured: {
    status: 503,
    error: 'Busca por CPF não configurada: falta APICPF_API_KEY no servidor.',
  },
  unauthorized: {
    status: 502,
    error: 'A apicpf recusou a chave configurada (inválida ou expirada).',
  },
  unavailable: { status: 502, error: 'A apicpf não respondeu como esperado.' },
  network: { status: 502, error: 'Falha na conexão com a apicpf.' },
}

/**
 * Preenche o cadastro de pessoa física pelo CPF (nome, nascimento e sexo).
 *
 * A consulta pode gastar crédito da conta do escritório, então a permissão é
 * conferida antes da chamada externa: quem pode cadastrar OU editar clientes —
 * o mesmo formulário serve aos dois.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  let guard = await requirePermissionApi('clientes', 'create')
  if (!guard.ok && guard.response.status === 403) {
    guard = await requirePermissionApi('clientes', 'update')
  }
  if (!guard.ok) return guard.response

  const parsed = querySchema.safeParse({ cpf: request.nextUrl.searchParams.get('cpf') ?? '' })
  if (!parsed.success) {
    return NextResponse.json({ error: 'CPF inválido.' }, { status: 400 })
  }

  const result = await lookupCpf(parsed.data.cpf)
  if (result.ok) return NextResponse.json(result.person)

  const { status, error } = FAILURES[result.reason]
  return NextResponse.json({ error }, { status })
}
