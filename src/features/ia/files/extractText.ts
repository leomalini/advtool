import mammoth from 'mammoth'
// Import default de propósito: o exceljs é CommonJS sem `__esModule`, e o
// named import (`{ Workbook }`) quebra fora do bundler (Node ESM puro).
import ExcelJS from 'exceljs'
import type { AiFileKind } from './constants'

/** Teto do texto entregue ao modelo por arquivo (~40 mil tokens). Uma planilha
 * inteira de movimentações passaria disso fácil, e mandar tudo encarece cada
 * pergunta sem melhorar a resposta. */
export const MAX_EXTRACTED_CHARS = 150_000

/** Linhas por aba antes de cortar. */
const MAX_ROWS_PER_SHEET = 2_000

function clip(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= MAX_EXTRACTED_CHARS) return trimmed
  return (
    `${trimmed.slice(0, MAX_EXTRACTED_CHARS)}\n\n` +
    `[… conteúdo truncado: o arquivo tem ${trimmed.length} caracteres; ` +
    `foram enviados os primeiros ${MAX_EXTRACTED_CHARS}.]`
  )
}

/**
 * 0x80–0x9F do Windows-1252 (€ ‚ ƒ „ … † ‡ ˆ ‰ Š ‹ Œ Ž ‘ ’ “ ” • – — ˜ ™ š › œ ž Ÿ).
 * As cinco posições sem caractere (0x81, 0x8D, 0x8F, 0x90, 0x9D) ficam como
 * estão.
 */
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
]

/**
 * Windows-1252 decodificado à mão. O `TextDecoder('windows-1252')` do Node
 * devolve a faixa 0x80–0x9F como controles C1 invisíveis — aspas curvas,
 * travessões e o € de uma planilha sumiriam sem erro nenhum. O resto da
 * tabela coincide com o Latin-1 (código do byte = código do caractere).
 */
function decodeWindows1252(bytes: Uint8Array): string {
  const chunks: string[] = []
  const CHUNK = 8192
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    const codes = Array.from(bytes.subarray(offset, offset + CHUNK), (byte) =>
      byte >= 0x80 && byte <= 0x9f ? CP1252_HIGH[byte - 0x80] : byte,
    )
    chunks.push(String.fromCharCode(...codes))
  }
  return chunks.join('')
}

/**
 * CSV e TXT exportados pelo Excel em português costumam vir em Windows-1252,
 * não UTF-8. Decodificar como UTF-8 trocaria todo "ç" e "ã" por "�" — tenta
 * UTF-8 estrito primeiro e cai para Windows-1252 se os bytes não fecharem.
 */
function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return decodeWindows1252(bytes)
  }
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * Data de célula como dd/MM/yyyy (com hora só quando há hora).
 *
 * O exceljs lê a data do Excel como meia-noite em UTC; `cell.text` a devolve
 * pelo `Date.toString()` no fuso do servidor — um vencimento em 18/09 virava
 * "Thu Sep 17 2026 21:00". Num sistema de prazos, dia errado é o pior erro
 * possível; por isso os componentes são lidos em UTC.
 */
function formatCellDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`
  const hasTime = date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0
  return hasTime ? `${day} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}` : day
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value
  if (value instanceof Date) return formatCellDate(value)
  // Fórmula cujo resultado é data.
  if (value && typeof value === 'object' && 'result' in value && value.result instanceof Date) {
    return formatCellDate(value.result)
  }
  // Demais casos: `text` é o valor como o Excel mostra (resultado da fórmula,
  // texto rico, hyperlink).
  return cell.text
}

async function sheetsToText(bytes: Uint8Array): Promise<string> {
  const workbook = new ExcelJS.Workbook()
  // O exceljs tipa a entrada como ArrayBuffer (repassa ao JSZip); `slice()`
  // dá um ArrayBuffer só com estes bytes, sem o resto do buffer de origem.
  await workbook.xlsx.load(bytes.slice().buffer)

  const sections = workbook.worksheets.map((sheet) => {
    const lines: string[] = []
    let truncated = false
    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (lines.length >= MAX_ROWS_PER_SHEET) {
        truncated = true
        return
      }
      const cells: string[] = []
      row.eachCell({ includeEmpty: true }, (cell) => cells.push(csvCell(cellText(cell))))
      lines.push(cells.join(','))
    })
    const note = truncated ? `\n[… aba cortada em ${MAX_ROWS_PER_SHEET} linhas]` : ''
    return `## Aba "${sheet.name}"\n${lines.join('\n')}${note}`
  })

  return sections.join('\n\n')
}

/**
 * Texto de um arquivo que o modelo não lê no original (Word, Excel, CSV, TXT).
 * Devolve `null` para PDF e imagem — esses vão como arquivo.
 *
 * Lança quando o arquivo está corrompido ou não é do formato que diz ser; quem
 * chama transforma isso em "não foi possível ler o arquivo".
 */
export async function extractText(kind: AiFileKind, bytes: Uint8Array): Promise<string | null> {
  switch (kind) {
    case 'docx': {
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
      return clip(value)
    }
    case 'xlsx':
      return clip(await sheetsToText(bytes))
    case 'csv':
    case 'txt':
      return clip(decodeText(bytes))
    case 'pdf':
    case 'image':
      return null
  }
}
