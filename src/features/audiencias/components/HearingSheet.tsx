'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowUpRight,
  Ban,
  CalendarClock,
  CircleCheck,
  History,
  MapPin,
  RotateCcw,
  ScanText,
  Users,
  Video,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { usePermissions } from '@/hooks/usePermissions'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/utils/date'
import {
  HEARING_STATUS_LABELS,
  isHearingDateUnconfirmed,
  isOpenHearing,
  type HearingDateChange,
  type HearingDetail,
} from '@/types/hearing.types'
import {
  useConfirmHearingDate,
  useHearing,
  useHearingKinds,
  useScheduleHearing,
  useSetHearingCancelled,
  useUpdateHearingDetails,
} from '../hooks/useHearings'
import {
  formatActDay,
  formatHearingDateTime,
  formatHearingLong,
  hearingClientName,
  hearingKindLabel,
  hearingMovementText,
  hearingPlace,
  hearingProcessLabel,
  hearingTimeRange,
} from '../utils/display'
import { HearingDetailsForm } from './HearingDetailsForm'
import { HearingScheduleForm } from './HearingScheduleForm'

interface HearingSheetProps {
  hearingId: string | null
  onClose: () => void
}

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2 border-t px-4 py-4">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

function changeAuthor(change: HearingDateChange): string {
  if (change.author) return change.author.full_name
  if (change.movement) return `andamento de ${formatActDay(change.movement.movement_date)}`
  return 'sem autor registrado'
}

/**
 * A ficha da audiência, aberta da Pauta, da lista "Sem data" e da Agenda
 * (`/audiencias?ficha=<id>`). Busca pelo id, e não recebe a linha da lista:
 * o link da Agenda chega sem lista nenhuma.
 */
