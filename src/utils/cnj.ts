/** Masks a raw CNJ number as it's typed: NNNNNNN-DD.AAAA.J.TT.OOOO */
export function formatCnjNumber(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 20)
  if (d.length <= 7)  return d
  if (d.length <= 9)  return `${d.slice(0, 7)}-${d.slice(7)}`
  if (d.length <= 13) return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9)}`
  if (d.length <= 14) return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13)}`
  if (d.length <= 16) return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14)}`
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`
}
