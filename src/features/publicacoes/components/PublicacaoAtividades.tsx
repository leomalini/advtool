'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CheckSquare, ListTodo, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { getTasksForPublication } from '@/features/tarefas/services/tasks.service'
import { useCreateTask, useUpdateTask } from '@/features/tarefas/hooks/useTaskMutations'
import type { PublicationWithRelations } from '@/types/publication.types'

const STATUS_LABELS: Record<string, string> = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  waiting: 'Aguardando',
  done: 'Concluída',
}

/**
 * Atividades nascidas desta publicação.
 *
 * Ler a intimação e providenciar o que ela pede são atos distintos — a mesma
 * separação que "não lida" e "tratada" já fazem. A atividade é a providência
 * registrada: ela guarda o vínculo com a publicação e, quando o processo está
 * cadastrado, também com ele, aparecendo nas duas telas.
 *
 * O campo aceita só o título de propósito: anotar a providência no meio da
 * leitura precisa custar um enter. Prazo, responsável e prioridade se ajustam
 * depois, em Tarefas.
 */
export function PublicacaoAtividades({
  publicacao,
}: {
  publicacao: PublicationWithRelations
}) {
  const [title, setTitle] = useState('')

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', 'publication', publicacao.id],
    queryFn: () => getTasksForPublication(publicacao.id),
  })

  const createTask = useCreateTask()
  const updateTask = useUpdateTask()

  function handleAdd() {
    const trimmed = title.trim()
    if (!trimmed || createTask.isPending) return

    createTask.mutate(
      {
        title: trimmed,
        publication_id: publicacao.id,
        // Sem processo cadastrado a atividade fica só na publicação; com ele,
        // aparece também na aba de atividades do processo.
        legal_process_id: publicacao.legal_process_id ?? undefined,
      },
      { onSuccess: () => setTitle('') },
    )
  }

  const pendentes = tasks.filter((task) => task.status !== 'done')

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <ListTodo className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Atividades da publicação</h2>
          <p className="text-[11px] text-muted-foreground">
            {publicacao.legal_process_id
              ? 'Aparecem também nas atividades do processo'
              : 'Ficam só aqui enquanto o processo não estiver cadastrado'}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd()
          }}
          placeholder="Título da nova atividade (ex: Contestar até o prazo)"
          className="h-9 text-sm"
        />
        <Button
          size="sm"
          className="h-9 shrink-0"
          onClick={handleAdd}
          disabled={!title.trim() || createTask.isPending}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Adicionar
        </Button>
      </div>

      <div className="mt-4">
        {isLoading && <div className="h-10 animate-pulse rounded-lg bg-muted/40" />}

        {!isLoading && tasks.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma atividade criada a partir desta publicação.
          </p>
        )}

        {!isLoading && tasks.length > 0 && (
          <>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {pendentes.length === 0
                ? 'Todas concluídas'
                : `${pendentes.length} pendente(s)`}
            </p>

            <ul className="divide-y divide-border rounded-lg border border-border">
              {tasks.map((task) => {
                const done = task.status === 'done'

                return (
                  <li key={task.id} className="flex items-center gap-3 px-3 py-2.5">
                    <button
                      type="button"
                      aria-label={done ? 'Reabrir atividade' : 'Concluir atividade'}
                      onClick={() =>
                        updateTask.mutate({ id: task.id, status: done ? 'todo' : 'done' })
                      }
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                        done
                          ? 'border-success bg-success text-success-foreground'
                          : 'border-border hover:border-success',
                      )}
                    >
                      {done && <CheckSquare className="h-3 w-3" />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'truncate text-sm',
                          done && 'text-muted-foreground line-through',
                        )}
                      >
                        {task.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {STATUS_LABELS[task.status] ?? task.status}
                        {task.due_date &&
                          ` · vence em ${format(parseISO(task.due_date), 'dd/MM/yyyy', {
                            locale: ptBR,
                          })}`}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
