import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import type { List, PhrasingContent, Root, RootContent, Table } from 'mdast'
import PizZip from 'pizzip'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

/**
 * Word a partir do Markdown que a IA escreve — minutas, notificações, cartas
 * que o advogado ainda vai editar. Com papel timbrado, o texto entra no corpo
 * do .docx do escritório (cabeçalho, rodapé, margens e fonte padrão dele); sem,
 * num documento A4 simples, em Times New Roman 12.
 *
 * O XML é escrito à mão, com formatação direta nos parágrafos: estilos
 * nomeados ("Título 1") dependeriam de o timbrado tê-los definidos. A ordem
 * dos elementos dentro de `w:pPr`/`w:rPr` segue o schema do OOXML — fora dela
 * o Word acusa "conteúdo ilegível".
 */

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

/** Largura útil do A4 com margens de 3 cm e 2 cm, em twips. */
const TEXT_WIDTH = 11906 - 1701 - 1134

/** Recuo de primeira linha dos parágrafos (2 cm) e o de citação (4 cm, ABNT). */
const FIRST_LINE_INDENT = 1134
const QUOTE_INDENT = 2268
const LIST_INDENT = 720
const LIST_HANGING = 360

interface RunStyle {
  bold?: boolean
  italic?: boolean
  strike?: boolean
  code?: boolean
  /** Meios-pontos (24 = 12 pt). */
  size?: number
}

interface ParagraphStyle {
  align?: 'both' | 'center' | 'left'
  keepNext?: boolean
  before?: number
  after?: number
  /** 240 = simples; 360 = 1,5. */
  line?: number
  left?: number
  firstLine?: number
  hanging?: number
  bottomBorder?: boolean
}

interface BlockContext {
  indent: number
  quote: boolean
}

/** Caracteres que o XML 1.0 não aceita (controles, exceto tab e quebras). */
function xmlSafe(text: string): string {
  return Array.from(text)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0
      if (code === 9 || code === 10 || code === 13) return true
      return code >= 32 && code !== 0xfffe && code !== 0xffff
    })
    .join('')
}

function escapeXml(text: string): string {
  return xmlSafe(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function run(text: string, style: RunStyle): string {
  const props = [
    style.code ? '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>' : '',
    style.bold ? '<w:b/>' : '',
    style.italic ? '<w:i/>' : '',
    style.strike ? '<w:strike/>' : '',
    style.size ? `<w:sz w:val="${style.size}"/><w:szCs w:val="${style.size}"/>` : '',
  ].join('')
  const content = text
    .split('\n')
    .map((piece, index) => {
      const text = `<w:t xml:space="preserve">${escapeXml(piece)}</w:t>`
      return index > 0 ? `<w:br/>${text}` : text
    })
    .join('')
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${content}</w:r>`
}

function paragraph(runs: string, style: ParagraphStyle = {}): string {
  const spacing =
    style.before !== undefined || style.after !== undefined || style.line !== undefined
      ? `<w:spacing${style.before !== undefined ? ` w:before="${style.before}"` : ''}${
          style.after !== undefined ? ` w:after="${style.after}"` : ''
        }${style.line !== undefined ? ` w:line="${style.line}" w:lineRule="auto"` : ''}/>`
      : ''
  const firstLine = style.hanging
    ? ` w:hanging="${style.hanging}"`
    : style.firstLine
      ? ` w:firstLine="${style.firstLine}"`
      : ''
  const indent =
    style.left || firstLine
      ? `<w:ind${style.left ? ` w:left="${style.left}"` : ''}${firstLine}/>`
      : ''
  const props = [
    style.keepNext ? '<w:keepNext/>' : '',
    style.bottomBorder
      ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr>'
      : '',
    spacing,
    indent,
    style.align ? `<w:jc w:val="${style.align}"/>` : '',
  ].join('')
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${runs}</w:p>`
}

function inline(nodes: PhrasingContent[], style: RunStyle): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return run(node.value, style)
        case 'strong':
          return inline(node.children, { ...style, bold: true })
        case 'emphasis':
          return inline(node.children, { ...style, italic: true })
        case 'delete':
          return inline(node.children, { ...style, strike: true })
        case 'inlineCode':
          return run(node.value, { ...style, code: true })
        case 'break':
          return '<w:r><w:br/></w:r>'
        case 'link': {
          const text = inline(node.children, style)
          const label = node.children.map((child) => ('value' in child ? child.value : '')).join('')
          // Sem relacionamento de hyperlink no pacote: o endereço vai por
          // extenso, que é como se cita em peça impressa.
          return /^https?:\/\//i.test(node.url) && label !== node.url
            ? `${text}${run(` (${node.url})`, style)}`
            : text
        }
        default:
          // Imagem, HTML e referências não entram no documento.
          return ''
      }
    })
    .join('')
}

