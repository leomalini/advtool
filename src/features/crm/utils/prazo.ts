export type PrazoTone = 'critical' | 'warning' | 'neutral'

export interface PrazoInfo {
  label: string
  tone: PrazoTone
}

export function formatPrazo(prazoStr: string): PrazoInfo {
  const prazo = new Date(prazoStr)
  const now = new Date()
  const diffMs = prazo.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return { label: `Vencido há ${Math.abs(diffDays)}d`, tone: 'critical' }
  if (diffDays === 0) return { label: 'Vence hoje', tone: 'critical' }
  if (diffDays <= 3) return { label: `${diffDays}d restantes`, tone: 'warning' }

  const date = prazo.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return { label: date, tone: 'neutral' }
}

export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffMinutes = Math.floor(diffMs / (1000 * 60))

  if (diffMinutes < 1) return 'agora'
  if (diffMinutes < 60) return `há ${diffMinutes}min`
  if (diffHours < 24) return `há ${diffHours}h`
  if (diffDays === 1) return 'ontem'
  if (diffDays < 30) return `há ${diffDays} dias`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths === 1) return 'há 1 mês'
  return `há ${diffMonths} meses`
}
