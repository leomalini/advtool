import { format, formatDistanceToNow, isToday, isTomorrow, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'dd/MM/yyyy', { locale: ptBR })
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

export function formatTime(date: string | Date): string {
  return format(new Date(date), 'HH:mm', { locale: ptBR })
}

export function formatRelative(date: string | Date): string {
  const d = new Date(date)
  if (isToday(d)) return `hoje às ${formatTime(d)}`
  if (isYesterday(d)) return `ontem às ${formatTime(d)}`
  if (isTomorrow(d)) return `amanhã às ${formatTime(d)}`
  return formatDistanceToNow(d, { addSuffix: true, locale: ptBR })
}
