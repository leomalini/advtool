import { tool } from 'ai'
import { z } from 'zod'
import {
  HEARING_MODALITY_LABELS,
  HEARING_STATUS_LABELS,
  isHearingReady,
  type HearingModality,
  type HearingStatus,
} from '@/types/hearing.types'
import { toolError, type ToolClient } from '../shared'

/** As FKs vão nomeadas, como em `hearings.service.ts`: `hearings` aponta para
 * `profiles` e para `legal_process_movements` por mais de um caminho, e o
 * PostgREST recusa embed ambíguo. */
const SELECT =
  'id, status, modality, meeting_url, date_confirmed_at, checklist_generated_at, ' +
  'ready_override_at, legal_process_id, ' +
  'kind:hearing_kinds!hearings_kind_id_fkey(label), ' +
  'event:events!hearings_event_id_fkey(start_at, end_at, all_day, location), ' +
  'legal_process:legal_processes!hearings_legal_process_id_fkey(cnj_number), ' +
  'movement:legal_process_movements!hearings_movement_id_fkey(title, description, movement_date), ' +
  'checklist:hearing_checklist_items!hearing_checklist_items_hearing_id_fkey(' +
  'label, offset_days, client_brings, position, done_at, skipped_at, ' +
  'task:tasks!hearing_checklist_items_task_id_fkey(due_date))'

/** O parser de tipos do PostgREST desiste em selects longos; o formato real. */
type Row = {
  id: string
  status: HearingStatus
  modality: HearingModality | null
  meeting_url: string | null
  date_confirmed_at: string | null
  checklist_generated_at: string | null
  ready_override_at: string | null
  legal_process_id: string | null
  kind: { label: string } | null
  event: { start_at: string; end_at: string; all_day: boolean; location: string | null } | null
  legal_process: { cnj_number: string | null } | null
  movement: { title: string | null; description: string | null; movement_date: string } | null
  checklist: {
    label: string
    offset_days: number
    client_brings: boolean
    position: number
    done_at: string | null
    skipped_at: string | null
    task: { due_date: string | null } | null
  }[]
}

/** Um processo tem poucas audiências; o teto só evita surpresa. */
const MAX_HEARINGS = 10

/** O andamento que designou a audiência; a íntegra está em detalhar_processo. */
const MOVEMENT_TEXT_LENGTH = 400

export function createHearingTools(supabase: ToolClient) {
  return {
    tipos_de_audiencia: tool({
      description:
        'Tipos de audiência do escritório (Conciliação, Instrução…), com o id que criar_audiencia ' +
        'pede e a duração padrão do compromisso.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from('hearing_kinds')
          .select('id, label, default_duration_minutes')
          .order('position')
        if (error) return toolError('os tipos de audiência', error)
        return {
          tipos: (data ?? []).map((kind) => ({
            id: kind.id as string,
            nome: kind.label as string,
            duracao_minutos: kind.default_duration_minutes as number,
          })),
        }
      },
    }),

    ver_audiencias: tool({
      description:
        'Audiências pela ficha: tipo, situação, data e hora, modalidade, local ou link, se a data ' +
        'foi conferida e o checklist de preparação (o que já foi feito, o que falta, o que o ' +
        'cliente traz). Informe o processo (todas as audiências dele) ou uma audiência.',
      inputSchema: z.object({
        processo_id: z.string().uuid().optional(),
        audiencia_id: z.string().uuid().optional(),
      }),
      execute: async ({ processo_id, audiencia_id }) => {
        if (!processo_id && !audiencia_id) {
          return { error: 'Informe processo_id ou audiencia_id.' }
        }

        let query = supabase.from('hearings').select(SELECT).limit(MAX_HEARINGS)
        if (audiencia_id) query = query.eq('id', audiencia_id)
        if (processo_id) query = query.eq('legal_process_id', processo_id)

        const { data, error } = await query
        if (error) return toolError('as audiências', error)

        const rows = (data ?? []) as unknown as Row[]
        // A data mora no evento: ordenar pelo PostgREST ordenaria o embed.
        rows.sort((a, b) => (a.event?.start_at ?? '').localeCompare(b.event?.start_at ?? ''))

        return {
          audiencias: rows.map((row) => {
            const checklist = [...(row.checklist ?? [])].sort((a, b) => a.position - b.position)
            return {
              id: row.id,
              tipo: row.kind?.label ?? null,
              situacao: HEARING_STATUS_LABELS[row.status] ?? row.status,
              inicio: row.event?.start_at ?? null,
              fim: row.event?.end_at ?? null,
              dia_inteiro: row.event?.all_day ?? null,
              local: row.event?.location ?? null,
              link: row.meeting_url,
              modalidade: row.modality ? HEARING_MODALITY_LABELS[row.modality] : null,
              data_conferida_nos_autos: row.date_confirmed_at !== null,
              processo_id: row.legal_process_id,
              processo_cnj: row.legal_process?.cnj_number ?? null,
              // Como a ficha mostra: o título, ou o texto quando não há título.
              movimentacao_de_origem: row.movement
                ? {
                    texto: (row.movement.title?.trim() || row.movement.description || '')
                      .trim()
                      .slice(0, MOVEMENT_TEXT_LENGTH),
                    data: row.movement.movement_date.slice(0, 10),
                  }
                : null,
              pronta: isHearingReady({
                checklist_generated_at: row.checklist_generated_at,
                ready_override_at: row.ready_override_at,
                checklist,
              }),
              // O checklist nasce dos modelos quando a data é conferida
              // (migration 77); antes disso não há o que listar.
              checklist: row.checklist_generated_at
                ? checklist.map((item) => ({
                    item: item.label,
                    situacao: item.done_at ? 'feito' : item.skipped_at ? 'não se aplica' : 'pendente',
                    cliente_traz: item.client_brings,
                    dias_antes_da_audiencia: item.offset_days,
                    tarefa_vence: item.task?.due_date ?? null,
                  }))
                : 'ainda não gerado (nasce quando a data é conferida)',
            }
          }),
        }
      },
    }),
  }
}
