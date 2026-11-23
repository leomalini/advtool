/**
 * Datas no fuso do escritório. A Vercel roda em UTC: um clique às 22h de
 * Brasília cairia no dia seguinte sem isto.
 *
 * Brasília não tem horário de verão desde 2019, então o deslocamento é fixo em
 * -03:00 — é o que permite escrever a validade do link como texto ISO.
 */

const OFFICE_TIME_ZONE = 'America/Sao_Paulo'
const OFFICE_UTC_OFFSET = '-03:00'

/** 'yyyy-MM-dd' do instante, em Brasília. */
export function officeDateOf(moment: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: OFFICE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(moment)
}

/** 'yyyy-MM-dd' + `days`, sem passar por fuso. */
export function addDaysISO(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/**
 * A validade de um link gerado em `moment`: o fim do dia SEGUINTE, em Brasília.
 * Quem abre o checkout perto da meia-noite ainda tem um dia inteiro para pagar.
 *
 * `validUntil` vai para a InfinitePay (`options.valid_until`, ISO com o
 * deslocamento); `expiresAt` é o mesmo instante em UTC, para o banco.
 */
export function linkValidity(moment: Date): { validUntil: string; expiresAt: string } {
  const validUntil = `${addDaysISO(officeDateOf(moment), 1)}T23:59:59${OFFICE_UTC_OFFSET}`
  return { validUntil, expiresAt: new Date(validUntil).toISOString() }
}
