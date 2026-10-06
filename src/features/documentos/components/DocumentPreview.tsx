'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Options as PreviewOptions } from 'docx-preview'
import { AlertTriangle, FileText, Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'
import type { TemplateValues } from '../templates/values'

/** Prefixo das classes que o `docx-preview` gera — e dos estilos dele. */
const PREVIEW_CLASS = 'advtool-docx'

/** Espera depois da última digitação antes de remontar a prévia. */
const RENDER_DELAY_MS = 400

const PREVIEW_OPTIONS: Partial<PreviewOptions> = {
  className: PREVIEW_CLASS,
  inWrapper: true,
  breakPages: true,
  renderHeaders: true,
  renderFooters: true,
  renderFootnotes: true,
  renderEndnotes: true,
  // Imagens e fontes como data URL: nada de blob URL para revogar depois.
  useBase64URL: true,
  renderChanges: false,
  renderComments: false,
  // Um .docx pode embutir HTML (altChunk), que a biblioteca poria num iframe
  // `srcdoc` — na mesma origem da página. Modelo não usa isso; fica desligado.
  renderAltChunks: false,
}

/** Marcas de campo sem valor no documento, destacadas na prévia. */
const PLACEHOLDER = /\[(?:FALTA|PREENCHER): [^\]]*\]/g

/** Links só http(s) e mailto, abrindo fora; qualquer outro esquema perde o href. */
function sanitizeLinks(root: HTMLElement) {
  for (const anchor of root.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href') ?? ''
    if (/^(https?:|mailto:)/i.test(href)) {
      anchor.setAttribute('target', '_blank')
      anchor.setAttribute('rel', 'noopener noreferrer')
    } else if (!href.startsWith('#')) {
      anchor.removeAttribute('href')
    }
  }
}

function highlightPlaceholders(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const hits: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if ((node.nodeValue ?? '').search(PLACEHOLDER) !== -1) hits.push(node as Text)
  }
  for (const text of hits) {
    const value = text.nodeValue ?? ''
    const fragment = document.createDocumentFragment()
    let last = 0
    for (const match of value.matchAll(PLACEHOLDER)) {
      const start = match.index ?? 0
      fragment.append(value.slice(last, start))
      const mark = document.createElement('mark')
      mark.textContent = match[0]
      fragment.append(mark)
      last = start + match[0].length
    }
    fragment.append(value.slice(last))
    text.replaceWith(fragment)
  }
}

type RenderResult = { key: string; pages: number } | { key: string; error: string }

interface DocumentPreviewProps {
  /** Há modelo escolhido. */
  hasTemplate: boolean
  /** Identifica o arquivo do modelo — muda quando o modelo ou o arquivo muda. */
  templateKey: string | null
  templateBytes: Uint8Array | undefined
  isLoadingTemplate: boolean
  templateFailed: boolean
  values: TemplateValues
}

/**
 * O documento como vai sair, montado no navegador com os valores atuais da
 * tela: o mesmo preenchimento do download, desenhado página a página pelo
 * `docx-preview`. É uma aproximação — a paginação final é a do Word.
 */
