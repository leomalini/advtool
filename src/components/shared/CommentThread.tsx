'use client'

import { useState } from 'react'
import { Loader2, MessageCircle, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getInitials, getDisplayName, getAvatarTone } from '@/utils/profile'
import { formatRelative } from '@/utils/date'

/** O mínimo que uma nota precisa ter para ser renderizada aqui. Comentários de
 * crm_item e de cliente vivem em tabelas separadas, mas têm esta forma. */
export interface ThreadComment {
  id: string
  content: string
  created_at: string
  author_id: string
  author?: {
    full_name: string
  }
}

interface CommentThreadProps {
  comments: ThreadComment[]
  isLoading?: boolean
  isError?: boolean
  onSubmit: (content: string, onDone: () => void) => void
  isPending?: boolean
  /** Aparece no estado vazio, ex. "caso", "processo", "cliente". */
  itemLabel?: string
  /** Rótulos da seção — "Comentários" no CRM, "Notas" no cliente. */
  title?: string
  composerTitle?: string
  placeholder?: string
}

/**
 * Compositor + lista de uma thread de comentários.
 *
 * Existe porque as notas do cliente ficam em `client_comments` e as do caso em
 * `crm_item_comments`: duas fontes, uma apresentação. Sem este componente as
 * duas telas seriam cópias que divergiriam no primeiro ajuste — foi assim que
 * o ProcessoModal e a página do processo acabaram desencontrados.
 */
export function CommentThread({
  comments,
  isLoading = false,
  isError = false,
  onSubmit,
  isPending = false,
  itemLabel = 'item',
  title = 'Comentários',
  composerTitle = 'Adicionar comentário',
  placeholder = 'Escreva um comentário...',
}: CommentThreadProps) {
  const [draft, setDraft] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const content = draft.trim()
    if (!content || isPending) return
    onSubmit(content, () => setDraft(''))
  }

  const composer = (
    <form onSubmit={handleSubmit} className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
        {composerTitle}
      </h4>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter breaks the line — the usual chat contract.
          if (e.key === 'Enter' && !e.shiftKey) handleSubmit(e)
        }}
        rows={3}
        placeholder={placeholder}
        className={cn(
          'w-full px-3 py-2 rounded-lg border border-border text-sm text-foreground bg-card resize-none',
          'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors'
        )}
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">Enter envia · Shift+Enter quebra linha</span>
        <button
          type="submit"
          disabled={!draft.trim() || isPending}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          Publicar
        </button>
      </div>
    </form>
  )

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-muted shrink-0" />
            <div className="flex-1">
              <div className="h-3 w-32 bg-muted rounded mb-2" />
              <div className="h-4 w-full bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <MessageCircle className="w-8 h-8" />
        <div className="text-center">
          <p className="text-sm font-medium text-muted-foreground">
            Não foi possível carregar {title.toLowerCase()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Tente recarregar a página.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {composer}

      {comments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
          <MessageCircle className="w-7 h-7" />
          <p className="text-sm">Nada registrado ainda</p>
          <p className="text-xs text-muted-foreground">
            Registre aqui as tratativas e decisões deste {itemLabel}
          </p>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-6">
            <h3 className="text-sm font-semibold text-foreground/80">{title}</h3>
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
              {comments.length}
            </span>
          </div>

          <div className="space-y-4">
            {comments.map((comment) => {
              const authorName = comment.author
                ? getDisplayName(comment.author.full_name)
                : 'Alguém'

              return (
                <div key={comment.id} className="flex gap-3">
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-[11px] font-bold',
                      getAvatarTone(comment.author_id)
                    )}
                  >
                    {getInitials(authorName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-foreground">{authorName}</span>
                      <time className="text-xs text-muted-foreground">
                        {formatRelative(comment.created_at)}
                      </time>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap mt-0.5">
                      {comment.content}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
