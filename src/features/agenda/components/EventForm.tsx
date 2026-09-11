"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DialogTitle } from "@/components/ui/dialog";
import {
  Loader2,
  Paperclip,
  X,
  AlertCircle,
  Clock,
  Star,
  CalendarClock,
  History,
  MapPin,
  AlignLeft,
  Check,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { eventFormSchema, type EventFormInput } from "@/schemas/event.schema";
import { resolveEventType } from "@/types/event.types";
import { RecurrenceFields } from "@/components/shared/RecurrenceFields";
import { Can } from "@/components/shared/Can";
import { MAX_FILE_SIZE } from "@/schemas/document.schema";
import { formatFileSize } from "@/types/document.types";
import { EventTypeSelect } from "./EventTypeSelect";
import { useEventTypeMap } from "../hooks/useEventTypes";
import type { Profile } from "@/types/common.types";
import { getRoleLabel } from "@/utils/profile";
import { useAuth } from "@/hooks/useAuth";
import { useProfiles } from "@/hooks/useProfiles";
import { ClienteCombobox } from "@/features/clientes/components/ClienteCombobox";
import { ProcessoCombobox } from "@/features/processos/components/ProcessoCombobox";
import { useLegalProcesses } from "@/features/processos/hooks/useLegalProcesses";

interface EventFormProps {
  defaultDate?: Date;
  /** HH:mm de início — vem do clique num horário da grade. Antes o formulário
   * só lia a data de `defaultDate` e abria sempre às 09:00. */
  defaultTime?: string;
  /** Substitui o título do cabeçalho — a Agenda põe ali as abas Evento |
   * Tarefa. Precisa conter o `DialogTitle`. */
  headerContent?: ReactNode;
  defaultValues?: Partial<EventFormInput>;
  /** `files`: anexos escolhidos no formulário, para subir depois de salvar. */
  onSubmit: (data: EventFormInput, files: File[]) => void;
  onCancel?: () => void;
  isLoading?: boolean;
  /** Opened from inside a caso/processo: the link is already decided, so the
   * Vínculos section is hidden rather than offering a choice that would
   * contradict where the user is. */
  lockedLegalProcessId?: string | null;
  lockedCrmItemId?: string | null;
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
    field: "is_retroactive" as const,
    label: "Retroativa",
    icon: History,
    activeCls:
      "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  },
] as const;

export function EventForm({
  defaultDate,
  defaultTime,
  headerContent,
  defaultValues,
  onSubmit,
  onCancel,
  isLoading,
  lockedLegalProcessId,
  lockedCrmItemId,
}: EventFormProps) {
  const isLinkLocked = !!lockedLegalProcessId || !!lockedCrmItemId;
  const { user } = useAuth();
  const { data: profiles = [] } = useProfiles();
  const { data: processos = [] } = useLegalProcesses();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  /** Mesmo limite da aba Documentos — recusar aqui evita descobrir só depois
   * de salvar que o arquivo não subiu. */
  function handleFilesPicked(files: FileList | null) {
    if (!files || files.length === 0) return;
    const accepted: File[] = [];
    const tooLarge: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) tooLarge.push(file.name);
      else accepted.push(file);
    }
    setFileError(
      tooLarge.length > 0
        ? `Passa de ${formatFileSize(MAX_FILE_SIZE)} e ficou de fora: ${tooLarge.join(", ")}`
        : null,
    );
    setPendingFiles((current) => [...current, ...accepted]);
    // Permite escolher o mesmo arquivo de novo: sem isto o input não dispara change.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const today = defaultDate
    ? format(defaultDate, "yyyy-MM-dd")
    : format(new Date(), "yyyy-MM-dd");

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    control,
    formState: { errors, isSubmitted },
  } = useForm<EventFormInput>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      type: "meeting",
      start_date: today,
      start_time: defaultTime ?? "09:00",
      show_in_agenda: true,
      all_day: false,
      inform_end: false,
      is_important: false,
      is_urgent: false,
      is_future: false,
      is_retroactive: false,
      recurrence_type: "",
      recurrence_ends: "until",
      assignee_ids: [],
      ...defaultValues,
    },
  });

  const eventTypes = useEventTypeMap();

  const watchType = watch("type");
  const informEnd = watch("inform_end");
  const allDay = watch("all_day");
  const isRetroactive = watch("is_retroactive");
  const assigneeIds = watch("assignee_ids");
  // A cor do tipo tinge o cabeçalho e o botão de salvar. Vem do cadastro, e
  // por isso muda quando um tipo novo é criado no meio do preenchimento.
  const typeColor = resolveEventType(eventTypes, watchType).color;

  // The client field follows the processo whenever that processo has one of
  // its own; it only stays editable for processos with no client set.
  const linkedProcessoId = watch("legal_process_id");
  const clientLockedByProcesso = !!linkedProcessoId
    && !!processos.find((p) => p.id === linkedProcessoId)?.crm_item?.client_id;
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
      onSubmit={handleSubmit((data) => onSubmit(data, pendingFiles))}
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
          {/* DialogTitle, not a bare h2: Radix uses it as the dialog's
              accessible name and warns when DialogContent has none. */}
          {headerContent ?? (
            <DialogTitle className="text-sm font-semibold">{formTitle}</DialogTitle>
          )}
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
        <div className="px-8 py-6 space-y-7">

          {/* Título ocupa a linha inteira: dividindo espaço com o Tipo sobrava
              pouco mais de 200px para o campo mais longo do formulário. */}
          <div className="space-y-4">
            <FormField label="Título *" error={errors.title?.message}>
              <Input
                {...register("title")}
                placeholder="Ex: Audiência de instrução — Silva x Empresa"
                autoFocus={!defaultValues?.title}
                className="h-9 text-sm"
              />
            </FormField>

            {/* Largura contida: um select de 4 opções curtas não precisa da
                linha inteira, e alinhado à esquerda não parece órfão. */}
            <div className="max-w-[220px]">
            <FormField label="Tipo">
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <EventTypeSelect value={field.value} onChange={field.onChange} />
                )}
              />
            </FormField>
            </div>
          </div>

          {/* Vínculos — ambos buscáveis, mesmo padrão do CRM. Opcionais: um
              evento pode existir sem processo e sem cliente.
              Escondidos quando o form é aberto de dentro de um caso/processo:
              o vínculo já está decidido e é aplicado no submit. RHF preserva o
              valor de campos não renderizados, então nada se perde. */}
          {!isLinkLocked && (
          <FormSection label="Vínculos (opcional)">
            <FormField label="Processo">
              <Controller
                name="legal_process_id"
                control={control}
                render={({ field }) => (
                  <ProcessoCombobox
                    value={field.value}
                    onChange={(id) => {
                      field.onChange(id)
                      // The processo owns the client relationship, so selecting
                      // one adopts its client instead of letting the two fields
                      // drift apart.
                      const clientId = processos.find((p) => p.id === id)?.crm_item?.client_id
                      if (clientId) setValue("client_id", clientId)
                    }}
                  />
                )}
              />
            </FormField>

            <FormField label="Cliente">
              <Controller
                name="client_id"
                control={control}
                render={({ field }) => (
                  <ClienteCombobox
                    value={field.value}
                    disabled={clientLockedByProcesso}
                    onChange={(id) => {
                      field.onChange(id ?? "")
                      // Only reachable when the processo has no client of its
                      // own; picking a different one would contradict the link.
                      if (linkedProcessoId) setValue("legal_process_id", "")
                    }}
                  />
                )}
              />
            </FormField>
            {clientLockedByProcesso && (
              <p className="text-[11px] text-muted-foreground -mt-1">
                Definido pelo processo vinculado. Remova o processo para escolher outro cliente.
              </p>
            )}
          </FormSection>
          )}

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
            <div className="space-y-4">
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

              {/* Option toggles. "Dia inteiro" e "Informar término" convivem:
                  é assim que se agenda "Férias de 1 a 5". Antes ligar o
                  término escondia e desligava o dia inteiro. */}
              <div className="flex flex-wrap gap-2 pt-0.5">
                {[
                  {
                    field: "show_in_agenda" as const,
                    label: "Mostrar na agenda",
                  },
                  { field: "all_day" as const, label: "Dia inteiro" },
                  { field: "inform_end" as const, label: "Informar término" },
                ].map(({ field, label }) => {
                  const active = watch(field);
                  return (
                    <button
                      key={field}
                      type="button"
                      onClick={() => {
                        // Término começa no mesmo dia do início: o caso comum
                        // é estender alguns dias, não digitar a data do zero.
                        if (field === "inform_end" && !active && !getValues("end_date"))
                          setValue("end_date", getValues("start_date"));
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
                  <FormField
                    label={allDay ? "Último dia" : "Data de término"}
                    error={errors.end_date?.message}
                  >
                    <Input
                      type="date"
                      {...register("end_date")}
                      className="h-9 text-sm"
                    />
                  </FormField>
                  {/* Dia inteiro termina no fim do último dia — hora não se aplica. */}
                  {!allDay && (
                    <FormField label="Hora de término">
                      <Input
                        type="time"
                        {...register("end_time")}
                        className="h-9 text-sm"
                      />
                    </FormField>
                  )}
                </div>
              )}
            </div>
          </FormSection>

          {/* Repetir — cria a série inteira ao salvar (migration 52). */}
          <FormSection label="Repetir">
            <RecurrenceFields
              value={{
                recurrence_type: watch("recurrence_type"),
                recurrence_ends: watch("recurrence_ends"),
                recurrence_until: watch("recurrence_until"),
                recurrence_count: watch("recurrence_count"),
              }}
              onChange={(patch) => {
                // Revalida só depois da 1ª tentativa de salvar, como o resto do form.
                const opts = { shouldValidate: isSubmitted };
                if (patch.recurrence_type !== undefined) setValue("recurrence_type", patch.recurrence_type, opts);
                if (patch.recurrence_ends !== undefined) setValue("recurrence_ends", patch.recurrence_ends, opts);
                if (patch.recurrence_until !== undefined) setValue("recurrence_until", patch.recurrence_until, opts);
                if (patch.recurrence_count !== undefined) setValue("recurrence_count", patch.recurrence_count, opts);
              }}
              startDate={watch("start_date")}
              pluralNoun="eventos"
              errors={{
                recurrence_type: errors.recurrence_type?.message,
                recurrence_until: errors.recurrence_until?.message,
                recurrence_count: errors.recurrence_count?.message,
              }}
            />
          </FormSection>

          {/* Detalhes */}
          <FormSection label="Detalhes">
            <div className="space-y-4">
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
              {/* Anexos. O botão existia sem nada ligado a ele — escolher um
                  arquivo não fazia coisa alguma. Os arquivos ficam aqui até o
                  evento ser salvo e sobem logo depois (useCreateEvent/useUpdateEvent). */}
              <Can resource="documentos" action="create">
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    Anexar arquivos
                    <span className="opacity-60">· até {formatFileSize(MAX_FILE_SIZE)} cada</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFilesPicked(e.target.files)}
                  />
                  {pendingFiles.length > 0 && (
                    <ul className="space-y-1">
                      {pendingFiles.map((file, index) => (
                        <li
                          key={`${file.name}-${file.size}-${file.lastModified}`}
                          className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1 text-xs"
                        >
                          <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="flex-1 truncate">{file.name}</span>
                          <span className="shrink-0 text-muted-foreground">
                            {formatFileSize(file.size)}
                          </span>
                          <button
                            type="button"
                            aria-label={`Remover ${file.name}`}
                            onClick={() =>
                              setPendingFiles((files) => files.filter((_, i) => i !== index))
                            }
                            className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {fileError && <p className="text-[11px] text-destructive">{fileError}</p>}
                </div>
              </Can>
            </div>
          </FormSection>

          {/* Flags */}
          <FormSection label="Flags">
            <div className="space-y-4">
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
                <span className="text-[10px] text-muted-foreground/50">
                  {getRoleLabel(profile.role)}
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
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[9px] uppercase tracking-[0.14em] font-semibold text-muted-foreground/50 whitespace-nowrap">
          {label}
        </span>
        <div className="flex-1 h-px bg-border/50" />
      </div>
      {/* Stacked fields need breathing room of their own — sections used to
          rely on each child bringing its own spacing, which several didn't. */}
      <div className="space-y-4">{children}</div>
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
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