function bodyParagraph(children: PhrasingContent[], context: BlockContext): string {
  if (context.quote) {
    return paragraph(inline(children, { size: 20 }), {
      align: 'both',
      left: QUOTE_INDENT + context.indent,
      line: 240,
      after: 120,
    })
  }
  return paragraph(inline(children, {}), {
    align: 'both',
    left: context.indent || undefined,
    firstLine: context.indent ? undefined : FIRST_LINE_INDENT,
  })
}

function list(node: List, context: BlockContext): string[] {
  const start = node.start ?? 1
  const left = context.indent + LIST_INDENT
  return node.children.flatMap((item, index) => {
    const marker = node.ordered ? `${start + index}. ` : '• '
    const [first, ...rest] = item.children
    const head =
      first?.type === 'paragraph'
        ? paragraph(run(marker, {}) + inline(first.children, context.quote ? { size: 20 } : {}), {
            align: 'both',
            left,
            hanging: LIST_HANGING,
          })
        : paragraph(run(marker, {}), { left, hanging: LIST_HANGING })
    const tail = first?.type === 'paragraph' ? rest : item.children
    return [head, ...blocks(tail, { ...context, indent: left })]
  })
}

function table(node: Table): string {
  const columns = Math.max(1, ...node.children.map((row) => row.children.length))
  const width = Math.floor(TEXT_WIDTH / columns)
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`
  const rows = node.children
    .map((row, rowIndex) => {
      const cells = row.children
        .map(
          (cell) =>
            `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${paragraph(
              inline(cell.children, { bold: rowIndex === 0, size: 20 }),
              { line: 240, after: 0 },
            )}</w:tc>`,
        )
        .join('')
      return `<w:tr>${cells}</w:tr>`
    })
    .join('')
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>` +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('') +
    '</w:tblBorders></w:tblPr>' +
    `<w:tblGrid>${`<w:gridCol w:w="${width}"/>`.repeat(columns)}</w:tblGrid>` +
    `${rows}</w:tbl>`
  )
}

function blocks(nodes: RootContent[], context: BlockContext): string[] {
  return nodes.flatMap((node): string[] => {
    switch (node.type) {
      case 'heading':
        return [
          paragraph(inline(node.children, { bold: true, size: node.depth === 1 ? 26 : 24 }), {
            align: node.depth === 1 ? 'center' : 'left',
            keepNext: true,
            before: 240,
            after: 120,
          }),
        ]
      case 'paragraph':
        return [bodyParagraph(node.children, context)]
      case 'list':
        return list(node, context)
      case 'blockquote':
        return blocks(node.children, { ...context, quote: true })
      case 'code':
        return node.value
          .split('\n')
          .map((line) =>
            paragraph(run(line, { code: true, size: 20 }), {
              left: context.indent + 360,
              line: 240,
              after: 0,
            }),
          )
      case 'thematicBreak':
        return [paragraph('', { bottomBorder: true })]
      case 'table':
        // Parágrafo vazio depois: o Word não aceita duas tabelas coladas nem
        // uma tabela como último elemento de uma célula ou do corpo.
        return [table(node), paragraph('', { after: 0 })]
      default:
        return []
    }
  })
}

