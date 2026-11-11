// Só o tipo vem do servidor (`import type`): o módulo da apicpf lê a chave.
import type { CpfPerson } from '@/lib/apicpf/cpf'

export type CpfLookupResult = { ok: true; person: CpfPerson } | { ok: false; error: string }

function readError(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('error' in body)) return null
  return typeof body.error === 'string' ? body.error : null
}

/** Busca os dados da pessoa pelo CPF (11 dígitos) via `/api/cpf`. Nunca
 * lança: o formulário só precisa saber o que preencher ou o que avisar. */
export async function fetchCpfPerson(cpf: string): Promise<CpfLookupResult> {
  try {
    const res = await fetch(`/api/cpf?cpf=${cpf}`)
    const body: unknown = await res.json().catch(() => null)
    if (!res.ok) {
      return { ok: false, error: readError(body) ?? 'Não foi possível buscar o CPF.' }
    }
    return { ok: true, person: body as CpfPerson }
  } catch {
    return { ok: false, error: 'Erro ao buscar CPF.' }
  }
}
