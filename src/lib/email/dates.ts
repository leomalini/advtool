/**
 * Dias e horários dos e-mails, sempre no fuso do escritório. A Vercel roda em
 * UTC: às 22h de Brasília o servidor já está no dia seguinte, e um "vence
 * amanhã" contado em UTC erraria por um dia toda noite.
 */

export const OFFICE_TIME_ZONE = 'America/Sao_Paulo'

const DAY_MS = 24 * 60 * 60 * 1000

/** 'AAAA-MM-DD' de Brasília para um instante. */
export function brazilDay(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: OFFICE_TIME_ZONE }).format(instant)
}

/**
 * Um DIA guardado como texto ('AAAA-MM-DD…') em 'dd/MM/yyyy'. Só o começo da
 * string: serve a `date` (`financial_entries.due_date`) e a dia gravado como
 * meia-noite UTC em `timestamptz` (`legal_process_movements.movement_date`,
 * migration 72) — converter o instante para Brasília cairia no dia anterior.
 */
export function formatStoredDay(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

/** Um instante de verdade (`timestamptz`) em 'dd/MM/yyyy', no dia de Brasília. */
export function formatInstantDay(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: OFFICE_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

/** 'HH:mm' de Brasília para um instante. */
export function formatInstantTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: OFFICE_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

/** Quantos dias de `from` até `to`, os dois 'AAAA-MM-DD'. Negativo = `to` já passou. */
export function daysBetween(from: string, to: string): number {
  const parse = (day: string) => {
    const [year, month, date] = day.slice(0, 10).split('-').map(Number)
    return Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1)
  }
  return Math.round((parse(to) - parse(from)) / DAY_MS)
}
