/**
 * Texto que vai para dentro do .docx. Separado de `docx.ts` para a tela poder
 * montar os valores sem carregar o `docxtemplater` — ele só é baixado na hora
 * de gerar.
 */

/**
 * Marca de "parágrafo novo" dentro de um valor: U+2029 PARAGRAPH SEPARATOR —
 * válido em XML e que ninguém digita. Depois do preenchimento, cada marca vira
 * um `<w:p>` de verdade, com as propriedades do parágrafo do modelo.
 *
 * Por que não só quebra de linha: num parágrafo justificado — o comum em
 * petição — o Word estica a linha que termina numa quebra manual até a margem,
 * e o recuo de primeira linha só vale para a primeira. Um {fatos} de cinco
 * parágrafos sairia torto.
 */
export const PARAGRAPH_BREAK = String.fromCharCode(0x2029)

/** Texto de vários parágrafos → valor do modelo: linha em branco separa
 * parágrafos; quebra simples continua quebra de linha. */
export function toTemplateText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join(PARAGRAPH_BREAK)
}

/** "A", "A e B", "A, B e C". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`
}

/**
 * Texto que a IA escreveu, como texto puro. O modelo às vezes responde em
 * Markdown mesmo instruído a não fazer; num .docx os asteriscos e cerquilhas
 * sairiam literais no meio da petição.
 */
export function toPlainText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim()
}
