// Server-side only — never import this in client components ('use client')
import type {
  BpResponse,
  BpCnjLookupData,
  BpDocumentSearchData,
  BpOabSearchData,
  BpMonitoramento,
  BpMonitoramentosListData,
} from './types'

const API_KEY = process.env.BUSCA_PROCESSOS_API_KEY
const BASE_URL = 'https://api.buscaprocessos.app.br'

// ── Error class ───────────────────────────────────────────────────────────────

export class BpApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'BpApiError'
  }
}

// ── Core request ──────────────────────────────────────────────────────────────

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<BpResponse<T>> {
  if (!API_KEY) {
    throw new BpApiError(
      503,
      'BUSCA_PROCESSOS_API_KEY não configurada. Adicione-a ao .env.local.',
    )
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    signal: options?.signal ?? AbortSignal.timeout(30_000),
  })

  if (res.status === 404) throw new BpApiError(404, 'Processo não encontrado')
  if (res.status === 401) throw new BpApiError(401, 'API key inválida ou revogada')
  if (res.status === 403) throw new BpApiError(403, 'Créditos insuficientes ou conta inativa')
  if (res.status === 422) throw new BpApiError(422, 'Número CNJ inválido ou parâmetro rejeitado')
  if (res.status === 429) throw new BpApiError(429, 'Limite de requisições atingido')
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new BpApiError(res.status, `Erro na API BuscaProcessos: ${body}`)
  }

  return res.json() as Promise<BpResponse<T>>
}

// ── Processos ─────────────────────────────────────────────────────────────────

/** Busca um processo pelo número CNJ */
export function getProcessoByCnj(cnj: string) {
  return request<BpCnjLookupData>(`/v1/processos/cnj/${encodeURIComponent(cnj)}`)
}

/** Lista processos vinculados a um CPF ou CNPJ */
export function searchProcessosByDocument(cpfCnpj: string, page = 1) {
  const params = new URLSearchParams({ cpf_cnpj: cpfCnpj, page: String(page) })
  return request<BpDocumentSearchData>(`/v1/processos?${params}`)
}

/** Lista processos vinculados a um número OAB */
export function searchProcessosByOab(oab: string, page = 1) {
  const params = new URLSearchParams({ page: String(page) })
  return request<BpOabSearchData>(`/v1/processos/oab/${encodeURIComponent(oab)}?${params}`)
}

/** Solicita atualização forçada de um processo */
export function requestProcessUpdate(cnj: string) {
  return request<{ message: string }>(
    `/v1/processos/cnj/${encodeURIComponent(cnj)}/solicitar-atualizacao`,
    { method: 'POST' },
  )
}

// ── Monitoramentos ────────────────────────────────────────────────────────────

export interface CreateMonitorInput {
  numeroCnj: string
  frequencia: 'DIARIA' | 'SEMANAL' | 'MENSAL'
  webhookUrl?: string
}

/** Cria um monitor de acompanhamento para um processo */
export function createMonitoramento(input: CreateMonitorInput) {
  return request<BpMonitoramento>('/v1/monitoramentos/processos', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** Lista todos os monitoramentos ativos */
export function listMonitoramentos() {
  return request<BpMonitoramentosListData>('/v1/monitoramentos/processos')
}

/** Remove um monitoramento pelo ID */
export function deleteMonitoramento(id: string) {
  return request<void>(`/v1/monitoramentos/processos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}
