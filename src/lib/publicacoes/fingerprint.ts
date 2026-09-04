/**
 * Impressão digital de uma publicação, estável entre as fontes que a trazem.
 *
 * A mesma intimação chega por três caminhos e nenhum deles compartilha
 * identificador: o cadastro do processo deriva um hash de (data + conteúdo), a
 * busca por OAB traz o id da intimação na API, e o webhook não traz nada. O
 * conteúdo é a única coisa que os três têm em comum.
 *
 * ⚠️ ESTA NORMALIZAÇÃO É A MESMA DE `public.publication_fingerprint(text, text)`
 * (migration 46) E AS DUAS MUDAM JUNTAS. Se divergirem, nada quebra: o backfill
 * simplesmente deixa de casar com o que a aplicação calcula e as duplicatas
 * voltam em silêncio. `scripts/verify-fingerprint.mjs` confere a paridade.
 */

/**
 * Distância máxima, em dias, entre as datas de duas publicações de mesmo
 * conteúdo para que sejam consideradas a mesma.
 *
 * A janela existe porque as fontes datam o mesmo ato de formas diferentes: a
 * movimentação traz a DISPONIBILIZAÇÃO no diário, a intimação traz a
 * PUBLICAÇÃO — que é o primeiro dia útil seguinte (Lei 11.419/2006, art. 4º
 * §3º). Sete dias cobrem essa diferença somada a um feriado prolongado.
 *
 * Sem a janela, uma republicação idêntica meses depois seria engolida como
 * duplicata — e republicação é publicação de verdade, com prazo próprio.
 */
export const DEDUPE_WINDOW_DAYS = 7

export interface FingerprintInput {
  cnjNumber: string | null | undefined
  contentText: string | null | undefined
}

/** Só dígitos: as fontes formatam o CNJ com e sem pontuação. */
function normalizeCnj(cnj: string | null | undefined): string {
  return (cnj ?? '').replace(/\D/g, '')
}

/**
 * Minúsculas, tudo que não é [a-z0-9] vira um espaço, sobras nas pontas caem.
 *
 * Acentos somem porque não estão na classe — de propósito: é o que torna o
 * resultado idêntico ao do Postgres sem depender do collation da base.
 */
function normalizeContent(content: string | null | undefined): string {
  return (content ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * `null` quando não há conteúdo — sem texto não há o que comparar, e um
 * fingerprint de string vazia fundiria publicações distintas do mesmo processo.
 */
export async function publicationFingerprint({
  cnjNumber,
  contentText,
}: FingerprintInput): Promise<string | null> {
  const content = normalizeContent(contentText)
  if (!content) return null

  const raw = `${normalizeCnj(cnjNumber)}|${content}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

/** Diferença absoluta em dias entre duas datas 'yyyy-MM-dd'. */
export function daysApart(a: string, b: string): number {
  const toUtc = (iso: string) => {
    const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
    return Date.UTC(year, month - 1, day)
  }
  return Math.abs(toUtc(a) - toUtc(b)) / 86_400_000
}

/** A regra de colisão, num lugar só. */
export function isSamePublication(
  a: { fingerprint: string | null; publicationDate: string | null },
  b: { fingerprint: string | null; publicationDate: string | null },
): boolean {
  if (!a.fingerprint || !b.fingerprint) return false
  if (a.fingerprint !== b.fingerprint) return false
  if (!a.publicationDate || !b.publicationDate) return true
  return daysApart(a.publicationDate, b.publicationDate) <= DEDUPE_WINDOW_DAYS
}