function contentXml(title: string | undefined, markdown: string): string {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root
  const heading = title?.trim()
    ? [
        paragraph(run(title.trim(), { bold: true, size: 28 }), {
          align: 'center',
          keepNext: true,
          after: 240,
        }),
      ]
    : []
  return [...heading, ...blocks(tree.children, { indent: 0, quote: false })].join('')
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ' +
  'ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ' +
  'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main' +
  '+xml"/>' +
  '<Override PartName="/word/styles.xml" ' +
  'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '</Types>'

const PACKAGE_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" ' +
  'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" ' +
  'Target="word/document.xml"/></Relationships>'

const DOCUMENT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" ' +
  'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" ' +
  'Target="styles.xml"/></Relationships>'

const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  `<w:styles xmlns:w="${W_NS}"><w:docDefaults>` +
  '<w:rPrDefault><w:rPr>' +
  '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" ' +
  'w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="pt-BR"/>' +
  '</w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr>' +
  '</w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
  '<w:qFormat/></w:style></w:styles>'

/** A4, margens de 3 cm (superior e esquerda) e 2 cm (inferior e direita). */
const DEFAULT_SECTION =
  '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
  '<w:pgMar w:top="1701" w:right="1134" w:bottom="1134" w:left="1701" w:header="709" ' +
  'w:footer="709" w:gutter="0"/></w:sectPr>'

function plainDocument(content: string): Uint8Array {
  const zip = new PizZip()
  zip.file('[Content_Types].xml', CONTENT_TYPES)
  zip.file('_rels/.rels', PACKAGE_RELS)
  zip.file('word/_rels/document.xml.rels', DOCUMENT_RELS)
  zip.file('word/styles.xml', STYLES)
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<w:document xmlns:w="${W_NS}"><w:body>${content}${DEFAULT_SECTION}</w:body></w:document>`,
  )
  return zip.generate({ type: 'uint8array', compression: 'DEFLATE' })
}

/** Erro de papel timbrado ilegível — quem chama cai para o documento simples. */
export class LetterheadError extends Error {}

/**
 * O corpo do timbrado é trocado pelo conteúdo; a seção final (`w:sectPr` —
 * tamanho da página, margens e a referência ao cabeçalho e ao rodapé) fica.
 */
function intoLetterhead(letterhead: Uint8Array, content: string): Uint8Array {
  let zip: PizZip
  try {
    zip = new PizZip(letterhead)
  } catch {
    throw new LetterheadError('O papel timbrado não é um .docx válido.')
  }
  const documentFile = zip.file('word/document.xml')
  if (!documentFile) throw new LetterheadError('O papel timbrado não tem corpo de documento.')

  const doc = new DOMParser().parseFromString(documentFile.asText(), 'text/xml')
  const body = doc.getElementsByTagNameNS(W_NS, 'body').item(0)
  if (!body) throw new LetterheadError('O papel timbrado não tem corpo de documento.')

  const children = Array.from(body.childNodes)
  const section = children
    .filter((node) => node.nodeType === 1)
    .findLast(
      (node) =>
        node.namespaceURI === W_NS && (node as { localName?: string }).localName === 'sectPr',
    )
  for (const child of children) {
    if (child !== section) body.removeChild(child)
  }

  const fragment = new DOMParser().parseFromString(
    `<w:root xmlns:w="${W_NS}">${content}</w:root>`,
    'text/xml',
  )
  for (const node of Array.from(fragment.documentElement?.childNodes ?? [])) {
    const imported = doc.importNode(node, true)
    if (section) body.insertBefore(imported, section)
    else body.appendChild(imported)
  }

  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc))
  return zip.generate({ type: 'uint8array', compression: 'DEFLATE' })
}

/** Markdown → bytes do .docx. `letterhead` é o timbrado do escritório, se houver. */
export function markdownToDocx({
  title,
  markdown,
  letterhead,
}: {
  title?: string
  markdown: string
  letterhead: Uint8Array | null
}): Uint8Array {
  const content = contentXml(title, markdown)
  return letterhead ? intoLetterhead(letterhead, content) : plainDocument(content)
}