export function HearingSheet({ hearingId, onClose }: HearingSheetProps) {
  const { data: hearing, isLoading, isError } = useHearing(hearingId)

  return (
    <Sheet open={!!hearingId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 sm:max-w-md">
        {isLoading && (
          <>
            <SheetHeader className="border-b">
              <SheetTitle>Carregando audiência…</SheetTitle>
              <SheetDescription className="sr-only">Buscando os dados da audiência</SheetDescription>
            </SheetHeader>
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/40" />
              ))}
            </div>
          </>
        )}

        {!isLoading && (isError || !hearing) && (
          <SheetHeader className="border-b">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <SheetTitle>Audiência não encontrada</SheetTitle>
                <SheetDescription>
                  {isError
                    ? 'Não foi possível carregar a audiência. Tente de novo.'
                    : 'Ela pode ter sido excluída junto com o compromisso na Agenda.'}
                </SheetDescription>
              </div>
              <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Fechar">
                <X />
              </Button>
            </div>
          </SheetHeader>
        )}

        {hearing && <HearingSheetBody hearing={hearing} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

function HearingSheetBody({ hearing, onClose }: { hearing: HearingDetail; onClose: () => void }) {
  const { can } = usePermissions()
  const { data: kinds = [] } = useHearingKinds()
  const confirmDate = useConfirmHearingDate()
  const updateDetails = useUpdateHearingDetails()
  const schedule = useScheduleHearing()
  const setCancelled = useSetHearingCancelled()

  const [rescheduling, setRescheduling] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const canUpdate = can('agenda', 'update')
  // Sem data, informar a data CRIA o compromisso na Agenda.
  const canSchedule = canUpdate && (hearing.event !== null || can('agenda', 'create'))

  const event = hearing.event
  const open = isOpenHearing(hearing.status)
  const withoutDate = hearing.status === 'a_designar'
  const unconfirmed = isHearingDateUnconfirmed(hearing)
  const process = hearingProcessLabel(hearing)
  const client = hearingClientName(hearing)
  const place = hearingPlace(hearing)
  const act = hearingMovementText(hearing)
  const kind = kinds.find((candidate) => candidate.id === hearing.kind_id)
  const durationMinutes = kind?.default_duration_minutes ?? 60

  function handleSchedule(range: { startAt: string; endAt: string }) {
    schedule.mutate(
      { id: hearing.id, ...range },
      { onSuccess: () => setRescheduling(false) },
    )
  }

  function handleCancelToggle() {
    setCancelled.mutate(
      { id: hearing.id, cancelled: open, withoutDate },
      { onSuccess: () => setConfirmCancel(false) },
    )
  }

  return (
    <>
      <SheetHeader className="border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <SheetTitle className="text-base">{hearingKindLabel(hearing)}</SheetTitle>
            <SheetDescription className="first-letter:uppercase">
              {event ? formatHearingLong(event.start_at) : 'Sem data'}
            </SheetDescription>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  hearing.status === 'cancelada' && 'bg-muted text-muted-foreground',
                  hearing.status === 'a_designar' && 'bg-warning/12 text-warning',
                  hearing.status === 'designada' && 'bg-info/12 text-info',
                )}
              >
                {HEARING_STATUS_LABELS[hearing.status]}
              </span>
              {unconfirmed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/12 px-2 py-0.5 text-[10px] font-semibold text-warning">
                  <ScanText aria-hidden className="h-2.5 w-2.5" />
                  Data a confirmar
                </span>
              )}
            </div>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Fechar">
            <X />
          </Button>
        </div>

        {hearing.meeting_url && open && hearing.modality !== 'presencial' && (
          <Button asChild size="sm" variant="outline" className="mt-2 w-fit">
            <a href={hearing.meeting_url} target="_blank" rel="noopener noreferrer">
              <Video aria-hidden />
              Entrar na sala
            </a>
          </Button>
        )}
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ── De onde veio a data ── */}
        {(unconfirmed || withoutDate) && (
          <div className="m-4 space-y-2 rounded-lg border border-warning/30 bg-warning/[0.06] p-3">
            <p className="text-xs leading-relaxed">
              {withoutDate
                ? 'Designada no andamento, mas o texto não trouxe data e hora.'
                : 'A data foi lida do texto do andamento e ainda não foi conferida nos autos.'}
            </p>
            {act && hearing.movement && (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Andamento de {formatActDay(hearing.movement.movement_date)}: “{act}”
              </p>
            )}
            {unconfirmed && canUpdate && (
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={confirmDate.isPending}
                onClick={() => confirmDate.mutate(hearing.id)}
              >
                <CircleCheck className="mr-1 h-3 w-3" />
                Conferi nos autos
              </Button>
            )}
          </div>
        )}

        {hearing.date_confirmed_at && hearing.confirmed_by && open && (
          <p className="mx-4 mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CircleCheck aria-hidden className="h-3 w-3 text-success" />
            Data conferida por {hearing.confirmed_by.full_name} em{' '}
            {formatDateTime(hearing.date_confirmed_at)}
          </p>
        )}

        {/* ── Data ── */}
        <Section title="Data" icon={<CalendarClock aria-hidden className="h-3 w-3" />}>
          {event && !rescheduling && (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium tabular-nums">
                  {formatHearingDateTime(event.start_at)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {hearingTimeRange(event.start_at, event.end_at, event.all_day)}
                  {!event.show_in_agenda && ' · fora da Agenda'}
                </p>
              </div>
              {open && canSchedule && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setRescheduling(true)}>
                  Alterar data
                </Button>
              )}
            </div>
          )}

          {open && canSchedule && (withoutDate || rescheduling) && (
            <HearingScheduleForm
              key={`${hearing.id}-${event?.start_at ?? 'none'}`}
              current={event ? { start_at: event.start_at, end_at: event.end_at } : null}
              defaultDurationMinutes={durationMinutes}
              submitLabel={withoutDate ? 'Agendar' : 'Salvar nova data'}
              isPending={schedule.isPending}
              onSubmit={handleSchedule}
              onCancel={rescheduling ? () => setRescheduling(false) : undefined}
            />
          )}

          {withoutDate && !canSchedule && (
            <p className="text-xs text-muted-foreground">Sem data. Seu perfil não pode agendar.</p>
          )}
        </Section>

        {/* ── Detalhes ── */}
        <Section title="Detalhes" icon={<ScanText aria-hidden className="h-3 w-3" />}>
          <HearingDetailsForm
            key={`${hearing.id}-${hearing.updated_at}`}
            initial={{
              kind_id: hearing.kind_id,
              modality: hearing.modality,
              meeting_url: hearing.meeting_url ?? '',
            }}
            kinds={kinds}
            canUpdate={canUpdate && open}
            isPending={updateDetails.isPending}
            onSubmit={(input) => updateDetails.mutate({ id: hearing.id, input })}
          />
        </Section>

        {/* ── Processo ── */}
        <Section title="Processo" icon={<MapPin aria-hidden className="h-3 w-3" />}>
          <div className="space-y-1 text-sm">
            <p className={cn(process.isCnj && 'font-mono text-xs')}>{process.label}</p>
            {client && <p className="text-xs text-muted-foreground">{client}</p>}
            {place && <p className="text-xs text-muted-foreground">{place}</p>}
            {event?.location && event.location !== place && (
              <p className="text-xs text-muted-foreground">Local: {event.location}</p>
            )}
          </div>
          {hearing.legal_process_id && (
            <Button asChild size="sm" variant="outline" className="h-7 text-xs">
              <Link href={`/processos/${hearing.legal_process_id}`}>
                <ArrowUpRight className="mr-1 h-3 w-3" />
                Abrir processo
              </Link>
            </Button>
          )}
        </Section>

        {event && event.assignees.length > 0 && (
          <Section title="Responsáveis" icon={<Users aria-hidden className="h-3 w-3" />}>
            <div className="flex flex-wrap gap-1.5">
              {event.assignees.map((profile) => (
                <span
                  key={profile.id}
                  className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                >
                  {profile.full_name}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Para trocar, edite o compromisso na Agenda.
            </p>
          </Section>
        )}

        {/* ── Histórico ── */}
        {hearing.date_changes.length > 0 && (
          <Section title="Histórico de datas" icon={<History aria-hidden className="h-3 w-3" />}>
            <ol className="space-y-2">
              {hearing.date_changes.map((change) => (
                <li key={change.id} className="text-xs">
                  <p className="tabular-nums">
                    {change.from_start_at ? (
                      <>
                        <span className="text-muted-foreground line-through">
                          {formatHearingDateTime(change.from_start_at)}
                        </span>{' '}
                        → {formatHearingDateTime(change.to_start_at)}
                      </>
                    ) : (
                      <>Designada para {formatHearingDateTime(change.to_start_at)}</>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{changeAuthor(change)}</p>
                </li>
              ))}
            </ol>
          </Section>
        )}
      </div>

      {canUpdate && (open || hearing.status === 'cancelada') && (
        <div className="flex shrink-0 justify-between gap-2 border-t bg-muted/10 px-4 py-3">
          {open ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/8 hover:text-destructive"
              onClick={() => setConfirmCancel(true)}
            >
              <Ban className="mr-1 h-3.5 w-3.5" />
              {withoutDate ? 'Descartar' : 'Cancelar audiência'}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={setCancelled.isPending}
              onClick={handleCancelToggle}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Reativar
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={withoutDate ? 'Descartar audiência sem data' : 'Cancelar audiência'}
        description={
          withoutDate
            ? 'Use quando não há audiência nova — por exemplo, o andamento repete uma audiência que já está na pauta. A ficha sai da lista "Sem data" e o mesmo ato não a recria.'
            : 'O compromisso sai da Agenda, mas continua aqui e no processo, com a data e o histórico. Dá para reativar depois.'
        }
        confirmLabel={withoutDate ? 'Descartar' : 'Cancelar audiência'}
        cancelLabel="Voltar"
        loadingLabel="Salvando…"
        isLoading={setCancelled.isPending}
        onConfirm={handleCancelToggle}
      />
    </>
  )
}
