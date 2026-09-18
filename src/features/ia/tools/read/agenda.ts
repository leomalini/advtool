import { tool } from 'ai'
import { z } from 'zod'
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from '@/types/task.types'
import type { TaskPriority, TaskStatus } from '@/types/task.types'
import {
  clientLabel,
  dateSchema,
  limitSchema,
  officeDayEnd,
  officeDayStart,
  toolError,
  type ToolClient,
} from '../shared'

/** Teto por consulta de agenda: uma semana cheia cabe, um ano não. */
const MAX_AGENDA = 20

const EVENT_SELECT =
  'id, title, type, start_at, end_at, all_day, location, description, fatal_deadline, ' +
  'is_important, is_urgent, legal_process_id, ' +
  'client:clients(type, name, company_name, trade_name), ' +
  'legal_process:legal_processes(cnj_number), ' +
  'assignees:event_assignees(profile:profiles(full_name)), ' +
  'event_type:event_types(label)'

const TASK_SELECT =
  'id, title, description, status, priority, due_date, due_time, legal_process_id, client_id, ' +
  'assignee:profiles!tasks_assigned_to_fkey(full_name), ' +
  'client:clients(type, name, company_name, trade_name), ' +
  'legal_process:legal_processes(cnj_number)'

export function createAgendaTools(supabase: ToolClient) {
  return {
    eventos_no_periodo: tool({
      description:
        'Compromissos da Agenda (audiências, prazos, reuniões…) que tocam o período informado. ' +
        'Datas em yyyy-MM-dd, inclusivas. Para "hoje", "esta semana" etc., calcule as datas a ' +
        'partir da data atual do sistema.',
      inputSchema: z.object({
        de: dateSchema,
        ate: dateSchema,
        processo_id: z.string().uuid().optional(),
        limite: limitSchema,
      }),
      execute: async ({ de, ate, processo_id, limite }) => {
        let query = supabase
          .from('events')
          .select(EVENT_SELECT)
          .eq('show_in_agenda', true)
          // Sobreposição com o período, como `getEvents` da Agenda: um evento
          // de vários dias que começou antes ainda está em curso.
          .gte('end_at', officeDayStart(de))
          .lte('start_at', officeDayEnd(ate))
          .order('start_at')
          .limit(limite ?? MAX_AGENDA)
        if (processo_id) query = query.eq('legal_process_id', processo_id)

        const { data, error } = await query
        if (error) return toolError('a agenda', error)

        return {
          eventos: (data ?? []).map((e) => {
            const row = e as unknown as EventRow
            return {
              id: row.id,
              titulo: row.title,
              tipo: row.event_type?.label ?? row.type,
              inicio: row.start_at,
              fim: row.end_at,
              dia_inteiro: row.all_day,
              local: row.location,
              prazo_fatal: row.fatal_deadline,
              importante: row.is_important,
              urgente: row.is_urgent,
              cliente: clientLabel(row.client),
              processo_cnj: row.legal_process?.cnj_number ?? null,
              processo_id: row.legal_process_id,
              responsaveis: (row.assignees ?? []).map((a) => a.profile?.full_name).filter(Boolean),
            }
          }),
        }
      },
    }),

    listar_tarefas: tool({
      description:
        'Tarefas do escritório, filtráveis por status, prioridade, período de vencimento, ' +
        'responsável (id de membro), cliente ou processo. Sem filtros, lista as abertas mais próximas do vencimento.',
      inputSchema: z.object({
        status: z.enum(['todo', 'in_progress', 'waiting', 'done']).optional(),
        prioridade: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        vence_de: dateSchema.optional(),
        vence_ate: dateSchema.optional(),
        responsavel_id: z.string().uuid().optional(),
        cliente_id: z.string().uuid().optional(),
        processo_id: z.string().uuid().optional(),
        limite: limitSchema,
      }),
      execute: async (input) => {
        let query = supabase
          .from('tasks')
          .select(TASK_SELECT)
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(input.limite ?? MAX_AGENDA)

        if (input.status) query = query.eq('status', input.status)
        else query = query.neq('status', 'done')
        if (input.prioridade) query = query.eq('priority', input.prioridade)
        if (input.vence_de) query = query.gte('due_date', input.vence_de)
        if (input.vence_ate) query = query.lte('due_date', input.vence_ate)
        if (input.responsavel_id) query = query.eq('assigned_to', input.responsavel_id)
        if (input.cliente_id) query = query.eq('client_id', input.cliente_id)
        if (input.processo_id) query = query.eq('legal_process_id', input.processo_id)

        const { data, error } = await query
        if (error) return toolError('as tarefas', error)

        return {
          tarefas: (data ?? []).map((t) => {
            const row = t as unknown as TaskRow
            return {
              id: row.id,
              titulo: row.title,
              descricao: row.description,
              status: TASK_STATUS_LABELS[row.status] ?? row.status,
              prioridade: TASK_PRIORITY_LABELS[row.priority] ?? row.priority,
              vencimento: row.due_date,
              hora: row.due_time,
              responsavel: row.assignee?.full_name ?? null,
              cliente: clientLabel(row.client),
              processo_cnj: row.legal_process?.cnj_number ?? null,
              processo_id: row.legal_process_id,
            }
          }),
        }
      },
    }),

    tipos_de_evento: tool({
      description:
        'Tipos de compromisso cadastrados (id e rótulo). Necessário para escolher o `tipo` ao criar um evento.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from('event_types')
          .select('id, label')
          .order('position')
        if (error) return toolError('os tipos de evento', error)
        return { tipos: data ?? [] }
      },
    }),
  }
}

type EventRow = {
  id: string
  title: string
  type: string
  start_at: string
  end_at: string
  all_day: boolean
  location: string | null
  fatal_deadline: string | null
  is_important: boolean
  is_urgent: boolean
  legal_process_id: string | null
  client: Parameters<typeof clientLabel>[0]
  legal_process: { cnj_number: string | null } | null
  assignees: Array<{ profile: { full_name: string } | null }>
  event_type: { label: string } | null
}

type TaskRow = {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  due_time: string | null
  legal_process_id: string | null
  assignee: { full_name: string } | null
  client: Parameters<typeof clientLabel>[0]
  legal_process: { cnj_number: string | null } | null
}
