'use client'

import { toast } from 'sonner'
import { useToggleTaskDone } from '@/features/tarefas/hooks/useTaskMutations'

/**
 * Concluir pelo dashboard tira a tarefa da lista na hora (as listas daqui só
 * mostram pendentes). O aviso com "Desfazer" é o que diz que o clique valeu —
 * e o caminho de volta para um clique no lugar errado.
 *
 * Desfazer devolve para "A Fazer", como desmarcar na Agenda: `useToggleTaskDone`
 * não guarda o status anterior.
 */
export function useCompleteTask() {
  const toggleTaskDone = useToggleTaskDone()

  return (task: { id: string; title: string }) => {
    toggleTaskDone.mutate({ id: task.id, done: true })
    toast.success('Tarefa concluída', {
      description: task.title,
      action: {
        label: 'Desfazer',
        onClick: () => toggleTaskDone.mutate({ id: task.id, done: false }),
      },
    })
  }
}
