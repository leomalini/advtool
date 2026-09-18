import type { ReactNode } from 'react'
import {
  Document,
  Font,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer'
import type { List, PhrasingContent, Root, RootContent, Table } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

/**
 * PDF a partir do Markdown que a IA escreve (relatórios, resumos, minutas
 * livres). Petição em modelo do escritório não passa por aqui — é
 * `gerar_documento_de_modelo`, que preserva o .docx original.
 *
 * Fontes: as padrão do PDF (Helvetica/Courier), que dispensam arquivo de fonte
 * no servidor e cobrem o português (Latin-1).
 */

// A hifenização padrão segue regras do inglês e quebra palavras em português
// no lugar errado ("advo-gado" vira "ad-vogado"). Sem hifenizar, o texto
// justificado só ajusta espaços.
Font.registerHyphenationCallback((word) => [word])

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: 64,
    fontFamily: 'Helvetica',
    fontSize: 11,
    lineHeight: 1.45,
    color: '#1f2328',
  },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 16, marginBottom: 14 },
  h1: { fontFamily: 'Helvetica-Bold', fontSize: 14, marginTop: 12, marginBottom: 6 },
  h2: { fontFamily: 'Helvetica-Bold', fontSize: 12.5, marginTop: 10, marginBottom: 5 },
  h3: { fontFamily: 'Helvetica-Bold', fontSize: 11.5, marginTop: 8, marginBottom: 4 },
  paragraph: { marginBottom: 7, textAlign: 'justify' },
  bold: { fontFamily: 'Helvetica-Bold' },
  italic: { fontFamily: 'Helvetica-Oblique' },
  boldItalic: { fontFamily: 'Helvetica-BoldOblique' },
  strike: { textDecoration: 'line-through' },
  code: { fontFamily: 'Courier', fontSize: 10 },
  codeBlock: {
    fontFamily: 'Courier',
    fontSize: 9.5,
    backgroundColor: '#f3f4f6',
    padding: 8,
    marginBottom: 8,
  },
  link: { color: '#1d4ed8', textDecoration: 'underline' },
  list: { marginBottom: 7 },
  listItem: { flexDirection: 'row', marginBottom: 3 },
  bullet: { width: 18 },
  listBody: { flex: 1 },
  quote: {
    borderLeftWidth: 2,
    borderLeftColor: '#d1d5db',
    paddingLeft: 10,
    marginBottom: 8,
    color: '#4b5563',
  },
  rule: { borderBottomWidth: 1, borderBottomColor: '#d1d5db', marginVertical: 10 },
  table: { marginBottom: 10, borderTopWidth: 1, borderLeftWidth: 1, borderColor: '#d1d5db' },
  tableRow: { flexDirection: 'row' },
  tableCell: {
    flex: 1,
    padding: 4,
    fontSize: 9.5,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#d1d5db',
  },
  tableHeader: { fontFamily: 'Helvetica-Bold', backgroundColor: '#f3f4f6' },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 64,
    right: 64,
    fontSize: 8.5,
    color: '#6b7280',
    textAlign: 'right',
  },
})

/** Caracteres além do Latin-1 que as fontes padrão do PDF também têm. */
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
const REPLACEMENTS: Record<string, string> = {
  '→': '->',
  '←': '<-',
  '✓': 'v',
  '✔': 'v',
  '≥': '>=',
  '≤': '<=',
  '≠': '!=',
}

/**
 * As fontes padrão não têm emoji, setas nem símbolos; um desses caracteres
 * sairia como lixo no PDF. Troca os comuns por equivalentes e descarta o resto.
 */
function toPdfText(text: string): string {
  return Array.from(text)
    .map((char) => {
      if ((char.codePointAt(0) ?? 0) <= 0xff || WIN_ANSI_EXTRA.has(char)) return char
      return REPLACEMENTS[char] ?? ''
    })
    .join('')
}

type InlineStyle = 'bold' | 'italic'

function renderInline(nodes: PhrasingContent[], inherited: InlineStyle[] = []): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'text':
        return toPdfText(node.value)
      case 'strong':
      case 'emphasis': {
        const marks: InlineStyle[] = [...inherited, node.type === 'strong' ? 'bold' : 'italic']
        const style =
          marks.includes('bold') && marks.includes('italic')
            ? styles.boldItalic
            : marks.includes('bold')
              ? styles.bold
              : styles.italic
        return (
          <Text key={index} style={style}>
            {renderInline(node.children, marks)}
          </Text>
        )
      }
      case 'delete':
        return (
          <Text key={index} style={styles.strike}>
            {renderInline(node.children, inherited)}
          </Text>
        )
      case 'inlineCode':
        return (
          <Text key={index} style={styles.code}>
            {toPdfText(node.value)}
          </Text>
        )
      case 'link':
        // Só http(s) vira link clicável; o resto fica como texto.
        return /^https?:\/\//i.test(node.url) ? (
          <Link key={index} src={node.url} style={styles.link}>
            {renderInline(node.children, inherited)}
          </Link>
        ) : (
          <Text key={index}>{renderInline(node.children, inherited)}</Text>
        )
      case 'break':
        return '\n'
      default:
        // Imagem, HTML e referências não entram no PDF.
        return null
    }
  })
}

function renderList(node: List, key: number): ReactNode {
  const start = node.start ?? 1
  return (
    <View key={key} style={styles.list}>
      {node.children.map((item, index) => (
        <View key={index} style={styles.listItem} wrap={false}>
          <Text style={styles.bullet}>{node.ordered ? `${start + index}.` : '•'}</Text>
          <View style={styles.listBody}>{renderBlocks(item.children)}</View>
        </View>
      ))}
    </View>
  )
}

function renderTable(node: Table, key: number): ReactNode {
  return (
    <View key={key} style={styles.table}>
      {node.children.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.tableRow} wrap={false}>
          {row.children.map((cell, cellIndex) => (
            <Text
              key={cellIndex}
              style={rowIndex === 0 ? [styles.tableCell, styles.tableHeader] : styles.tableCell}
            >
              {renderInline(cell.children)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

function renderBlocks(nodes: RootContent[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'heading': {
        const style = node.depth === 1 ? styles.h1 : node.depth === 2 ? styles.h2 : styles.h3
        return (
          <Text key={index} style={style}>
            {renderInline(node.children)}
          </Text>
        )
      }
      case 'paragraph':
        return (
          <Text key={index} style={styles.paragraph}>
            {renderInline(node.children)}
          </Text>
        )
      case 'list':
        return renderList(node, index)
      case 'blockquote':
        return (
          <View key={index} style={styles.quote}>
            {renderBlocks(node.children)}
          </View>
        )
      case 'code':
        return (
          <Text key={index} style={styles.codeBlock}>
            {toPdfText(node.value)}
          </Text>
        )
      case 'thematicBreak':
        return <View key={index} style={styles.rule} />
      case 'table':
        return renderTable(node, index)
      default:
        return null
    }
  })
}

/** Markdown → bytes do PDF (A4, numeração de página no rodapé). */
export async function markdownToPdf({
  title,
  markdown,
}: {
  title: string
  markdown: string
}): Promise<Uint8Array> {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root

  const buffer = await renderToBuffer(
    <Document title={title} author="AdvTool" creator="AdvTool — Assistente" language="pt-BR">
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{toPdfText(title)}</Text>
        {renderBlocks(tree.children)}
        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>,
  )
  return new Uint8Array(buffer)
}
