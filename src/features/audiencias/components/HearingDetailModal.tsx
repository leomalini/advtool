'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowUpRight,
  Ban,
  CalendarClock,
  CircleCheck,
  ClipboardList,
  History,
  MapPin,
  RotateCcw,
  ScanText,
  Sparkles,
  Users,
  Video,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
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
import { HearingChecklist } from './HearingChecklist'
import { HearingDetailsForm } from './HearingDetailsForm'
import { HearingScheduleForm } from './HearingScheduleForm'
import { PREPARE_HEARING_PROMPT } from '@/features/ia/context/quickActions'
import { buildScreenContext } from '@/features/ia/context/screenContext'
import { useAssistantPanelStore } from '@/features/ia/stores/assistantPanel.store'

interface HearingDetailModalProps {
  hearingId: string | null
  onClose: () => void
  /** Falso quando a ficha abre de dentro do próprio processo. */
  showProcessLink?: boolean
}

/** Largura e altura do modal: duas colunas no desktop, uma no celular. O
 * corpo rola; cabeçalho e rodapé ficam. */
const MODAL_CLASSES = 'flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl'

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
    <section className="space-y-2 py-4">
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

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      onClick={onClose}
      aria-label="Fechar"
      className="absolute top-3.5 right-4 text-muted-foreground"
    >
      <X />
    </Button>
  )
}

/**
 * A ficha da audiência, em modal: aberta da Pauta, do Quadro, da lista "Sem
 * data", da aba do processo e da Agenda (`/audiencias?ficha=<id>`). Busca pelo
 * id, e não recebe a linha da lista: o link da Agenda chega sem lista nenhuma.
 */