export function DocumentPreview({
  hasTemplate,
  templateKey,
  templateBytes,
  isLoadingTemplate,
  templateFailed,
  values,
}: DocumentPreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const [result, setResult] = useState<RenderResult | null>(null)

  // Serializado: o objeto de valores é novo a cada render da tela, o texto
  // só muda quando algum valor muda.
  const debouncedValues = useDebounce(JSON.stringify(values), RENDER_DELAY_MS)
  const renderKey = templateKey ? `${templateKey}|${debouncedValues}` : null
  const rendering = !!templateBytes && !!renderKey && result?.key !== renderKey

  /** Reduz a página para caber na largura do painel (nunca amplia). */
  const fitToWidth = useCallback(() => {
    const scroll = scrollRef.current
    const pages = pagesRef.current
    const page = pages?.querySelector<HTMLElement>(`section.${PREVIEW_CLASS}`)
    if (!scroll || !pages || !page) return
    pages.style.setProperty('--preview-zoom', '1')
    const available = scroll.clientWidth - 32
    const zoom = Math.max(0.3, Math.min(1, available / page.offsetWidth))
    pages.style.setProperty('--preview-zoom', zoom.toFixed(3))
  }, [])

  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const observer = new ResizeObserver(() => fitToWidth())
    observer.observe(scroll)
    return () => observer.disconnect()
  }, [fitToWidth])

  useEffect(() => {
    const pages = pagesRef.current
    if (!templateBytes || !renderKey || !pages) return
    let cancelled = false

    async function render(target: HTMLDivElement, bytes: Uint8Array, key: string) {
      try {
        const [{ renderTemplate }, preview] = await Promise.all([
          import('../templates/docx'),
          import('docx-preview'),
        ])
        const filled = renderTemplate(bytes.slice(), JSON.parse(debouncedValues) as TemplateValues)
        const parsed = await preview.parseAsync(filled.bytes, PREVIEW_OPTIONS)
        const nodes = await preview.renderDocument(parsed, PREVIEW_OPTIONS)
        if (cancelled) return
        // Monta fora da tela e troca de uma vez: a prévia anterior fica
        // visível até a nova estar pronta, sem piscar.
        target.replaceChildren(...nodes)
        sanitizeLinks(target)
        highlightPlaceholders(target)
        fitToWidth()
        setResult({ key, pages: target.querySelectorAll(`section.${PREVIEW_CLASS}`).length })
      } catch (error) {
        if (cancelled) return
        console.error('[modelos] prévia falhou:', error)
        setResult({
          key,
          error: error instanceof Error && error.message ? error.message : 'erro desconhecido',
        })
      }
    }

    void render(pages, templateBytes, renderKey)
    return () => {
      cancelled = true
    }
  }, [templateBytes, renderKey, debouncedValues, fitToWidth])

  const failed = result && 'error' in result && result.key === renderKey ? result.error : null
  const pageCount = result && 'pages' in result ? result.pages : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          'flex shrink-0 items-center gap-2 border-b px-4 py-2 text-xs',
          'text-muted-foreground',
        )}
      >
        <span className="font-medium text-foreground">Prévia</span>
        {pageCount !== null && !failed && (
          <span>
            · {pageCount} {pageCount === 1 ? 'página' : 'páginas'} (aproximado — a paginação
            final é a do Word)
          </span>
        )}
        {rendering && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" />}
      </div>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
        {!hasTemplate && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">Escolha um modelo para ver a prévia.</p>
          </div>
        )}
        {hasTemplate && isLoadingTemplate && (
          <div className="mx-auto max-w-xl space-y-3 p-8">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        )}
        {hasTemplate && (templateFailed || failed) && (
          <p className="m-4 flex gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {templateFailed
              ? 'Não foi possível baixar o arquivo do modelo.'
              : `Não foi possível montar a prévia: ${failed}`}
          </p>
        )}
        <div
          ref={pagesRef}
          className={cn(
            '[zoom:var(--preview-zoom,1)]',
            // O fundo cinza e as margens do docx-preview dão lugar ao painel.
            // Literais de propósito: o Tailwind só gera classe que lê inteira
            // no código — por isso não usam PREVIEW_CLASS. Com `!`: o estilo
            // injetado pela biblioteca fica fora de @layer e ganharia de
            // qualquer utilitário do Tailwind, que fica dentro de uma.
            '[&_.advtool-docx-wrapper]:bg-transparent! [&_.advtool-docx-wrapper]:p-4!',
            '[&_section.advtool-docx]:mb-4! [&_section.advtool-docx]:shadow-md!',
            '[&_mark]:rounded-sm [&_mark]:bg-warning/40 [&_mark]:px-0.5 [&_mark]:text-inherit',
            (!hasTemplate || templateFailed || failed) && 'hidden',
          )}
        />
      </div>
    </div>
  )
}
