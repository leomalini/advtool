import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import Docxtemplater from 'docxtemplater'
import InspectModule from 'docxtemplater/js/inspect-module.js'
import PizZip from 'pizzip'

/**
 * Leitura e preenchimento de modelos .docx com `docxtemplater`.
 *
 * Isomórfico de propósito: a tela de modelos inspeciona o arquivo no navegador
 * (para mostrar os campos antes de salvar) e o servidor preenche. As opções
 * precisam ser as mesmas nos dois lados, senão um modelo aceito no upload
 * poderia falhar na geração.
 */
const OPTIONS = {
  // Laço num parágrafo próprio não deixa parágrafo vazio no lugar da tag.
  paragraphLoop: true,
  // "\n" no texto vira quebra de linha dentro do parágrafo. Parágrafo novo é
  // outra coisa — ver PARAGRAPH_BREAK.
  linebreaks: true,
  // Os erros são tratados aqui (TemplateSyntaxError); o log padrão despejaria
  // o JSON inteiro de cada erro no console do servidor.
  errorLogging: false,
} as const

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'

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

/** Texto de um campo redigido → valor do modelo: linha em branco separa
 * parágrafos; quebra simples continua quebra de linha. */
export function toTemplateText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join(PARAGRAPH_BREAK)
}

function wChild(parent: { childNodes: ArrayLike<unknown> }, localName: string) {
  for (const node of Array.from(parent.childNodes) as Array<{
    nodeType: number
    namespaceURI?: string | null
    localName?: string | null
  }>) {
    if (node.nodeType === 1 && node.namespaceURI === W_NS && node.localName === localName) {
      return node
    }
  }
  return null
}

/**
 * Divide os parágrafos do XML em cada PARAGRAPH_BREAK. O parágrafo novo leva
 * uma cópia das propriedades do original (`w:pPr`: alinhamento, recuo,
 * espaçamento, estilo) — menos `w:sectPr`, que no último parágrafo de uma seção
 * marca a quebra de seção e, copiado, criaria seções extras. O texto novo leva
 * a formatação do trecho onde estava (`w:rPr`).
 */
function splitParagraphs(xml: string): string {
  const doc = new DOMParser({
    // O padrão do xmldom normaliza fins de linha como o XML 1.1 manda — e
    // U+2029 está na lista: a marca virava "\n" na leitura e nenhum parágrafo
    // era dividido. O XML vem do docxtemplater já como o Word o escreve;
    // nada aqui precisa ser normalizado.
    normalizeLineEndings: (source) => source,
  }).parseFromString(xml, 'text/xml')

  for (;;) {
    const texts = Array.from(doc.getElementsByTagNameNS(W_NS, 't'))
    const target = texts.find((node) => (node.textContent ?? '').includes(PARAGRAPH_BREAK))
    if (!target) break

    const content = target.textContent ?? ''
    const index = content.indexOf(PARAGRAPH_BREAK)
    const run = target.parentNode
    const paragraph = run?.parentNode

    const setText = (node: typeof target, value: string) => {
      while (node.firstChild) node.removeChild(node.firstChild)
      node.appendChild(doc.createTextNode(value))
    }

    // Texto dentro de hyperlink, campo ou caixa de texto: dividir o parágrafo
    // ali quebraria a estrutura. Fica um espaço no lugar da marca.
    if (
      !run ||
      !paragraph ||
      run.namespaceURI !== W_NS ||
      (run as { localName?: string }).localName !== 'r' ||
      paragraph.namespaceURI !== W_NS ||
      (paragraph as { localName?: string }).localName !== 'p' ||
      !paragraph.parentNode
    ) {
      setText(target, content.replace(PARAGRAPH_BREAK, ' '))
      continue
    }

    setText(target, content.slice(0, index))

    const newRun = doc.createElementNS(W_NS, 'w:r')
    const runProps = wChild(run, 'rPr') as typeof target | null
    if (runProps) newRun.appendChild(runProps.cloneNode(true))
    const newText = doc.createElementNS(W_NS, 'w:t')
    newText.setAttributeNS(XML_NS, 'xml:space', 'preserve')
    newText.appendChild(doc.createTextNode(content.slice(index + PARAGRAPH_BREAK.length)))
    newRun.appendChild(newText)
    // O resto do trecho (outras quebras, outros textos) vai junto.
    while (target.nextSibling) newRun.appendChild(target.nextSibling)

    const newParagraph = doc.createElementNS(W_NS, 'w:p')
    const paragraphProps = wChild(paragraph, 'pPr') as typeof target | null
    if (paragraphProps) {
      const copy = paragraphProps.cloneNode(true) as typeof target
      const sectionProps = wChild(copy, 'sectPr') as typeof target | null
      if (sectionProps) copy.removeChild(sectionProps)
      newParagraph.appendChild(copy)
    }
    newParagraph.appendChild(newRun)
    // Os trechos seguintes do parágrafo original passam para o novo.
    while (run.nextSibling) newParagraph.appendChild(run.nextSibling)

    paragraph.parentNode.insertBefore(newParagraph, paragraph.nextSibling)
  }

  return new XMLSerializer().serializeToString(doc)
}

