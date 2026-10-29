import type { ProcessSummary, SummarySource } from './summarySchema'

/** O processo como `loadSummaryData` o lê — só o que entra no resumo. */
export interface SummaryProcessData {
  process: {
    cnj_number: string | null
    court: string | null
    court_division: string | null
    comarca: string | null
    procedural_class: string | null
    subject: string | null
    case_value: number | null
    filing_date: string | null
    status: string
    plaintiff: string | null
    defendant: string | null
    opposing_counsel: string | null
    parties: { name: string; polo: string; party_type: string | null; position: number }[]
  }
  movements: {
    id: string
    movement_date: string
    title: string | null
    description: string | null
  }[]
  publications: {
    id: string
    publication_date: string
    publication_type: string | null
    diario_name: string | null
    title: string | null
    content_text: string | null
    excerpt: string | null
  }[]
  hearings: {
    id: string
    status: string
    modality: string | null
    kind: { label: string } | null
    event: { start_at: string; all_day: boolean } | null
  }[]
  tasks: { id: string; title: string; status: string; due_date: string | null }[]
  events: { id: string; title: string; start_at: string; all_day: boolean }[]
}

const OFFICE_TIME_ZONE = 'America/Sao_Paulo'

const dayFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: OFFICE_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const dayTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: OFFICE_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Um DIA como está gravado. Colunas `date` chegam como `yyyy-MM-dd`, e
 * `movement_date` é o dia gravado numa coluna timestamptz, que volta como
 * meia-noite UTC (migration 72). Convertida em Brasília, qualquer uma cairia no
 * dia anterior — só se reordena o começo da string, como as telas internas.
 */
