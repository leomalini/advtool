'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Calendar,
  CheckSquare,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  Send,
  Trash2,
  User,
  X,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PriorityBadge } from '@/components/shared/PriorityBadge'
import { cn } from '@/lib/utils'
import { getInitials, getDisplayName, getAvatarTone } from '@/utils/profile'
import { formatRelative } from '@/utils/date'
import { TASK_STATUS_LABELS, type Task, type TaskStatus } from '@/types/task.types'
import type { CreateTaskInput } from '@/schemas/task.schema'
import { useTaskComments } from '../hooks/useTasks'
import {
  useUpdateTask,
  useDeleteTask,
  useAddTaskComment,
  useAddChecklistItem,
  useToggleChecklistItem,
  useDeleteChecklistItem,
} from '../hooks/useTaskMutations'
import { TaskForm } from './TaskForm'
import { isTaskOverdue } from '../utils/filterTasks'

const STATUS_TONE: Record<TaskStatus, string> = {
  todo: 'bg-muted text-muted-foreground',
  in_progress: 'bg-info/12 text-info',
  waiting: 'bg-warning/12 text-warning',
  done: 'bg-success/12 text-success',
}

interface TaskDetailModalProps {
  task: Task | null
  open: boolean
  onClose: () => void
}

/** Task detail — the only surface for checklist items and comments, whose
 * service + hooks existed for a while with no UI consuming them. */
