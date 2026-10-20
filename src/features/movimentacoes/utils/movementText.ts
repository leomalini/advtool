/**
 * O texto do ato vem em duas formas, e uma delas é código.
 *
 * ── Forma 1: TPU codificada (48 de 171 linhas da base, out/2026) ────────────
 *
 *   "Expedição de documento — Outros documentos: 80"
 *   "Conclusão — para decisão: 6"
 *   "de Conciliação — Conciliador(a): 188 | realizada: 13"
 *
 * É o movimento da Tabela Processual Unificada do CNJ seguido dos
 * complementos: `<movimento> — <complemento>: <código> | <complemento>: <código>`.
 * Os números são os CÓDIGOS do complemento na TPU — não são datas, nem
 * quantidades, nem nada que o advogado precise ver. Mostrar a string crua põe
 * "Outros documentos: 80" na linha da lista, onde "80" só gera dúvida.
 *
 * ── Forma 2: texto corrido (123 de 171) ─────────────────────────────────────
 *
 *   "Expedição de Mandado - Citação."
 *   "Audiência Una designada para 13/10/2026 14:00 Cariacica - ..."
 *   "[DJEN] ESTADO DO ESPÍRITO SANTO PODER JUDICIÁRIO ..."
 *
 * Essa passa intacta.
 *
 * ⚠️ NÃO É PAPEL DESTE ARQUIVO CONSERTAR O QUE A ORIGEM PERDEU. Cinco linhas
 * chegam sem o substantivo inicial ("de Conciliação", "de Instrução e
 * Julgamento" — falta "Audiência"), e isso foi provado ser perda da origem, não
 * nossa: `raw_data.conteudo` é idêntico a `description` em 171/171, e o
 * `payload.event_data.conteudo` das entregas em `webhook_events` é idêntico ao
 * gravado em 47/47 rastreáveis. Ver o apêndice BuscaProcessos em
 * `docs/ROADMAP-MODULOS.md`. Quem repõe a informação para o usuário é o chip de
 * categoria, que diz "Audiência" porque o classificador reconhece o fragmento
 * (migration 73) — inventar a palavra no texto seria afirmar o que a origem
 * não disse.
 */

/** `<movimento> — <complementos>`. Não-guloso no primeiro grupo: o separador
 * só vale na primeira ocorrência, porque o movimento nunca o contém. */
const TPU_SHAPE = /^(.+?) — (.+)$/

/** `nome do complemento: código`. O código é sempre numérico. */
const COMPLEMENT_WITH_CODE = /^(.*?):\s*\d+$/

const COMPLEMENT_SEPARATOR = ' | '

export interface MovementText {
  /** O que vai na linha da lista. */
  headline: string
  /** Complementos sem os códigos, ou nulo quando não sobra nada legível. */
  detail: string | null
}

/**
 * Separa o movimento dos complementos e descarta os códigos da TPU.
 *
 * Texto que não está no formato TPU volta inteiro em `headline`, com `detail`
 * nulo — é o caso da maioria das linhas.
 */
export function parseMovementText(text: string): MovementText {
  const trimmed = text.trim()
  const shape = TPU_SHAPE.exec(trimmed)
  if (!shape) return { headline: trimmed, detail: null }

  const [, movement, complements] = shape
  // A regex garante os dois grupos, mas o tipo não sabe disso.
  if (!movement || !complements) return { headline: trimmed, detail: null }

  const readable: string[] = []
  for (const part of complements.split(COMPLEMENT_SEPARATOR)) {
    const candidate = part.trim()
    if (candidate === '') continue

    const withCode = COMPLEMENT_WITH_CODE.exec(candidate)
    if (withCode) {
      // "Outros documentos: 80" → "Outros documentos"
      const name = withCode[1]?.trim()
      if (name) readable.push(name)
      continue
    }

    // Complemento que chegou só como código ("188", "9") não diz nada.
    if (/^\d+$/.test(candidate)) continue

    readable.push(candidate)
  }

  return {
    headline: movement.trim(),
    detail: readable.length > 0 ? readable.join(' · ') : null,
  }
}
