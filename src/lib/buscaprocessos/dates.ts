/**
 * Datas da BuscaProcessos em três formatos, uma saída só.
 *
 * Os endpoints REST devolvem 'yyyy-MM-dd' (`/movimentacoes`) ou
 * 'yyyy-MM-dd HH:mm:ss' (`/documentos-publicos`). O WEBHOOK devolve um terceiro
 * formato, brasileiro: '26/05/2026'.
 *
 * O motor de prazos (`src/lib/prazos`) recorta o ISO por posição — dia, mês e
 * ano saem de índices fixos. Entregar '26/05/2026' a ele não dá erro: produz
 * `Date.UTC(NaN, …)`, e a partir daí todo cálculo de prazo vira lixo em
 * silêncio. Por isso a conversão acontece na borda, uma vez, e nada abaixo
 * dela precisa saber que existe mais de um formato.
 *
 * O mesmo vale para a deduplicação: `movementHash` inclui a data no hash, e a
 * mesma movimentação vinda do REST ('2026-05-26') e do webhook ('26/05/2026')
 * só colide se as duas chegarem normalizadas.
 */

/** 'yyyy-MM-dd'. Null quando não dá para afirmar qual é a data. */
export function toIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  // 'yyyy-MM-dd', com ou sem hora/fuso depois.
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  // 'dd/MM/yyyy' — o formato do webhook.
  const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`

  return null
}
