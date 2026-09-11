"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLegalProcess } from "@/features/processos/hooks/useLegalProcesses";
import { getCrmItemClientName } from "@/types/crmItem.types";
import { Badge } from "@/components/ui/badge";
import {
  Pencil,
  Trash2,
  Clock,
  Gavel,
  AlignLeft,
  Users,
  MapPin,
  Star,
  AlertCircle,
  RefreshCw,
  History,
  CalendarClock,
  X,
} from "lucide-react";
import { resolveEventType } from "@/types/event.types";
import { useEventTypeMap } from "../hooks/useEventTypes";
import type { CalendarEvent } from "@/types/event.types";
import { formatDate, formatDateTime } from "@/utils/date";
import { RECURRENCE_SHORT_LABELS, type SeriesScope } from "@/lib/recurrence";
import { SeriesScopeDialog } from "@/components/shared/SeriesScopeDialog";
import { eventRangeLabel } from "../utils/daySpan";
import { useDeleteEvent, useUpdateEvent } from "../hooks/useEventMutations";
import { EventForm } from "./EventForm";
import { eventDocumentLinks, eventToFormValues } from "../services/events.service";
import { DocumentsTab } from "@/features/documentos/components/DocumentsTab";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { EventFormInput } from "@/schemas/event.schema";
import { Can } from '@/components/shared/Can'

interface EventDetailModalProps {
  event: CalendarEvent | null;
  open: boolean;
  onClose: () => void;
}

