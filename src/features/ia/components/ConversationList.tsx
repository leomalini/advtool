'use client'

import { MessageSquare, Plus, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useConversations, useDeleteConversation } from '../hooks/useConversations'

interface ConversationListProps {
  activeId: string
  onSelect: (id: string) => void
  onNew: () => void
}

export function ConversationList({ activeId, onSelect, onNew }: ConversationListProps) {
  const { data: conversations = [], isLoading } = useConversations()
  const remove = useDeleteConversation()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-2 border-b">
        <Button size="sm" variant="outline" className="w-full" onClick={onNew}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nova conversa
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {isLoading &&
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
        {!isLoading && conversations.length === 0 && (
          <p className="px-2 py-4 text-xs text-muted-foreground text-center">
            Suas conversas aparecem aqui.
          </p>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={cn(
              'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer',
              c.id === activeId ? 'bg-accent' : 'hover:bg-accent/60',
            )}
            onClick={() => onSelect(c.id)}
          >
            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate">{c.title ?? 'Sem título'}</p>
              <p className="text-[11px] text-muted-foreground">
                {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true, locale: ptBR })}
              </p>
            </div>
            <button
              type="button"
              aria-label="Excluir conversa"
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                remove.mutate(c.id, { onSuccess: () => c.id === activeId && onNew() })
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
