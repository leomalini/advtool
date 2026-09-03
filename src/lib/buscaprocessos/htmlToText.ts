/**
 * Converte o `conteudoCompletoHtml` da publicação em texto legível.
 *
 * A alternativa seria renderizar o HTML na tela, o que exigiria sanitização
 * (DOMPurify, que o projeto não tem) e abriria superfície de XSS com conteúdo
 * de terceiro. Publicação de diário é texto corrido em caixa alta — não há
 * negrito nem tabela a preservar, então renderizar HTML traria risco sem
 * trazer formatação.
 *
 * O HTML original continua gravado em `publications.content_html`: nada se
 * perde, apenas não é renderizado.
 */

/**
 * Entidades nomeadas em HTML.
 *
 * Tabela declarada como texto e expandida no carregamento: como par por linha
 * ela ocuparia setenta linhas, e o que importa aqui é conseguir conferir a
 * cobertura de relance. O ordinal (`&ordf;`) e o parágrafo (`&sect;`) são os
 * que mais aparecem em publicação — "17ª Região", "art. 5º", "§ 2º".
 */
const ENTITY_TABLE =
  'amp:& lt:< gt:> ' +
  'ordf:ª ordm:º sect:§ deg:° middot:· bull:• hellip:… ndash:– mdash:— ' +
  'laquo:« raquo:» times:× copy:© reg:® trade:™ euro:€ ' +
  'aacute:á agrave:à atilde:ã acirc:â auml:ä aring:å ' +
  'eacute:é egrave:è ecirc:ê euml:ë ' +
  'iacute:í igrave:ì icirc:î iuml:ï ' +
  'oacute:ó ograve:ò otilde:õ ocirc:ô ouml:ö ' +
  'uacute:ú ugrave:ù ucirc:û uuml:ü ' +
  'ccedil:ç ntilde:ñ ' +
  'Aacute:Á Agrave:À Atilde:Ã Acirc:Â Auml:Ä ' +
  'Eacute:É Egrave:È Ecirc:Ê Euml:Ë ' +
  'Iacute:Í Igrave:Ì Icirc:Î Iuml:Ï ' +
  'Oacute:Ó Ograve:Ò Otilde:Õ Ocirc:Ô Ouml:Ö ' +
  'Uacute:Ú Ugrave:Ù Ucirc:Û Uuml:Ü ' +
  'Ccedil:Ç Ntilde:Ñ'

const NAMED_ENTITIES: Record<string, string> = Object.fromEntries(
  ENTITY_TABLE.split(' ')
    .filter(Boolean)
    .map((pair) => {
      const separator = pair.indexOf(':')
      return [pair.slice(0, separator), pair.slice(separator + 1)]
    }),
)

function decodeEntities(value: string): string {
  return value
    // Fora da tabela porque aspas e espaço rígido não sobrevivem a uma
    // tabela escrita como texto.
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name] ?? match)
}

/**
 * HTML → texto com parágrafos preservados.
 *
 * Quebras vêm de `<br>`, do fim de `<p>`/`<div>` e dos itens de lista; todo o
 * resto da marcação sai. `<script>` e `<style>` são removidos com seu conteúdo,
 * senão o código apareceria como texto.
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return ''

  const text = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')

  return (
    decodeEntities(text)
      // Espaço rígido e tabulação viram espaço comum antes de colapsar.
      .replace(/[\t ]+/g, ' ')
      .replace(/[ ]{2,}/g, ' ')
      .split('\n')
      .map((line) => line.trim())
      // Três ou mais quebras seguidas viram parágrafo simples.
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/** Trecho para a listagem, cortado em limite de palavra. */
export function excerptFrom(text: string, maxLength = 220): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= maxLength) return flat

  const cut = flat.slice(0, maxLength)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLength)}…`
}
