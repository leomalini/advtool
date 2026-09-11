import { format, formatDistanceToNow, isToday, isTomorrow, isYesterday, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/** Coluna `date` (yyyy-MM-dd) não tem fuso: `new Date('2026-09-10')` a lê como
 * meia-noite UTC, que no Brasil ainda é o dia 9 — a data limite da tarefa
 * aparecia um dia antes. `parseISO` lê a data-só como meia-noite local. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function toDate(date: string | Date): Date {
  if (typeof date === 'string' && DATE_ONLY.test(date)) return parseISO(date)
  return new Date(date)
}

export function formatDate(date: string | Date): string {
  return format(toDate(date), 'dd/MM/yyyy', { locale: ptBR })
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
