"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Pencil,
  Trash2,
  Clock,
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
import { EVENT_TYPE_COLORS, EVENT_TYPE_LABELS } from "@/types/event.types";
import type { CalendarEvent } from "@/types/event.types";
import { formatDateTime } from "@/utils/date";
import { useDeleteEvent, useUpdateEvent } from "../hooks/useEventMutations";
import { EventForm } from "./EventForm";
import { eventToFormValues } from "../services/events.service";
import type { EventFormInput } from "@/schemas/event.schema";

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
  const deleteEvent = useDeleteEvent();
  const updateEvent = useUpdateEvent();

  if (!event) return null;

  async function handleDelete() {
    if (!confirm("Tem certeza que deseja excluir este evento?")) return;
    await deleteEvent.mutateAsync(event!.id);
    onClose();
  }

  async function handleUpdate(data: EventFormInput) {
    await updateEvent.mutateAsync({ id: event!.id, ...data });
    setEditing(false);
    onClose();
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setEditing(false);
      onClose();
    }
  }

  const color = EVENT_TYPE_COLORS[event.type];
  const label = EVENT_TYPE_LABELS[event.type];
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
        className="sm:max-w-[500px] p-0 gap-0 overflow-hidden"
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

              {/* Title */}
              <p className="text-[17px] font-medium text-foreground leading-snug pr-8">
                {event.title}
              </p>

              {/* Date summary */}
              <div className="flex items-center gap-1.5 mt-2.5 text-[12px] text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>{formatDateTime(event.start_at)}</span>
                {event.start_at !== event.end_at && (
                  <span className="opacity-60">
                    → {formatDateTime(event.end_at)}
                  </span>
                )}
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

              {/* Process number */}
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
                      Recorrente
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
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t px-6 py-3 flex items-center justify-between bg-muted/10">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteEvent.isPending}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm text-destructive hover:bg-destructive/8 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Excluir
              </button>
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
    </Dialog>
  );
}

// ── Helpers ─────────────────────────────────────────────────

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
