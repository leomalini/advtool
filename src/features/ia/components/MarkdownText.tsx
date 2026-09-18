'use client'

import Link from 'next/link'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Elementos do Markdown com o tamanho de um balão de chat — o padrão do
 * navegador (h1 enorme, lista sem marcador, tabela sem borda) foi pensado
 * para página, não para uma resposta em `text-sm`.
 *
 * Títulos descem para h3/h4: a página já tem o próprio h1, e uma resposta
 * com vários "# Título" viraria vários h1 para o leitor de tela.
 */
const components: Components = {
  // `pre-line`: o modelo às vezes separa linhas com uma quebra simples
  // ("Cliente: X" / "Processo: Y"), que no Markdown vira espaço e junta
  // tudo numa linha só.
  p: ({ children }) => <p className="whitespace-pre-line leading-relaxed">{children}</p>,
  h1: ({ children }) => <h3 className="text-[15px] font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="text-[15px] font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="font-semibold">{children}</h4>,
  h4: ({ children }) => <h4 className="font-semibold">{children}</h4>,
  h5: ({ children }) => <h4 className="font-semibold">{children}</h4>,
  h6: ({ children }) => <h4 className="font-semibold">{children}</h4>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-border" />,
  code: ({ children }) => (
    <code className="rounded bg-background/70 px-1 py-0.5 font-mono text-[0.85em]">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-md bg-background/70 p-3 text-xs [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  // Tabela larga rola dentro do balão em vez de estourar a coluna do chat.
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-background/50 px-2 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-border px-2 py-1 align-top">{children}</td>,
  a: ({ href, children }) => {
    // O `defaultUrlTransform` esvazia protocolos perigosos (`javascript:`):
    // sem destino, fica só o texto.
    if (!href) return <span>{children}</span>
    const className = 'font-medium text-primary underline underline-offset-2'
    // Rota interna navega sem recarregar; externa abre em outra aba.
    if (href?.startsWith('/')) {
      return (
        <Link href={href} className={className}>
          {children}
        </Link>
      )
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    )
  },
}

interface MarkdownTextProps {
  text: string
}

/**
 * Texto da IA renderizado como Markdown (com tabelas e listas do GFM).
 *
 * `react-markdown` monta elementos React, sem `dangerouslySetInnerHTML`, e com
 * `skipHtml` descarta qualquer HTML cru que venha no texto — o conteúdo pode
 * repetir dados do banco, e nada disso deve virar marcação. Links passam pelo
 * `defaultUrlTransform`, que bloqueia `javascript:` e afins.
 */
export function MarkdownText({ text }: MarkdownTextProps) {
  return (
    <div className="space-y-2 break-words">
      <Markdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {text}
      </Markdown>
    </div>
  )
}
