/**
 * Entrega um arquivo gerado no navegador como download, com o nome dado.
 *
 * A URL do objeto é revogada no tick seguinte, não na hora: alguns navegadores
 * só começam a ler o blob depois que o clique termina de ser processado.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Nome de arquivo seguro para Windows/macOS a partir de um texto livre. */
export function toSafeFileName(base: string, extension: string, fallback = 'documento'): string {
  const cleaned = base.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
  return `${cleaned || fallback}.${extension}`
}