export function EventDetailModal({
  event,
  open,
  onClose,
}: EventDetailModalProps) {
  const [editing, setEditing] = useState(false);
  // Ocorrência de série: salvar e excluir passam antes pela pergunta do alcance.
  const [pendingUpdate, setPendingUpdate] = useState<{ data: EventFormInput; files: File[] } | null>(null);
  const [askDeleteScope, setAskDeleteScope] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteEvent = useDeleteEvent();
  const updateEvent = useUpdateEvent();
  const eventTypes = useEventTypeMap();
  const { data: linkedProcesso } = useLegalProcess(event?.legal_process_id ?? "");

  if (!event) return null;
  const inSeries = !!event.recurrence_series_id;

  async function runDelete(scope: SeriesScope) {
    await deleteEvent.mutateAsync({ id: event!.id, options: { current: event!, scope } });
    setAskDeleteScope(false);
    setConfirmDelete(false);
    onClose();
  }

  function handleDelete() {
    if (inSeries) setAskDeleteScope(true);
    else setConfirmDelete(true);
  }

  async function runUpdate(data: EventFormInput, files: File[], scope: SeriesScope) {
    await updateEvent.mutateAsync({
      input: { id: event!.id, ...data },
      options: { current: event!, scope },
      files,
    });
    setPendingUpdate(null);
    setEditing(false);
    onClose();
  }

  async function handleUpdate(data: EventFormInput, files: File[]) {
    if (inSeries) {
      setPendingUpdate({ data, files });
      return;
    }
    await runUpdate(data, files, "this");
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setEditing(false);
      onClose();
    }
  }

  const { color, label } = resolveEventType(eventTypes, event.type);
  const assignees =
    event.assignees?.length
      ? event.assignees
      : event.assignee
        ? [event.assignee]
        : [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[560px] p-0 gap-0 overflow-hidden"
      >
        {editing ? (
          /* Edit mode — EventForm handles its own layout */
          <EventForm
            onSubmit={handleUpdate}
            isLoading={updateEvent.isPending}
            defaultValues={eventToFormValues(event)}
            onCancel={() => setEditing(false)}
          />
        ) : (
          /* Detail view */
          <div className="flex flex-col max-h-[85vh]">
            {/* Header — type-color tinted, with top accent bar */}
            <div
              className="relative shrink-0 px-6 pt-5 pb-4 border-b transition-colors duration-200"
              style={{ backgroundColor: color + "0D" }}
            >
              <div
                className="absolute inset-x-0 top-0 h-[3px] rounded-t-xl"
                style={{ backgroundColor: color }}
              />

              {/* Close button */}
              <button
                type="button"
                onClick={onClose}
                className="absolute top-3.5 right-4 p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-black/5 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Type badge */}
              <span
                className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-white mb-2"
                style={{ backgroundColor: color }}
              >
                {label}
              </span>

              {/* Title — DialogTitle so Radix has an accessible name for the dialog */}
              <DialogTitle className="text-[17px] font-medium text-foreground leading-snug pr-8">
                {event.title}
              </DialogTitle>

              {/* Date summary */}
              <div className="flex items-center gap-1.5 mt-2.5 text-[12px] text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {/* Mesma leitura da grade: dia inteiro sem hora, vários dias
                    com as duas pontas. */}
                <span>{eventRangeLabel(event)}</span>
                {event.all_day && (
                  <span className="ml-1 text-[10px] bg-muted px-1.5 py-0.5 rounded">
                    dia inteiro
                  </span>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-4">
              {/* Fatal deadline */}
              {event.fatal_deadline && (
                <InfoRow
                  icon={
                    <CalendarClock className="h-4 w-4 text-destructive/70" />
                  }
                >
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50 mb-0.5">
                      Prazo fatal
                    </p>
                    <p className="text-sm font-medium">
                      {formatDateTime(event.fatal_deadline)}
                    </p>
                  </div>
                </InfoRow>
              )}

              {/* Linked processo */}
              {linkedProcesso && (
                <InfoRow icon={<Gavel className="h-4 w-4 text-muted-foreground/60" />}>
                  <Link
                    href={`/processos?id=${linkedProcesso.id}`}
                    className="group block"
                  >
                    <p className="text-sm group-hover:underline">
                      {getCrmItemClientName(linkedProcesso.crm_item)}
                    </p>
                    <p className="text-[11px] font-mono text-muted-foreground">
                      {linkedProcesso.cnj_number ?? 'Sem CNJ'}
                    </p>
                  </Link>
                </InfoRow>
              )}

              {/* Free-text process number — legacy only; the form now links a
                  real processo instead of storing a loose string. */}
              {event.process_number && (
                <InfoRow
                  icon={
                    <span className="text-[10px] font-mono font-bold text-muted-foreground/60">
                      Nº
                    </span>
                  }
                >
                  <p className="text-sm font-mono text-muted-foreground">
                    {event.process_number}
                  </p>
                </InfoRow>
              )}

              {/* Location */}
              {event.location && (
                <InfoRow
                  icon={<MapPin className="h-4 w-4 text-muted-foreground/60" />}
                >
                  <p className="text-sm">{event.location}</p>
                </InfoRow>
              )}

              {/* Description */}
              {event.description && (
                <InfoRow
                  icon={
                    <AlignLeft className="h-4 w-4 text-muted-foreground/60" />
                  }
                >
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {event.description}
                  </p>
                </InfoRow>
              )}

              {/* Assignees */}
              {assignees.length > 0 && (
                <InfoRow
                  icon={<Users className="h-4 w-4 text-muted-foreground/60" />}
                >
                  <div className="flex flex-wrap gap-1.5">
                    {assignees.map((a) => (
                      <span
                        key={a.id}
                        className="text-xs bg-muted rounded-full px-2.5 py-0.5 text-muted-foreground"
                      >
                        {a.full_name}
                      </span>
                    ))}
                  </div>
                </InfoRow>
              )}

              {/* Flags */}
              {(event.is_important ||
                event.is_urgent ||
                event.is_recurring ||
                event.is_retroactive) && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {event.is_important && (
                    <Badge
                      variant="outline"
                      className="text-warning border-warning/25 bg-warning/12 gap-1 text-[11px]"
                    >
                      <Star className="h-3 w-3" />
                      Importante
                    </Badge>
                  )}
                  {event.is_urgent && (
                    <Badge
                      variant="outline"
                      className="text-destructive border-destructive/25 bg-destructive/12 gap-1 text-[11px]"
                    >
                      <AlertCircle className="h-3 w-3" />
                      Urgente
                    </Badge>
                  )}
                  {event.is_recurring && (
                    <Badge
                      variant="outline"
                      className="text-chart-2 border-chart-2/25 bg-chart-2/12 gap-1 text-[11px]"
                    >
                      <RefreshCw className="h-3 w-3" />
                      {seriesLabel(event)}
                    </Badge>
                  )}
                  {event.is_retroactive && (
                    <Badge
                      variant="outline"
                      className="text-muted-foreground border-border bg-muted gap-1 text-[11px]"
                    >
                      <History className="h-3 w-3" />
                      Retroativa
                    </Badge>
                  )}
                </div>
              )}

              {/* Documentos — o evento não tinha onde anexar nem ver arquivos.
                  Lê só os deste evento; grava com os vínculos dele (processo,
                  cliente, card), para o arquivo aparecer no processo também. */}
              <Can resource="documentos" action="view">
                <div className="pt-2 border-t">
                  <DocumentsTab
                    compact
                    eventId={event.id}
                    {...lockedDocumentLinks(event)}
                    itemLabel="evento"
                  />
                </div>
              </Can>
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t px-6 py-3 flex items-center justify-between bg-muted/10">
              <Can resource="agenda" action="delete" fallback={<span />}>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteEvent.isPending}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm text-destructive hover:bg-destructive/8 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </button>
              </Can>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 h-8 px-4 rounded-md text-sm font-medium border border-input bg-background hover:bg-muted/50 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </button>
            </div>
          </div>
        )}
      </DialogContent>

      <SeriesScopeDialog
        open={!!pendingUpdate}
        onOpenChange={(v) => !v && setPendingUpdate(null)}
        action="edit"
        labels={EVENT_SCOPE_LABELS}
        hints={{
          this: "A repetição não muda — só este evento é alterado.",
          all: "Mudar a repetição ou a data refaz a série inteira.",
        }}
        isLoading={updateEvent.isPending}
        onConfirm={(scope) =>
          pendingUpdate && runUpdate(pendingUpdate.data, pendingUpdate.files, scope)
        }
      />
      <SeriesScopeDialog
        open={askDeleteScope}
        onOpenChange={setAskDeleteScope}
        action="delete"
        labels={EVENT_SCOPE_LABELS}
        hints={{ all: DELETE_DOCUMENTS_NOTICE, following: DELETE_DOCUMENTS_NOTICE }}
        isLoading={deleteEvent.isPending}
        onConfirm={runDelete}
      />
      {/* No lugar do confirm() nativo, que não dizia o que acontece com os anexos. */}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir evento"
        description={`"${event.title}" será removido. ${DELETE_DOCUMENTS_NOTICE}`}
        isLoading={deleteEvent.isPending}
        onConfirm={() => runDelete("this")}
      />
    </Dialog>
  );
}

