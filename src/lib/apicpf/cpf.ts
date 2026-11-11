/**
 * Consulta de CPF na apicpf.com — SÓ SERVIDOR: usa a chave da conta.
 *
 * Usada pela rota `/api/cpf` (botão "Buscar CPF" do cadastro de cliente e de
 * pessoa). Documentação em https://www.apicpf.com/docs.
 *
 * A consulta pode custar crédito: CPF que já está na base deles sai de graça,
 * o que só existe na base parceira consome 1. Recusas (400, 401, 403, 429)
 * não consomem. Por isso a rota confere a permissão ANTES de chegar aqui.
 */
import { z } from 'zod'
import type { ClientSex } from '@/types/cliente.types'

const BASE_URL = 'https://apicpf.com'

/** O `data` de `GET /api/consulta`, conferido antes de ir para o formulário. */
const consultaSchema = z.object({
  code: z.literal(200),
  data: z.object({
    cpf: z.string(),
    nome: z.string(),
    /** "M", "F" ou "I" (indefinido/outro). */
    genero: z.string().nullish(),
    /** AAAA-MM-DD. */
    data_nascimento: z.string().nullish(),
  }),
})

export interface CpfPerson {
  name: string
  /** AAAA-MM-DD, pronto para o `<input type="date">`. */
  birth_date: string | null
  /** "I" vira `null`: indefinido não é o mesmo que "outro" na petição. */
  sex: ClientSex | null
  /** Saldo de créditos da chave depois desta consulta (`X-Credits-Remaining`). */
  credits_remaining: number | null
}

export type CpfLookupFailure =
  /** Dígito verificador errado ou formato recusado pela API (400). */
  | 'invalid'
  /** Nem a base deles nem a parceira conhecem o CPF (404). */
  | 'not_found'
  /** O CPF só existe na base parceira e a conta não tem crédito (402). */
  | 'no_credits'
  /** Limite diário, por minuto ou de consultas repetidas (429). */
  | 'rate_limited'
  /** Chave ausente no `.env`. */
  | 'not_configured'
  /** Chave recusada: inválida (401) ou expirada (403). */
  | 'unauthorized'
  /** A API respondeu algo fora do documentado. */
  | 'unavailable'
  /** Nem respondeu. */
  | 'network'

export type CpfLookup = { ok: true; person: CpfPerson } | { ok: false; reason: CpfLookupFailure }

const SEX_BY_GENDER: Record<string, ClientSex> = {
  M: 'masculino',
  F: 'feminino',
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function failureFromStatus(status: number): CpfLookupFailure {
  switch (status) {
    case 400:
      return 'invalid'
    case 402:
      return 'no_credits'
    case 404:
      return 'not_found'
    case 401:
    case 403:
      return 'unauthorized'
    case 429:
      return 'rate_limited'
    default:
      return 'unavailable'
  }
}

function readCredits(res: Response): number | null {
  const raw = res.headers.get('X-Credits-Remaining')
  if (raw === null) return null
  const credits = Number(raw)
  return Number.isFinite(credits) ? credits : null
}

/** `cpf` com 11 dígitos, sem formatação. */
export async function lookupCpf(cpf: string): Promise<CpfLookup> {
  const apiKey = process.env.APICPF_API_KEY
  if (!apiKey) return { ok: false, reason: 'not_configured' }

  let res: Response
  try {
    // Chave no cabeçalho, e não em `api_key` na URL: URL vai para log.
    // `no-store`: a resposta é dado pessoal e não deve ficar no cache do Next.
    res = await fetch(`${BASE_URL}/api/consulta?cpf=${cpf}`, {
      headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
      cache: 'no-store',
    })
  } catch {
    return { ok: false, reason: 'network' }
  }

  if (!res.ok) {
    const reason = failureFromStatus(res.status)
    if (reason === 'unauthorized' || reason === 'unavailable') {
      console.error('[apicpf] consulta recusada:', res.status)
    }
    return { ok: false, reason }
  }

  const body: unknown = await res.json().catch(() => null)
  const parsed = consultaSchema.safeParse(body)
  if (!parsed.success) {
    console.error('[apicpf] resposta fora do formato documentado')
    return { ok: false, reason: 'unavailable' }
  }

  const { nome, genero, data_nascimento } = parsed.data.data
  return {
    ok: true,
    person: {
      name: nome.trim(),
      birth_date: data_nascimento && ISO_DATE.test(data_nascimento) ? data_nascimento : null,
      sex: genero ? (SEX_BY_GENDER[genero.toUpperCase()] ?? null) : null,
      credits_remaining: readCredits(res),
    },
  }
}
