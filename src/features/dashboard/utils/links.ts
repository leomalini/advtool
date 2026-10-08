/** The processo form already open and filled with the CNJ — the consultation of
 * the cover fills the rest. Same link the publication page offers for an orphan. */
export function registerProcessHref(cnj: string): string {
  return `/processos?create=1&cnj=${encodeURIComponent(cnj)}`
}