// ── Helpers ─────────────────────────────────────────────────

/** Vínculos de upload no formato de props da DocumentsTab. */
function lockedDocumentLinks(event: CalendarEvent) {
  const links = eventDocumentLinks(event);
  return {
    lockedEventId: links.event_id,
    lockedLegalProcessId: links.legal_process_id || null,
    lockedClientId: links.client_id || null,
    lockedCrmItemId: links.crm_item_id || null,
  };
}

/** Ver deleteEventOnlyDocuments: só sai o anexo que não tem outro dono. */
const DELETE_DOCUMENTS_NOTICE =
  "Documentos anexados só ao evento também são excluídos; os que também são do processo ou do cliente continuam lá.";

const EVENT_SCOPE_LABELS: Record<SeriesScope, string> = {
  this: "Este evento",
  following: "Este e os eventos seguintes",
  all: "Todos os eventos",
};

/** "Semanal · até 15/12/2026" — ou só "Recorrente" na flag antiga, sem série. */
function seriesLabel(event: CalendarEvent): string {
  if (!event.recurrence_series_id || !event.recurrence_type) return "Recorrente";
  const base = RECURRENCE_SHORT_LABELS[event.recurrence_type];
  if (event.recurrence_until) return `${base} · até ${formatDate(event.recurrence_until)}`;
  if (event.recurrence_count) return `${base} · ${event.recurrence_count}×`;
  return base;
}

function InfoRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0 w-5 flex justify-center">{icon}</div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
