'use client'

import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import type { SeriesScope } from '@/lib/recurrence'
import type { CalendarEvent } from '@/types/event.types'
import { updateTask } from '@/features/tarefas/services/tasks.service'
import {
  patchCachedTask,
  useInvalidateTaskSurfaces,
} from '@/features/tarefas/hooks/useTaskMutations'
import { eventToFormValues, updateEvent } from '../services/events.service'
import { eventKeys } from './useEvents'
import { useInvalidateEventSurfaces } from './useEventMutations'
import type { AgendaItem } from '../utils/agendaItem'
import {
  currentTimes,
  movedEventColumns,
  toEventMovePatch,
  toTaskMovePatch,
  type MovedTimes,
} from '../utils/dragMove'

export interface AgendaMove {
  item: AgendaItem
  moved: MovedTimes
  /** Alcance numa série de eventos. Tarefa move sempre só a ocorrência. */
  scope?: SeriesScope
  /** Arrastou o item ou a borda de baixo dele — só muda o texto do aviso. */
  action?: 'move' | 'resize'
  /** O próprio Desfazer — não oferece outro Desfazer. */
  isUndo?: boolean
}

type CacheSnapshot = [QueryKey, unknown][]

/**
 * Dá para mostrar o item no lugar novo antes da resposta?
 *
 * Só quando muda uma linha. "Seguintes" e "Todos" refazem ocorrências no
 * servidor (ids novos, datas recalculadas pela regra) — não há como prever a
 * lista; espera-se a volta.
 */
export function isOptimisticMove({ item, scope = 'this' }: Pick<AgendaMove, 'item' | 'scope'>): boolean {
  return item.kind === 'task' || scope === 'this' || !item.event.recurrence_series_id
}

/** Aplica o movimento ao evento em todas as listas de eventos em cache. */
async function patchCachedEvent(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
  moved: MovedTimes
): Promise<CacheSnapshot> {
  await queryClient.cancelQueries({ queryKey: eventKeys.all })

  const snapshots = queryClient.getQueriesData({ queryKey: eventKeys.all })
  const columns = movedEventColumns(moved)
  queryClient.setQueriesData({ queryKey: eventKeys.all }, (old: unknown) =>
    Array.isArray(old)
      ? (old as CalendarEvent[]).map((ev) => (ev.id === id ? { ...ev, ...columns } : ev))
      : old
  )
  return snapshots
}

/** "qui, 10 out, 14:15" — ou só o dia, quando vira dia inteiro. */
function movedWhenLabel(moved: MovedTimes): string {
  return format(moved.start, moved.allDay ? 'EEE, d MMM' : 'EEE, d MMM, HH:mm', { locale: ptBR })
}

/**
 * Grava o arraste de um item da Agenda — evento ou tarefa.
 *
 * Linha única: otimista (o item fica onde caiu), com rollback no erro e um
 * Desfazer no toast. Série com "seguintes"/"todos": passa pelo mesmo
 * `updateEvent` do formulário, com o formulário inteiro do evento e as novas
 * datas — é ele que refaz ou re-horariza as ocorrências.
 */
export function useMoveAgendaItem() {
  const queryClient = useQueryClient()
  const invalidateEvents = useInvalidateEventSurfaces()
  const invalidateTasks = useInvalidateTaskSurfaces()
  const { user } = useAuth()

  const mutation = useMutation({
    mutationFn: async ({ item, moved, scope = 'this' }: AgendaMove) => {
      if (item.kind === 'task') {
        await updateTask(toTaskMovePatch(item.task, moved), user?.id)
        return
      }
      if (!user) throw new Error('Sem usuário autenticado.')

      const patch = toEventMovePatch(item.event, moved)
      if (isOptimisticMove({ item, scope })) {
        await updateEvent(patch, user.id, { current: item.event, scope: 'this' })
        return
      }
      await updateEvent({ ...eventToFormValues(item.event), ...patch }, user.id, {
        current: item.event,
        scope,
      })
    },

    onMutate: async (move): Promise<{ snapshots: CacheSnapshot }> => {
      if (!isOptimisticMove(move)) return { snapshots: [] }
      if (move.item.kind === 'task') {
        const { due_date, due_time } = toTaskMovePatch(move.item.task, move.moved)
        return patchCachedTask(queryClient, move.item.task.id, { due_date, due_time })
      }
      return { snapshots: await patchCachedEvent(queryClient, move.item.event.id, move.moved) }
    },

    onError: (_error, move, context) => {
      for (const [key, data] of context?.snapshots ?? []) queryClient.setQueryData(key, data)
      toast.error(
        move.action === 'resize'
          ? 'Erro ao alterar o término.'
          : move.item.kind === 'task'
            ? 'Erro ao mover tarefa.'
            : 'Erro ao mover evento.'
      )
    },

    onSuccess: (_data, move) => {
      const resize = move.action === 'resize'
      const noun = move.item.kind === 'task' ? 'Tarefa movida' : 'Evento movido'
      if (move.isUndo) {
        toast.success(resize ? 'Término desfeito.' : `${noun} de volta.`)
        return
      }
      if (!isOptimisticMove(move)) {
        toast.success(resize ? 'Eventos atualizados.' : 'Eventos movidos.')
        return
      }
      const message = resize
        ? `Evento vai até ${format(move.moved.end, 'HH:mm')}.`
        : `${noun} para ${movedWhenLabel(move.moved)}.`
      toast.success(message, {
        action: {
          label: 'Desfazer',
          onClick: () =>
            mutation.mutate({
              item: move.item,
              moved: currentTimes(move.item),
              action: move.action,
              isUndo: true,
            }),
        },
      })
    },

    onSettled: (_data, _error, move) => {
      if (move.item.kind === 'task') invalidateTasks()
      else invalidateEvents()
    },
  })

  return mutation
}
