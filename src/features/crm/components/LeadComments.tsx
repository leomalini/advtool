'use client'

import { useState } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Trash2, Send } from 'lucide-react'
import { useLeadComments } from '../hooks/useLeads'
import { useAddLeadComment, useDeleteLeadComment } from '../hooks/useLeadMutations'
import { useAuth } from '@/hooks/useAuth'
import { formatRelative } from '@/utils/date'

interface LeadCommentsProps {
  leadId: string
}

export function LeadComments({ leadId }: LeadCommentsProps) {
  const [text, setText] = useState('')
  const { user } = useAuth()
  const { data: comments, isLoading } = useLeadComments(leadId)
  const addComment = useAddLeadComment(leadId)
  const deleteComment = useDeleteLeadComment(leadId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    await addComment.mutateAsync({ content: text.trim() })
    setText('')
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Adicionar comentário..."
          rows={2}
          className="flex-1 resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.ctrlKey) handleSubmit(e)
          }}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!text.trim() || addComment.isPending}
          className="self-end"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>

      <div className="space-y-3">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-2">
              <Skeleton className="h-7 w-7 rounded-full shrink-0" />
              <Skeleton className="h-14 flex-1 rounded-md" />
            </div>
          ))}

        {comments?.map((comment) => {
          const initials =
            comment.author?.full_name
              ?.split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')
              .toUpperCase() ?? '??'
          const isOwn = comment.author_id === user?.id

          return (
            <div key={comment.id} className="flex gap-2 group">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 bg-muted rounded-lg px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{comment.author?.full_name}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">
                      {formatRelative(comment.created_at)}
                    </span>
                    {isOwn && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => deleteComment.mutate(comment.id)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
              </div>
            </div>
          )
        })}

        {!isLoading && comments?.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum comentário ainda.
          </p>
        )}
      </div>
    </div>
  )
}
