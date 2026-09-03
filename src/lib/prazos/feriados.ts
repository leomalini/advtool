/**
 * Feriados nacionais brasileiros, fixos e móveis.
 *
 * Só os nacionais: feriado estadual e municipal, e dia sem expediente forense
 * decretado pelo tribunal, não têm fonte pública única e mudam por comarca.
 * `extraHolidays` no motor de prazos existe para isso — quem souber do feriado
 * local informa, em vez de o sistema fingir que sabe.
 */

/** 'yyyy-MM-dd' — o mesmo formato das colunas `date` do banco. */
export type IsoDate = string

/** Feriados fixos, por dia e mês. */
const FIXED_HOLIDAYS: { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: 'Confraternização Universal' },
  { month: 4, day: 21, name: 'Tiradentes' },
  { month: 5, day: 1, name: 'Dia do Trabalho' },
  { month: 9, day: 7, name: 'Independência' },
  { month: 10, day: 12, name: 'Nossa Senhora Aparecida' },
  { month: 11, day: 2, name: 'Finados' },
  { month: 11, day: 15, name: 'Proclamação da República' },
  { month: 12, day: 25, name: 'Natal' },
]

/** Consciência Negra virou feriado nacional pela Lei 14.759/2023 — antes disso
 * era só estadual/municipal, e contar como nacional erraria prazos antigos. */
const CONSCIENCIA_NEGRA_FROM_YEAR = 2024

/**
 * Domingo de Páscoa pelo algoritmo de Meeus/Butcher (calendário gregoriano).
 * Ancora Carnaval, Sexta-feira Santa e Corpus Christi.
 */
export function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1

  return new Date(Date.UTC(year, month - 1, day))
}

function toIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10)
}

function shiftDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}

/**
 * Todos os feriados nacionais do ano, indexados por data.
 *
 * O Carnaval e a Quarta-feira de Cinzas não são feriados nacionais na lei, mas
 * são dias sem expediente forense em todo o país (Resolução CNJ 244/2016), e o
 * que importa para prazo é o expediente — por isso entram.
 */
export function nationalHolidays(year: number): Map<IsoDate, string> {
  const holidays = new Map<IsoDate, string>()

  for (const { month, day, name } of FIXED_HOLIDAYS) {
    holidays.set(toIso(new Date(Date.UTC(year, month - 1, day))), name)
  }

  if (year >= CONSCIENCIA_NEGRA_FROM_YEAR) {
    holidays.set(toIso(new Date(Date.UTC(year, 10, 20))), 'Consciência Negra')
  }

  const easter = easterSunday(year)
  holidays.set(toIso(shiftDays(easter, -48)), 'Carnaval')
  holidays.set(toIso(shiftDays(easter, -47)), 'Carnaval')
  holidays.set(toIso(shiftDays(easter, -46)), 'Quarta-feira de Cinzas')
  holidays.set(toIso(shiftDays(easter, -2)), 'Sexta-feira da Paixão')
  holidays.set(toIso(shiftDays(easter, 60)), 'Corpus Christi')

  return holidays
}

/** Nome do feriado nacional na data, ou null. */
export function holidayName(iso: IsoDate): string | null {
  const year = Number(iso.slice(0, 4))
  if (!Number.isFinite(year)) return null
  return nationalHolidays(year).get(iso) ?? null
}
