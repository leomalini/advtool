import { format, parseISO } from 'date-fns'

/**
 * Conversão entre o relógio de parede do formulário e o instante gravado.
 *
 * As colunas `start_at`/`end_at`/`fatal_deadline` são `timestamptz`. Enviar
 * `"2026-08-13T09:00:00"` — sem fuso — fazia o Postgres interpretar a string na
 * timezone da sessão, que é UTC: 9h digitadas viravam 09:00Z, ou seja 06:00 no
 * horário de Brasília.
 *
 * O erro passava despercebido porque as duas pontas liam diferente: o
 * formulário fatiava a string (`slice(11,16)` → "09:00", parecia certo) e o
 * calendário convertia de verdade (`parseISO().getHours()` → 6). Daí os
 * "3 horas a menos" só na grade.
 *
 * A regra agora é uma só: **grava instante, lê local**. Tudo aqui trabalha na
 * timezone do navegador, que é a do escritório.
 */

/** Data (yyyy-MM-dd) + hora (HH:mm) do formulário → instante ISO em UTC. */
export function toInstant(date: string, time?: string): string {
  const [hours, minutes] = (time?.trim() || '00:00').split(':').map(Number)
  const [year, month, day] = date.split('-').map(Number)

  // O construtor com componentes interpreta na timezone local — que é
  // exatamente o que "9h" significa para quem digitou.
  return new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0).toISOString()
}

/** Instante ISO → data local no formato dos campos de formulário. */
export function toLocalDateInput(iso: string): string {
  return format(parseISO(iso), 'yyyy-MM-dd')
}

/** Instante ISO → hora local no formato dos campos de formulário. */
export function toLocalTimeInput(iso: string): string {
  return format(parseISO(iso), 'HH:mm')
}

/** Chave de agrupamento por dia, na timezone local. Usar `slice(0, 10)` aqui
 * agruparia pelo dia UTC, jogando um evento das 21h para o dia seguinte. */
export function localDayKey(iso: string): string {
  return format(parseISO(iso), 'yyyy-MM-dd')
}
