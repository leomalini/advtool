"use client";

import { useState } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useEvents } from "../hooks/useEvents";
import { useCreateEvent } from "../hooks/useEventMutations";
import { EventForm } from "./EventForm";
import { EventDetailModal } from "./EventDetailModal";
import { EVENT_TYPE_COLORS, EVENT_TYPE_LABELS } from "@/types/event.types";
import type { CalendarEvent } from "@/types/event.types";
import type { EventFormInput } from "@/schemas/event.schema";

export function AgendaContent() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const createEvent = useCreateEvent();

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const { data: events } = useEvents(
    format(calStart, "yyyy-MM-dd'T'00:00:00xxx"),
    format(calEnd, "yyyy-MM-dd'T'23:59:59xxx"),
  );

  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  function getEventsForDay(day: Date) {
    return events?.filter((e) => isSameDay(new Date(e.start_at), day)) ?? [];
  }

  function handleDayClick(day: Date) {
    setSelectedDate(day);
    setDialogOpen(true);
  }

  async function handleSubmit(data: EventFormInput) {
    await createEvent.mutateAsync(data);
    setDialogOpen(false);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-base font-semibold capitalize w-40 text-center">
            {format(currentDate, "MMMM yyyy", { locale: ptBR })}
          </h2>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentDate(new Date())}
          >
            Hoje
          </Button>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setSelectedDate(new Date());
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Novo Evento
        </Button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3">
        {Object.entries(EVENT_TYPE_LABELS).map(([type, label]) => (
          <div
            key={type}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <div
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor:
                  EVENT_TYPE_COLORS[type as keyof typeof EVENT_TYPE_COLORS],
              }}
            />
            {label}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="rounded-lg border overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {weekdays.map((day) => (
            <div
              key={day}
              className="p-2 text-center text-xs font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const dayEvents = getEventsForDay(day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={i}
                onClick={() => handleDayClick(day)}
                className={cn(
                  "min-h-[90px] p-1.5 border-b border-r cursor-pointer hover:bg-accent/30 transition-colors",
                  !isCurrentMonth && "bg-muted/20",
                  isToday && "bg-primary/5",
                )}
              >
                <div
                  className={cn(
                    "h-6 w-6 flex items-center justify-center rounded-full text-xs font-medium mb-1",
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : !isCurrentMonth
                        ? "text-muted-foreground"
                        : "text-foreground",
                  )}
                >
                  {format(day, "d")}
                </div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((event) => (
                    <div
                      key={event.id}
                      className="rounded px-1 py-0.5 text-xs truncate text-white cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: EVENT_TYPE_COLORS[event.type] }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEvent(event);
                      }}
                    >
                      {event.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <p className="text-xs text-muted-foreground">
                      +{dayEvents.length - 3} mais
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal: criar evento */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-[680px] p-0 gap-0 overflow-hidden"
        >
          <EventForm
            defaultDate={selectedDate ?? undefined}
            onSubmit={handleSubmit}
            isLoading={createEvent.isPending}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Modal: detalhes do evento */}
      <EventDetailModal
        event={selectedEvent}
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
}