export function HearingDetailModal({ hearingId, onClose, showProcessLink = true }: HearingDetailModalProps) {
  const { data: hearing, isLoading, isError } = useHearing(hearingId)

  return (
    <Dialog open={!!hearingId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className={MODAL_CLASSES}>
        {isLoading && (
          <div className="relative px-6 pt-5 pb-6">
            <DialogTitle>Carregando audiência…</DialogTitle>
            <DialogDescription className="sr-only">Buscando os dados da audiência</DialogDescription>
            <CloseButton onClose={onClose} />
            <div className="mt-4 space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/40" />
              ))}
            </div>
          </div>
        )}

        {!isLoading && (isError || !hearing) && (
          <div className="relative space-y-1 px-6 pt-5 pb-6">
            <DialogTitle>Audiência não encontrada</DialogTitle>
            <DialogDescription>
              {isError
                ? 'Não foi possível carregar a audiência. Tente de novo.'
                : 'Ela pode ter sido excluída junto com o compromisso na Agenda.'}
            </DialogDescription>
            <CloseButton onClose={onClose} />
          </div>
        )}

        {hearing && (
          <HearingDetailBody hearing={hearing} onClose={onClose} showProcessLink={showProcessLink} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function HearingDetailBody({
  hearing,
  onClose,
  showProcessLink,
}: {
  hearing: HearingDetail
  onClose: () => void
  showProcessLink: boolean
}) {
  const { can } = usePermissions()
  const { data: kinds = [] } = useHearingKinds()
  const confirmDate = useConfirmHearingDate()
  const updateDetails = useUpdateHearingDetails()
  const schedule = useScheduleHearing()
  const setCancelled = useSetHearingCancelled()

  const [rescheduling, setRescheduling] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const canUpdate = can('agenda', 'update')
  const pathname = usePathname()
  const askAssistant = useAssistantPanelStore((state) => state.askAssistant)

  // O modal trava o resto da tela, o painel inclusive: o botão fecha a ficha
  // e manda o pedido com a audiência (e o processo) como contexto.
  function prepareWithAssistant() {
    const context = buildScreenContext(pathname, [
      {
        entities: [
          {
            kind: 'audiencia',
            id: hearing.id,
            label: [
              hearingKindLabel(hearing),
              hearing.event ? formatHearingDateTime(hearing.event.start_at) : 'sem data',
            ].join(' · '),
          },
          ...(hearing.legal_process
            ? [
                {
                  kind: 'processo' as const,
                  id: hearing.legal_process.id,
                  label: hearing.legal_process.cnj_number ?? '',
                },
              ]
            : []),
        ],
      },
    ])
    askAssistant(PREPARE_HEARING_PROMPT, context)
    onClose()
  }
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
  const showFooter = canUpdate && (open || hearing.status === 'cancelada')

  function handleSchedule(range: { startAt: string; endAt: string }) {
    schedule.mutate({ id: hearing.id, ...range }, { onSuccess: () => setRescheduling(false) })
  }

  function handleCancelToggle() {
    setCancelled.mutate(
      { id: hearing.id, cancelled: open, withoutDate },
      { onSuccess: () => setConfirmCancel(false) },
    )
  }

  return (
    <>
      {/* ── Cabeçalho ── */}
      <div className="relative shrink-0 border-b px-6 pt-5 pb-4">
        {/* A mesma cor das audiências no dashboard (chart-2). */}
        <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-chart-2" />
        <CloseButton onClose={onClose} />

        <div className="flex flex-wrap items-end justify-between gap-3 pr-10">
          <div className="min-w-0 space-y-1">
            <DialogTitle className="text-[17px] leading-snug font-semibold">{hearingKindLabel(hearing)}</DialogTitle>
            <DialogDescription className="first-letter:uppercase">
              {event ? formatHearingLong(event.start_at) : 'Sem data'}
            </DialogDescription>
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

          <div className="flex flex-wrap gap-2">
            {open && can('ia', 'view') && (
              <Button size="sm" variant="outline" onClick={prepareWithAssistant}>
                <Sparkles aria-hidden />
                Preparar com o Assistente
              </Button>
            )}
            {hearing.meeting_url && open && hearing.modality !== 'presencial' && (
              <Button asChild size="sm" variant="outline">
                <a href={hearing.meeting_url} target="_blank" rel="noopener noreferrer">
                  <Video aria-hidden />
                  Entrar na sala
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Corpo: o que se faz à esquerda, o que se consulta à direita ── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid md:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="divide-y px-6">
            {(unconfirmed || withoutDate) && (
              <div className="py-4">
                <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/[0.06] p-3">
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
              </div>
            )}

            <Section title="Data" icon={<CalendarClock aria-hidden className="h-3 w-3" />}>
              {event && !rescheduling && (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium tabular-nums">{formatHearingDateTime(event.start_at)}</p>
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

              {hearing.date_confirmed_at && hearing.confirmed_by && open && (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <CircleCheck aria-hidden className="h-3 w-3 text-success" />
                  Conferida por {hearing.confirmed_by.full_name} em{' '}
                  {formatDateTime(hearing.date_confirmed_at)}
                </p>
              )}
            </Section>

            <Section title="Checklist" icon={<ClipboardList aria-hidden className="h-3 w-3" />}>
              <HearingChecklist hearing={hearing} canUpdate={canUpdate} />
            </Section>
          </div>

          <aside className="divide-y border-t bg-muted/20 px-6 md:border-t-0 md:border-l md:px-5">
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

            <Section title="Processo" icon={<MapPin aria-hidden className="h-3 w-3" />}>
              <div className="space-y-1 text-sm">
                <p className={cn(process.isCnj && 'font-mono text-xs')}>{process.label}</p>
                {client && <p className="text-xs text-muted-foreground">{client}</p>}
                {place && <p className="text-xs text-muted-foreground">{place}</p>}
                {event?.location && event.location !== place && (
                  <p className="text-xs text-muted-foreground">Local: {event.location}</p>
                )}
              </div>
              {hearing.legal_process_id && showProcessLink && (
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
                    <span key={profile.id} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                      {profile.full_name}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">Para trocar, edite o compromisso na Agenda.</p>
              </Section>
            )}

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
          </aside>
        </div>
      </div>

      {/* ── Rodapé ── */}
      {showFooter && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-muted/10 px-6 py-3">
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
            <Button size="sm" variant="outline" disabled={setCancelled.isPending} onClick={handleCancelToggle}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Reativar
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onClose}>
            Fechar
          </Button>
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
