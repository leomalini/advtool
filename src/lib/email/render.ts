// Server-side. Template React Email → o HTML e o texto que vão no envio.
import type { ReactElement } from 'react'
import { render } from '@react-email/render'

export interface RenderedEmail {
  html: string
  /** A versão em texto puro: leitores que não abrem HTML, e o que filtros de
   * spam comparam com o HTML. */
  text: string
}

/** As duas versões saem do mesmo elemento, então nunca divergem no conteúdo. */
export async function renderEmail(element: ReactElement): Promise<RenderedEmail> {
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ])
  return { html, text }
}