/** Modelo com campo mal formado (`{cliente_nome` sem fechar, etc.). */
export class TemplateSyntaxError extends Error {
  constructor(readonly details: string[]) {
    super(`O modelo tem campos mal formados: ${details.join('; ')}`)
  }
}

interface DocxtemplaterErrorShape {
  properties?: {
    errors?: Array<{ message?: string; properties?: { xtag?: string; explanation?: string } }>
    explanation?: string
  }
}

function toSyntaxError(error: unknown): Error {
  const properties = (error as DocxtemplaterErrorShape | null)?.properties
  const details = (properties?.errors ?? []).map(
    (item) =>
      (item.properties?.xtag ? `{${item.properties.xtag}}` : undefined) ??
      item.properties?.explanation ??
      item.message ??
      'erro de sintaxe',
  )
  if (details.length > 0) return new TemplateSyntaxError(details)
  if (properties?.explanation) return new TemplateSyntaxError([properties.explanation])
  return error instanceof Error ? error : new Error('Não foi possível ler o modelo.')
}

function openZip(bytes: Uint8Array | ArrayBuffer): PizZip {
  try {
    return new PizZip(bytes)
  } catch {
    throw new TemplateSyntaxError(['o arquivo não é um .docx válido'])
  }
}

/** Nomes dos campos `{...}` do modelo, em ordem alfabética. */
export function inspectTemplateFields(bytes: Uint8Array | ArrayBuffer): string[] {
  const inspector = new InspectModule()
  try {
    // O construtor com zip compila na hora — é aqui que um campo mal formado
    // aparece.
    new Docxtemplater(openZip(bytes), { ...OPTIONS, modules: [inspector] })
  } catch (error) {
    throw toSyntaxError(error)
  }
  return Object.keys(inspector.getAllTags()).sort()
}

/**
 * Preenche o modelo. Campo sem valor vira `[FALTA: campo]` no documento — um
 * buraco visível que o advogado encontra na revisão, em vez de uma frase que
 * some sem ninguém notar — e volta listado em `missing`.
 */
export function renderTemplate(
  bytes: Uint8Array | ArrayBuffer,
  values: Readonly<Record<string, string | undefined>>,
): { bytes: Uint8Array; missing: string[] } {
  const missing = new Set<string>()
  let doc: Docxtemplater
  try {
    doc = new Docxtemplater(openZip(bytes), {
      ...OPTIONS,
      nullGetter: (part) => {
        // Tag simples sem valor. Laços e XML cru (`module` preenchido) não
        // fazem parte do que os modelos usam; renderizam vazio.
        if (part.module) return ''
        missing.add(part.value)
        return `[FALTA: ${part.value}]`
      },
    })
    doc.render(values)
  } catch (error) {
    throw toSyntaxError(error)
  }

  const zip = doc.getZip() as PizZip
  // Corpo, cabeçalhos e rodapés — onde um campo pode estar.
  for (const file of zip.file(/^word\/(document|header\d*|footer\d*)\.xml$/)) {
    const xml = file.asText()
    if (xml.includes(PARAGRAPH_BREAK)) zip.file(file.name, splitParagraphs(xml))
  }

  return {
    bytes: zip.generate({ type: 'uint8array', compression: 'DEFLATE' }),
    missing: [...missing],
  }
}
