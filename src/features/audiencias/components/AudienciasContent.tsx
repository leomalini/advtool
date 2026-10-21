'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Landmark } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SegmentedControl, type SegmentedOption } from '@/features/dashboard/components/SegmentedControl'
import { localDayKey } from '@/features/agenda/utils/datetime'
import { useNow } from '@/hooks/useNow'
import { usePermissions } from '@/hooks/usePermissions'
import { useProfiles } from '@/hooks/useProfiles'
import { cn } from '@/lib/utils'
import { isHearingDateUnconfirmed, type HearingWithContext } from '@/types/hearing.types'
import {
  useHearingAgenda,
  useHearingKinds,
  useHearingsWithoutDate,
  useOpenHearings,
} from '../hooks/useHearings'
import { dayHeading, windowEnd } from '../utils/display'
import { HearingRow } from './HearingRow'
import { HearingDetailModal } from './HearingDetailModal'
import { HearingsBoard } from './HearingsBoard'
import { HearingsWithoutDate } from './HearingsWithoutDate'

type PautaWindow = '7' | '30' | '90'
type View = 'pauta' | 'quadro'

const VIEW_OPTIONS: readonly SegmentedOption<View>[] = [
  { value: 'pauta', label: 'Pauta' },
  { value: 'quadro', label: 'Quadro' },
]

const WINDOW_OPTIONS: readonly SegmentedOption<PautaWindow>[] = [
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
]

const ALL = '__all__'

/** O id da ficha vem da URL (o link da Agenda) — um valor torto viraria erro
 * do PostgREST na tela em vez de "não encontrada". */
const fichaIdSchema = z.string().uuid()

function groupByDay(hearings: HearingWithContext[]): [string, HearingWithContext[]][] {
  const groups = new Map<string, HearingWithContext[]>()
  for (const hearing of hearings) {
    if (!hearing.event) continue
    const key = localDayKey(hearing.event.start_at)
    const group = groups.get(key)
    if (group) group.push(hearing)
    else groups.set(key, [hearing])
  }
  return [...groups.entries()]
}

