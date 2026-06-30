"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Paperclip,
  X,
  AlertCircle,
  Clock,
  Star,
  RefreshCw,
  CalendarClock,
  History,
  MapPin,
  AlignLeft,
  Check,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { eventFormSchema, type EventFormInput } from "@/schemas/event.schema";
import {
  EVENT_TYPE_LABELS,
  EVENT_TYPE_COLORS,
  RECURRENCE_TYPE_LABELS,
  type EventType,
} from "@/types/event.types";
import type { Profile } from "@/types/common.types";
import { useAuth } from "@/hooks/useAuth";
import { useProfiles } from "@/hooks/useProfiles";
import { useClientes } from "@/features/clientes/hooks/useClientes";
import { getClientDisplayName } from "@/types/cliente.types";

interface EventFormProps {
  defaultDate?: Date;
  defaultValues?: Partial<EventFormInput>;
  onSubmit: (data: EventFormInput) => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

const FLAG_CONFIG = [
  {
    field: "is_important" as const,
    label: "Importante",
    icon: Star,
    activeCls:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
  },
  {
    field: "is_urgent" as const,
    label: "Urgente",
    icon: AlertCircle,
    activeCls:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
  },
  {
    field: "is_future" as const,
    label: "Futura",
    icon: Clock,
    activeCls:
      "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800",
  },
  {
    field: "is_recurring" as const,
    label: "Recorrente",
    icon: RefreshCw,
    activeCls:
      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-800",
  },
  {
    field: "is_retroactive" as const,
    label: "Retroativa",
    icon: History,
    activeCls:
      "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  },
] as const;

export function EventForm({
  defaultDate,
  defaultValues,
  onSubmit,
  onCancel,
  isLoading,
}: EventFormProps) {
  const { user } = useAuth();
  const { data: profiles = [] } = useProfiles();
  const { data: clientes = [] } = useClientes();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const today = defaultDate
    ? format(defaultDate, "yyyy-MM-dd")
    : format(new Date(), "yyyy-MM-dd");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors },
  } = useForm<EventFormInput>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      type: "meeting",
      start_date: today,
      start_time: "09:00",
      show_in_agenda: true,
      all_day: false,
      inform_end: false,
      is_important: false,
      is_urgent: false,
      is_future: false,
      is_recurring: false,
      is_retroactive: false,
      assignee_ids: [],
      ...defaultValues,
    },
  });

  const watchType = watch("type");
  const informEnd = watch("inform_end");
  const allDay = watch("all_day");
  const isRecurring = watch("is_recurring");
  const isRetroactive = watch("is_retroactive");
  const assigneeIds = watch("assignee_ids");
  const typeColor = EVENT_TYPE_COLORS[watchType];
  const formTitle = defaultValues?.title ? "Editar Evento" : "Novo Evento";

  useEffect(() => {
    if (
      user?.id &&
      (!assigneeIds || assigneeIds.length === 0) &&
      !defaultValues?.assignee_ids
    ) {
      setValue("assignee_ids", [user.id]);
    }
  }, [user?.id, assigneeIds, defaultValues?.assignee_ids, setValue]);

  function toggleAssignee(profileId: string) {
    const current = assigneeIds ?? [];
    if (current.includes(profileId)) {
      if (current.length === 1) return; // at least one required
      setValue(
        "assignee_ids",
        current.filter((id) => id !== profileId),
      );
    } else {
      setValue("assignee_ids", [...current, profileId]);
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col max-h-[90vh]"
    >
      {/* ── Header ── */}
      <div className="relative shrink-0 px-8 pt-5 pb-4 border-b">
        {/* Thin type-color accent at top */}
        <div
          className="absolute inset-x-0 top-0 h-[3px] rounded-t-xl transition-colors duration-300"
          style={{ backgroundColor: typeColor }}
        />
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{formTitle}</h2>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="p-1.5 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/60 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Form body ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-8 py-6 space-y-6">

          {/* Título + Tipo — 2 cols */}
          <div className="grid grid-cols-[1fr_176px] gap-4">
            <FormField label="Título *" error={errors.title?.message}>
              <Input
                {...register("title")}
                placeholder="Nome do evento..."
                autoFocus={!defaultValues?.title}
                className="h-9 text-sm"
              />
            </FormField>

            <FormField label="Tipo">
              {/* Colored dot overlaid on the select trigger */}
              <div className="relative">
                <div
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full z-10 pointer-events-none transition-colors duration-300"
                  style={{ backgroundColor: typeColor }}
                />
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-9 text-sm pl-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          Object.entries(EVENT_TYPE_LABELS) as [
                            EventType,
                            string,
                          ][]
                        ).map(([t, label]) => (
                          <SelectItem key={t} value={t}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </FormField>
          </div>

          {/* Processo ou caso — 2 cols */}
          <FormSection label="Processo ou caso">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Cliente">
                <Controller
                  name="client_id"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Selecionar cliente..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">— Nenhum —</SelectItem>
                        {clientes.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {getClientDisplayName(
                              c as Parameters<typeof getClientDisplayName>[0],
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField label="Número do processo">
                <Input
                  {...register("process_number")}
                  placeholder="0000000-00.0000.0.00.0000"
                  className="h-9 text-sm font-mono"
                />
              </FormField>
            </div>
          </FormSection>

          {/* Responsáveis — multi-select dropdown */}
          <FormSection label="Responsáveis *">
            <AssigneeMultiSelect
              profiles={profiles}
              value={assigneeIds ?? []}
              onToggle={toggleAssignee}
              error={errors.assignee_ids?.message}
            />
          </FormSection>

          {/* Data & hora */}
          <FormSection label="Data & hora">
            <div className="space-y-3">
              {/* Início */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  label="Data de início *"
                  error={errors.start_date?.message}
                >
                  <Input
                    type="date"
                    {...register("start_date")}
                    className="h-9 text-sm"
                  />
                </FormField>
                <FormField label="Hora de início">
                  <Input
                    type="time"
                    {...register("start_time")}
                    disabled={allDay}
                    className="h-9 text-sm"
                  />
                </FormField>
              </div>

              {/* Prazo fatal */}
              <div>
                <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5 text-destructive/70" />
                  Prazo fatal
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    type="date"
                    {...register("fatal_deadline_date")}
                    className="h-9 text-sm"
                  />
                  <Input
                    type="time"
                    {...register("fatal_deadline_time")}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              {/* Option toggles */}
              <div className="flex flex-wrap gap-2 pt-0.5">
                {[
                  {
                    field: "show_in_agenda" as const,
                    label: "Mostrar na agenda",
                  },
                  ...(!informEnd
                    ? [{ field: "all_day" as const, label: "Dia inteiro" }]
                    : []),
                  { field: "inform_end" as const, label: "Informar término" },
                ].map(({ field, label }) => {
                  const active = watch(field);
                  return (
                    <button
                      key={field}
                      type="button"
                      onClick={() => {
                        if (field === "inform_end" && !active)
                          setValue("all_day", false);
                        setValue(field, !active);
                      }}
                      className={cn(
                        "px-3 py-1 rounded-md text-xs font-medium border transition-all",
                        active
                          ? "bg-primary/10 text-primary border-primary/20"
                          : "text-muted-foreground border-border/60 hover:bg-muted/50",
                      )}
                    >
                      {active && "✓ "}
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* End date/time (conditional) */}
              {informEnd && (
                <div className="grid grid-cols-2 gap-4 pl-3 border-l-2 border-primary/20">
                  <FormField label="Data de término">
                    <Input
                      type="date"
                      {...register("end_date")}
                      className="h-9 text-sm"
                    />
                  </FormField>
                  <FormField label="Hora de término">
                    <Input
                      type="time"
                      {...register("end_time")}
                      className="h-9 text-sm"
                    />
                  </FormField>
                </div>
              )}
            </div>
          </FormSection>

          {/* Detalhes */}
          <FormSection label="Detalhes">
            <div className="space-y-3">
              <FormField
                label={
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" />
                    Local
                  </span>
                }
              >
                <Input
                  {...register("location")}
                  placeholder="Ex: Fórum Central, Sala 12"
                  className="h-9 text-sm"
                />
              </FormField>
              <FormField
                label={
                  <span className="flex items-center gap-1.5">
                    <AlignLeft className="h-3 w-3" />
                    Descrição
                  </span>
                }
              >
                <Textarea
                  {...register("description")}
                  rows={3}
                  placeholder="Detalhes, observações..."
                  className="text-sm resize-none"
                />
              </FormField>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                <Paperclip className="h-3.5 w-3.5" />
                Anexar arquivos
                <span className="opacity-60">(disponível após salvar)</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              />
            </div>
          </FormSection>

          {/* Flags */}
          <FormSection label="Flags">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {FLAG_CONFIG.map(({ field, label, icon: Icon, activeCls }) => {
                  const value = watch(field);
                  return (
                    <button
                      key={field}
                      type="button"
                      onClick={() => setValue(field, !value)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all",
                        value
                          ? activeCls
                          : "text-muted-foreground/60 border-border/60 hover:bg-muted/50 hover:text-muted-foreground",
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {label}
                    </button>
                  );
                })}
              </div>

              {isRecurring && (
                <div className="pl-3 border-l-2 border-violet-200 dark:border-violet-800 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Periodicidade
                  </Label>
                  <Controller
                    name="recurrence_type"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value ?? ""}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Selecionar..." />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(RECURRENCE_TYPE_LABELS).map(
                            ([v, l]) => (
                              <SelectItem key={v} value={v}>
                                {l}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              )}

              {isRetroactive && (
                <div className="pl-3 border-l-2 border-slate-200 dark:border-slate-700 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Data em que foi concluída
                  </Label>
                  <Input
                    type="date"
                    {...register("retroactive_completed_at")}
                    className="h-9 text-sm"
                  />
                </div>
              )}
            </div>
          </FormSection>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 border-t px-8 py-4 flex items-center justify-between bg-muted/10">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="h-8 px-3 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            Cancelar
          </button>
        ) : (
          <div />
        )}
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 h-8 px-5 rounded-md text-sm font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90"
          style={{ backgroundColor: typeColor }}
        >
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Salvar Evento
        </button>
      </div>
    </form>
  );
}

// ── Helper components ────────────────────────────────────────

/**
 * Multi-select dropdown for assignees.
 * Renders selected users as chips in the trigger and a checkable list in the popover.
 */
function AssigneeMultiSelect({
  profiles,
  value,
  onToggle,
  error,
}: {
  profiles: Profile[];
  value: string[];
  onToggle: (id: string) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside the component
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const selectedProfiles = profiles.filter((p) => value.includes(p.id));

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full min-h-9 rounded-md border px-3 py-1.5 text-sm flex items-start gap-2 justify-between bg-background transition-all",
          open
            ? "border-ring ring-[3px] ring-ring/20"
            : "border-input hover:bg-muted/20",
        )}
      >
        <div className="flex flex-wrap gap-1 flex-1 py-px">
          {selectedProfiles.length === 0 ? (
            <span className="text-muted-foreground text-sm">
              Selecionar responsáveis...
            </span>
          ) : (
            selectedProfiles.map((p) => (
              <span
                key={p.id}
                className="bg-primary/10 text-primary text-[11px] font-medium px-2 py-0.5 rounded-full"
              >
                {p.full_name}
              </span>
            ))
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground shrink-0 mt-0.5 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {/* Dropdown list */}
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-md shadow-md py-1 max-h-44 overflow-y-auto">
          {profiles.length === 0 && (
            <p className="text-xs text-muted-foreground px-3 py-2">
              Nenhum usuário encontrado.
            </p>
          )}
          {profiles.map((profile) => {
            const selected = value.includes(profile.id);
            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => onToggle(profile.id)}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <span
                  className={cn(
                    "h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                    selected
                      ? "bg-primary border-primary"
                      : "border-input bg-background",
                  )}
                >
                  {selected && <Check className="h-2.5 w-2.5 text-white" />}
                </span>
                <span className={cn("flex-1 text-left", selected && "font-medium")}>
                  {profile.full_name}
                </span>
                {/* Role badge */}
                <span className="text-[10px] text-muted-foreground/50 capitalize">
                  {profile.role === "admin" ? "Admin" : "Advogado"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <p className="text-[11px] text-destructive mt-1.5">{error}</p>
      )}
    </div>
  );
}

function FormSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[9px] uppercase tracking-[0.14em] font-semibold text-muted-foreground/50 whitespace-nowrap">
          {label}
        </span>
        <div className="flex-1 h-px bg-border/50" />
      </div>
      {children}
    </section>
  );
}

function FormField({
  label,
  children,
  error,
}: {
  label: ReactNode;
  children: ReactNode;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
