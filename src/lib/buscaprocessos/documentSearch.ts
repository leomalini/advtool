// Regras compartilhadas da busca de processos por CPF/CNPJ.
//
// Vive fora de `client.ts` de propósito: aquele arquivo é server-only (carrega
// a API key), e a tela precisa das mesmas constantes. Aqui não há import de
// runtime nenhum — só tipos e funções puras.
import type { BpEnvolvidoResumo, BpProcessoCapa } from './types'

/** Por quanto tempo uma busca já feita continua valendo.
 *
 * Uma semana é o compromisso entre não repetir a consulta à toa e não esconder
 * um processo novo por tempo demais: distribuição não é evento de minuto a
 * minuto. Quem precisar do dado fresco antes disso tem o `force`, que é uma
 * decisão explícita de consultar de novo. */
export const DOCUMENT_SEARCH_TTL_DAYS = 7

const TTL_MS = DOCUMENT_SEARCH_TTL_DAYS * 24 * 3_600_000

/** Só os dígitos. É assim que a API devolve o documento e é assim que ele é
 * gravado — qualquer formatação criaria uma chave de cache diferente para o
 * mesmo CPF e repetiria a consulta. */
export function normalizeDocument(input: string): string {
  return input.replace(/\D/g, '')
}

/** 11 dígitos é CPF, 14 é CNPJ. Qualquer outra contagem é digitação
 * inacabada, e mandá-la para a API só renderia um 422. */
export function isValidDocument(digits: string): boolean {
  return digits.length === 11 || digits.length === 14
}

/** A API repete o processo inteiro dentro de `raw` em cada item, dobrando o
 * tamanho da resposta sem acrescentar um campo sequer. Fora antes de gravar e
 * antes de responder. */
export function stripRaw(processos: BpProcessoCapa[]): BpProcessoCapa[] {
  return processos.map((processo) => {
    const copy = { ...processo }
    delete copy.raw
    return copy
  })
}

/** Uma busca já expirou? */
export function isStale(searchedAt: string, now = Date.now()): boolean {
  const age = now - new Date(searchedAt).getTime()
  return !Number.isFinite(age) || age > TTL_MS
}

/** O que `GET /api/buscaprocessos/processos` devolve.
 *
 * Difere do envelope da BuscaProcessos: `fromCache` e `searchedAt` são nossos,
 * e são o que a tela usa para dizer de quando é o resultado que está vendo. */
export interface DocumentSearchResponse {
  document: string
  documentType: string | null
  envolvido: BpEnvolvidoResumo | null
  processos: BpProcessoCapa[]
  total: number
  fromCache: boolean
  searchedAt: string
}
