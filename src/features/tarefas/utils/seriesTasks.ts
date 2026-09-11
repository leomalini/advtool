import type { Task } from '@/types/task.types'
import { isTaskOverdue } from './filterTasks'

/**
 * Listas de tarefas (quadro, abas de Processo/Cliente): de cada série
 * recorrente, só as atrasadas, a próxima pendente e as concluídas.
 *
 * A série é materializada (migration 52) — uma tarefa semanal por um ano são
 * 52 linhas, e todas na coluna "A Fazer" enterrariam o resto. As futuras
 * continuam visíveis na Agenda, cada uma no seu dia; aqui aparece a vez dela
 * quando a anterior sai do caminho.
 *
 * Concluídas ficam: são trabalho feito, como qualquer outra tarefa concluída.
 */
export function collapseRecurringTasks(tasks: Task[]): Task[] {
  const nextPendingBySeries = new Map<string, Task>()

  for (const task of tasks) {
    const seriesId = task.recurrence_series_id
    if (!seriesId || task.status === 'done' || isTaskOverdue(task)) continue
    const current = nextPendingBySeries.get(seriesId)
    if (!current || (task.due_date ?? '') < (current.due_date ?? '')) {
      nextPendingBySeries.set(seriesId, task)
    }
  }

  return tasks.filter((task) => {
    const seriesId = task.recurrence_series_id
    if (!seriesId || task.status === 'done' || isTaskOverdue(task)) return true
    return nextPendingBySeries.get(seriesId)?.id === task.id
  })
}