export function TaskDetailModal({ task, open, onClose }: TaskDetailModalProps) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [checklistDraft, setChecklistDraft] = useState('')

  const taskId = task?.id ?? ''
  const { data: comments = [] } = useTaskComments(taskId)
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const addComment = useAddTaskComment(taskId)
  const addChecklistItem = useAddChecklistItem(taskId)
  const toggleChecklistItem = useToggleChecklistItem()
  const deleteChecklistItem = useDeleteChecklistItem()

  if (!task) return null

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setEditing(false)
      setCommentDraft('')
      setChecklistDraft('')
      onClose()
    }
  }

  async function handleUpdate(data: CreateTaskInput) {
    await updateTask.mutateAsync({ id: task!.id, ...data })
    setEditing(false)
  }

  async function handleDelete() {
    await deleteTask.mutateAsync(task!.id)
    setConfirmDelete(false)
    onClose()
  }

  function handleAddComment(e: React.FormEvent) {
    e.preventDefault()
    const content = commentDraft.trim()
    if (!content || addComment.isPending) return
    addComment.mutate(content, { onSuccess: () => setCommentDraft('') })
  }

  function handleAddChecklist(e: React.FormEvent) {
    e.preventDefault()
    const title = checklistDraft.trim()
    if (!title || addChecklistItem.isPending) return
    addChecklistItem.mutate(title, { onSuccess: () => setChecklistDraft('') })
  }

  const checklist = task.checklist_items ?? []
  const checklistDone = checklist.filter((i) => i.is_done).length
  const isOverdue = isTaskOverdue(task)
  const assigneeName = task.assignee ? getDisplayName(task.assignee.full_name) : null

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-[560px] p-0 gap-0 overflow-hidden"
        >
          {editing ? (
            <div className="flex flex-col max-h-[85vh]">
              <div className="shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b">
                <DialogTitle className="text-sm font-semibold">Editar Tarefa</DialogTitle>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5">
                <TaskForm
                  defaultValues={{
                    title: task.title,
                    description: task.description ?? undefined,
                    status: task.status,
                    priority: task.priority,
                    assigned_to: task.assigned_to ?? undefined,
                    due_date: task.due_date ?? undefined,
                  }}
                  onSubmit={handleUpdate}
                  isLoading={updateTask.isPending}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col max-h-[85vh]">
              {/* Header */}
              <div className="relative shrink-0 px-6 pt-5 pb-4 border-b">
                <button
                  type="button"
                  onClick={onClose}
                  className="absolute top-3.5 right-4 p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-black/5 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      STATUS_TONE[task.status]
                    )}
                  >
                    {TASK_STATUS_LABELS[task.status]}
                  </span>
                  <PriorityBadge priority={task.priority} />
                  {isOverdue && (
                    <span className="inline-flex items-center rounded-full bg-destructive/12 px-2 py-0.5 text-[10px] font-medium text-destructive">
                      Atrasada
                    </span>
                  )}
                </div>

                <DialogTitle
                  className={cn(
                    'text-[17px] font-medium leading-snug pr-8',
                    task.status === 'done' && 'line-through text-muted-foreground'
                  )}
                >
                  {task.title}
                </DialogTitle>

                <div className="flex items-center gap-3 mt-2.5 text-[12px] text-muted-foreground">
                  {task.due_date && (
                    <span className={cn('flex items-center gap-1.5', isOverdue && 'text-destructive')}>
                      <Calendar className="h-3.5 w-3.5" />
                      {format(parseISO(task.due_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </span>
                  )}
                  {assigneeName && (
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      {assigneeName}
                    </span>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-6">
                {task.description && (
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                    {task.description}
                  </p>
                )}

                {/* Checklist */}
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Checklist
                    </h3>
                    {checklist.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {checklistDone}/{checklist.length}
                      </span>
                    )}
                  </div>

                  {checklist.length > 0 && (
                    <div className="space-y-1.5">
                      {checklist
                        .slice()
                        .sort((a, b) => a.position - b.position)
                        .map((item) => (
                          <div key={item.id} className="flex items-center gap-2.5 group">
                            <Checkbox
                              checked={item.is_done}
                              onCheckedChange={(checked) =>
                                toggleChecklistItem.mutate({ id: item.id, isDone: !!checked })
                              }
                            />
                            <span
                              className={cn(
                                'text-sm flex-1',
                                item.is_done && 'line-through text-muted-foreground'
                              )}
                            >
                              {item.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => deleteChecklistItem.mutate(item.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all"
                              aria-label="Remover item"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                    </div>
                  )}

                  <form onSubmit={handleAddChecklist} className="flex items-center gap-2">
                    <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <input
                      value={checklistDraft}
                      onChange={(e) => setChecklistDraft(e.target.value)}
                      placeholder="Adicionar item..."
                      className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none py-1"
                    />
                    {checklistDraft.trim() && (
                      <button
                        type="submit"
                        disabled={addChecklistItem.isPending}
                        className="text-xs font-medium text-primary disabled:opacity-50"
                      >
                        Adicionar
                      </button>
                    )}
                  </form>
                </section>

                {/* Comentários */}
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Comentários
                    </h3>
                    {comments.length > 0 && (
                      <span className="text-xs text-muted-foreground">{comments.length}</span>
                    )}
                  </div>

                  {comments.length === 0 ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <MessageCircle className="h-3.5 w-3.5" />
                      Nenhum comentário ainda
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {comments.map((comment) => {
                        const authorName = comment.author
                          ? getDisplayName(comment.author.full_name)
                          : 'Alguém'
                        return (
                          <div key={comment.id} className="flex gap-2.5">
                            <div
                              className={cn(
                                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white text-[10px] font-bold',
                                getAvatarTone(comment.author_id)
                              )}
                            >
                              {getInitials(authorName)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-2">
                                <span className="text-xs font-medium">{authorName}</span>
                                <time className="text-[11px] text-muted-foreground">
                                  {formatRelative(comment.created_at)}
                                </time>
                              </div>
                              <p className="text-sm text-foreground/80 whitespace-pre-wrap mt-0.5">
                                {comment.content}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <form onSubmit={handleAddComment} className="flex items-start gap-2">
                    <textarea
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) handleAddComment(e)
                      }}
                      rows={2}
                      placeholder="Escreva um comentário..."
                      className="flex-1 px-3 py-2 rounded-lg border border-border text-sm bg-card resize-none placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
                    />
                    <button
                      type="submit"
                      disabled={!commentDraft.trim() || addComment.isPending}
                      className="p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 shrink-0"
                      aria-label="Comentar"
                    >
                      {addComment.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </button>
                  </form>
                </section>
              </div>

              {/* Footer */}
              <div className="shrink-0 flex items-center justify-between gap-2 px-6 py-4 border-t bg-background">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </button>
                <div className="flex items-center gap-2">
                  {task.status !== 'done' && (
                    <button
                      type="button"
                      onClick={() => updateTask.mutate({ id: task.id, status: 'done' })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted/40 transition-colors"
                    >
                      <CheckSquare className="h-3.5 w-3.5" />
                      Concluir
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir tarefa"
        description={`"${task.title}" será removida permanentemente, junto com seus comentários e itens de checklist.`}
        confirmLabel="Excluir"
        onConfirm={handleDelete}
      />
    </>
  )
}