function formatStoredDay(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

/** Um instante de verdade (início de compromisso), no fuso do escritório. */
function formatInstant(value: string, allDay: boolean): string {
  const date = new Date(value)
  return allDay ? dayFormatter.format(date) : dayTimeFormatter.format(date)
}

const HEARING_STATUS_LABELS: Record<string, string> = {
  a_designar: 'a designar',
  designada: 'designada',
  realizada: 'realizada',
  nao_realizada: 'não realizada',
  cancelada: 'cancelada',
}

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * A mensagem ao modelo: o processo em texto compacto, cada item com uma
 * referência. Devolve também as fontes, para conferir o que o modelo citou e
 * para a tela levar de cada referência ao item.
 */
export function buildSummaryInput(
  data: SummaryProcessData,
  now: Date,
): { text: string; sources: SummarySource[] } {
  const sources: SummarySource[] = [
    { ref: 'CAPA', kind: 'capa', id: null, date: null, label: 'Capa do processo' },
  ]
  const { process } = data
  const lines: string[] = [`Hoje: ${dayFormatter.format(now)}.`, '', '## Capa [CAPA]']

  const cover: [string, string | null][] = [
    ['Número', process.cnj_number],
    ['Tribunal', process.court],
    ['Vara/órgão', process.court_division],
    ['Comarca', process.comarca],
    ['Classe', process.procedural_class],
    ['Assunto', process.subject],
    ['Valor da causa', process.case_value != null ? currency.format(Number(process.case_value)) : null],
    ['Distribuição', process.filing_date ? formatStoredDay(process.filing_date) : null],
    ['Situação no sistema do escritório', process.status],
    ['Advogado da parte contrária', process.opposing_counsel],
  ]
  for (const [label, value] of cover) if (value) lines.push(`- ${label}: ${value}`)

  const parties = [...process.parties].sort((a, b) => a.position - b.position)
  const partyList = (polo: string) =>
    parties
      .filter((party) => party.polo === polo)
      .map((party) => (party.party_type ? `${party.name} (${party.party_type})` : party.name))
      .join('; ')
  lines.push(`- Polo ativo: ${partyList('ativo') || process.plaintiff || '—'}`)
  lines.push(`- Polo passivo: ${partyList('passivo') || process.defendant || '—'}`)

  lines.push('', '## Movimentações (da mais antiga para a mais recente)')
  const movements = [...data.movements].sort((a, b) => a.movement_date.localeCompare(b.movement_date))
  movements.forEach((movement, index) => {
    const ref = `M${index + 1}`
    const date = formatStoredDay(movement.movement_date)
    const label = [movement.title, movement.description].filter(Boolean).join(' — ')
    sources.push({ ref, kind: 'movement', id: movement.id, date, label })
    lines.push(`[${ref}] ${date} — ${label}`)
  })
  if (movements.length === 0) lines.push('(nenhuma)')

  lines.push('', '## Publicações (texto integral)')
  const publications = [...data.publications].sort((a, b) =>
    a.publication_date.localeCompare(b.publication_date),
  )
  publications.forEach((publication, index) => {
    const ref = `P${index + 1}`
    const date = formatStoredDay(publication.publication_date)
    const heading = [publication.publication_type, publication.title, publication.diario_name]
      .filter(Boolean)
      .join(' — ')
    sources.push({ ref, kind: 'publication', id: publication.id, date, label: heading || 'Publicação' })
    lines.push(`[${ref}] ${date} — ${heading}`)
    lines.push((publication.content_text ?? publication.excerpt ?? '(sem texto)').trim(), '')
  })
  if (publications.length === 0) lines.push('(nenhuma)')

  lines.push('', '## Audiências')
  data.hearings.forEach((hearing, index) => {
    const ref = `A${index + 1}`
    const when = hearing.event ? formatInstant(hearing.event.start_at, hearing.event.all_day) : 'sem data'
    const label =
      `${hearing.kind?.label ?? 'Audiência'} — ${HEARING_STATUS_LABELS[hearing.status] ?? hearing.status}` +
      (hearing.modality ? `, ${hearing.modality}` : '')
    const date = hearing.event ? dayFormatter.format(new Date(hearing.event.start_at)) : null
    sources.push({ ref, kind: 'hearing', id: hearing.id, date, label })
    lines.push(`[${ref}] ${when} — ${label}`)
  })
  if (data.hearings.length === 0) lines.push('(nenhuma)')

  lines.push('', '## Tarefas do escritório')
  data.tasks.forEach((task, index) => {
    const ref = `T${index + 1}`
    const date = task.due_date ? formatStoredDay(task.due_date) : null
    sources.push({ ref, kind: 'task', id: task.id, date, label: task.title })
    lines.push(`[${ref}] ${date ?? 'sem prazo'} — ${task.title} (${task.status})`)
  })
  if (data.tasks.length === 0) lines.push('(nenhuma)')

  lines.push('', '## Compromissos na agenda')
  data.events.forEach((event, index) => {
    const ref = `E${index + 1}`
    const date = dayFormatter.format(new Date(event.start_at))
    sources.push({ ref, kind: 'event', id: event.id, date, label: event.title })
    lines.push(`[${ref}] ${formatInstant(event.start_at, event.all_day)} — ${event.title}`)
  })
  if (data.events.length === 0) lines.push('(nenhum)')

  return { text: lines.join('\n'), sources }
}

/**
 * Tira do resumo as referências que não existem na mensagem e aponta o que
 * merece um olho: fonte inexistente, afirmação sem fonte, data que não bate
 * com a do item citado. A tela não mostra referência que não leva a nada.
 */
export function cleanCitations(
  summary: ProcessSummary,
  sources: SummarySource[],
): { summary: ProcessSummary; problems: string[] } {
  const byRef = new Map(sources.map((source) => [source.ref, source]))
  const problems: string[] = []

  const keep = (where: string, refs: string[]) => {
    const known = refs.filter((ref) => byRef.has(ref))
    for (const ref of refs) if (!byRef.has(ref)) problems.push(`${where}: fonte inexistente ${ref}`)
    if (known.length === 0) problems.push(`${where}: sem fonte`)
    return known
  }
  const checkDate = (where: string, date: string | null, ref: string) => {
    const source = byRef.get(ref)
    if (date && source?.date && source.date !== date) {
      problems.push(`${where}: data ${date} ≠ ${source.date} de ${ref}`)
    }
  }

  checkDate('ultimo_ato', summary.ultimo_ato.data, summary.ultimo_ato.fonte)
  keep('ultimo_ato', [summary.ultimo_ato.fonte])
  summary.proximos_passos_registrados.forEach((step, index) => {
    checkDate(`proximo[${index + 1}]`, step.data, step.fonte)
    keep(`proximo[${index + 1}]`, [step.fonte])
  })

  return {
    summary: {
      ...summary,
      fase_atual: { ...summary.fase_atual, fontes: keep('fase_atual', summary.fase_atual.fontes) },
      resumo: summary.resumo.map((item, index) => ({
        ...item,
        fontes: keep(`resumo[${index + 1}]`, item.fontes),
      })),
      pontos_de_atencao: summary.pontos_de_atencao.map((item, index) => ({
        ...item,
        fontes: keep(`atencao[${index + 1}]`, item.fontes),
      })),
    },
    problems,
  }
}
