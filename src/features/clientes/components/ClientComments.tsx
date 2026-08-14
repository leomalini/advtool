'use client'

import { CommentThread } from '@/components/shared/CommentThread'
import { useClientComments } from '../hooks/useClientes'
import { useAddClientComment } from '../hooks/useClienteMutations'

interface ClientCommentsProps {
  clientId: string
  /** Vai para o feed de atividades, ex. o nome do cliente. */
  entityTitle: string
}

/** Notas do cliente. Mesma apresentação da thread do caso — só a fonte muda. */
export function ClientComments({ clientId, entityTitle }: ClientCommentsProps) {
  const { data: comments = [], isLoading, isError } = useClientComments(clientId)
  const addComment = useAddClientComment(clientId, entityTitle)

  return (
    <CommentThread
      comments={comments}
      isLoading={isLoading}
      isError={isError}
      isPending={addComment.isPending}
      onSubmit={(content, onDone) => addComment.mutate(content, { onSuccess: onDone })}
      itemLabel="cliente"
      title="Notas"
      composerTitle="Adicionar nota"
      placeholder="Registre uma tratativa, decisão ou observação sobre o cliente..."
    />
  )
}