export function AudienciasContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { can, isLoading: loadingPermissions } = usePermissions()
  const now = useNow()

  // `?visao=quadro` abre direto no Quadro — o link que se manda a alguém.
  const [view, setView] = useState<View>(() => (searchParams.get('visao') === 'quadro' ? 'quadro' : 'pauta'))
  const [windowDays, setWindowDays] = useState<PautaWindow>('30')
  const [assigneeId, setAssigneeId] = useState<string | null>(null)
  const [kindId, setKindId] = useState<string | null>(null)
  const [includeCancelled, setIncludeCancelled] = useState(false)

  // A janela começa no início do dia de hoje: audiência das 9h continua na
  // pauta às 15h. Chave por dia, não por instante, senão o cache viraria a
  // cada minuto do `useNow`.
  const todayKey = localDayKey(now.toISOString())
  const { from, to } = useMemo(() => {
    const start = new Date(`${todayKey}T00:00:00`)
    return {
      from: start.toISOString(),
      to: windowEnd(start, Number(windowDays)).toISOString(),
    }
  }, [todayKey, windowDays])

  const agenda = useHearingAgenda(from, to, includeCancelled)
  const withoutDate = useHearingsWithoutDate()
  // O Quadro tem a sua consulta (sem janela de datas) e só busca quando aberto.
  const openHearings = useOpenHearings({ enabled: view === 'quadro' })
  const { data: kinds = [] } = useHearingKinds()
  const { data: profiles = [] } = useProfiles()

  const parsedFicha = fichaIdSchema.safeParse(searchParams.get('ficha'))
  const openId = parsedFicha.success ? parsedFicha.data : null

  /** A URL guarda a ficha aberta e a visão: recarregar a página, ou mandar o
   * link, volta ao mesmo lugar. */
  function urlFor(fichaId: string | null): string {
    const params = new URLSearchParams()
    if (view === 'quadro') params.set('visao', 'quadro')
    if (fichaId) params.set('ficha', fichaId)
    const query = params.toString()
    return query ? `${pathname}?${query}` : pathname
  }

  function openHearing(hearing: HearingWithContext) {
    router.replace(urlFor(hearing.id), { scroll: false })
  }

  function closeHearing() {
    router.replace(urlFor(null), { scroll: false })
  }

  // Responsável e tipo valem para as duas visões. Sem data não tem responsável
  // (não há compromisso), então não some pelo filtro de responsável.
  const matchesFilters = useMemo(
    () => (hearing: HearingWithContext) =>
      (!assigneeId ||
        !hearing.event ||
        hearing.event.assignees.some((profile) => profile.id === assigneeId)) &&
      (!kindId || hearing.kind_id === kindId),
    [assigneeId, kindId],
  )

  const visible = useMemo(() => (agenda.data ?? []).filter(matchesFilters), [agenda.data, matchesFilters])
  const boardRows = useMemo(
    () => (openHearings.data ?? []).filter(matchesFilters),
    [openHearings.data, matchesFilters],
  )

  const days = useMemo(() => groupByDay(visible), [visible])

  const unconfirmedCount = visible.filter(isHearingDateUnconfirmed).length
  const scheduledCount = visible.filter((hearing) => hearing.status === 'designada').length
  const withoutDateRows = withoutDate.data ?? []

  const canSchedule = can('agenda', 'update') && can('agenda', 'create') && !loadingPermissions
  const filtered = !!assigneeId || !!kindId
  const today = new Date(`${todayKey}T00:00:00`)
  const activeProfiles = profiles.filter((profile) => profile.is_active)

  return (
    <div className="-m-6 flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b bg-card px-6 py-3.5">
        <div>
          <h1 className="text-sm font-semibold text-foreground">Audiências</h1>
          <p className="text-xs text-muted-foreground">
            A pauta do escritório: o que está marcado, o que falta conferir e o que está sem data
          </p>
        </div>

        <dl className="flex items-center gap-4 text-xs">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-muted-foreground">Na pauta</dt>
            <dd className="font-semibold tabular-nums">{agenda.isSuccess ? scheduledCount : '—'}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-muted-foreground">A confirmar</dt>
            <dd className={cn('font-semibold tabular-nums', unconfirmedCount > 0 && 'text-warning')}>
              {agenda.isSuccess ? unconfirmedCount : '—'}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-muted-foreground">Sem data</dt>
            <dd className={cn('font-semibold tabular-nums', withoutDateRows.length > 0 && 'text-warning')}>
              {withoutDate.isSuccess ? withoutDateRows.length : '—'}
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-card px-6 py-2.5">
        <SegmentedControl label="Visão" options={VIEW_OPTIONS} value={view} onChange={setView} />

        {view === 'pauta' && (
          <SegmentedControl
            label="Período da pauta"
            options={WINDOW_OPTIONS}
            value={windowDays}
            onChange={setWindowDays}
          />
        )}

        <Select value={assigneeId ?? ALL} onValueChange={(value) => setAssigneeId(value === ALL ? null : value)}>
          <SelectTrigger className="h-9 w-[210px] text-sm">
            <SelectValue placeholder="Todos os responsáveis" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os responsáveis</SelectItem>
            {activeProfiles.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>
                {profile.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={kindId ?? ALL} onValueChange={(value) => setKindId(value === ALL ? null : value)}>
          <SelectTrigger className="h-9 w-[180px] text-sm">
            <SelectValue placeholder="Todos os tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os tipos</SelectItem>
            {kinds.map((kind) => (
              <SelectItem key={kind.id} value={kind.id}>
                {kind.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {view === 'pauta' && (
          <div className="flex items-center gap-2 pl-1">
            <Checkbox
              id="include-cancelled"
              checked={includeCancelled}
              onCheckedChange={(checked) => setIncludeCancelled(checked === true)}
            />
            <Label htmlFor="include-cancelled" className="text-xs font-normal text-muted-foreground">
              Mostrar canceladas
            </Label>
          </div>
        )}
      </div>

      {view === 'quadro' && (
        <div className="flex-1 overflow-y-auto pb-6">
          {openHearings.isError && (
            <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
              <Landmark className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Não foi possível carregar o quadro.</p>
              <Button size="sm" variant="outline" onClick={() => openHearings.refetch()}>
                Tentar de novo
              </Button>
            </div>
          )}
          {openHearings.isLoading && (
            <div className="grid grid-cols-5 gap-3 p-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-48 animate-pulse rounded-lg bg-muted/40" />
              ))}
            </div>
          )}
          {openHearings.isSuccess && <HearingsBoard hearings={boardRows} now={now} onOpen={openHearing} />}
        </div>
      )}

      {view === 'pauta' && (
        <div className="flex-1 overflow-y-auto pb-6">
          <HearingsWithoutDate hearings={withoutDateRows} onOpen={openHearing} canSchedule={canSchedule} />

          {agenda.isError && (
            <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
              <Landmark className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Não foi possível carregar a pauta.</p>
              <Button size="sm" variant="outline" onClick={() => agenda.refetch()}>
                Tentar de novo
              </Button>
            </div>
          )}

          {!agenda.isError && agenda.isLoading && (
            <div className="space-y-2 p-6">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/40" />
              ))}
            </div>
          )}

          {!agenda.isError && agenda.isSuccess && days.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
              <Landmark className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {filtered
                  ? 'Nenhuma audiência com esses filtros no período.'
                  : `Nenhuma audiência nos próximos ${windowDays} dias.`}
              </p>
              {filtered && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAssigneeId(null)
                    setKindId(null)
                  }}
                >
                  Limpar filtros
                </Button>
              )}
              {!filtered && (
                <p className="max-w-md text-xs text-muted-foreground">
                  As audiências entram sozinhas quando o andamento designa uma com data, ou quando
                  alguém cria um evento do tipo Audiência na Agenda.
                </p>
              )}
            </div>
          )}

          {!agenda.isError && days.length > 0 && (
            <div className={cn('space-y-4 px-4 pt-4', agenda.isFetching && 'opacity-60')}>
              {days.map(([dayKey, hearings]) => {
                const heading = dayHeading(dayKey, today)
                return (
                  <section key={dayKey} aria-label={heading.subtitle} className="overflow-hidden rounded-lg border">
                    <header className="flex items-baseline gap-2 border-b bg-muted/30 px-4 py-2">
                      <h2 className="text-sm font-semibold first-letter:uppercase">{heading.title}</h2>
                      <span className="text-xs text-muted-foreground first-letter:uppercase">
                        {heading.subtitle}
                      </span>
                      <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                        {hearings.length} audiênci{hearings.length === 1 ? 'a' : 'as'}
                      </span>
                    </header>
                    <ul className="divide-y divide-border">
                      {hearings.map((hearing) => (
                        <HearingRow key={hearing.id} hearing={hearing} now={now} onOpen={openHearing} />
                      ))}
                    </ul>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      )}

      <HearingDetailModal hearingId={openId} onClose={closeHearing} />
    </div>
  )
}
