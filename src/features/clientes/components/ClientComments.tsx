'use client'

import { CommentThread } from '@/components/shared/CommentThread'
import { useClientComments } from '../hooks/useClientes'
import { useAddClientComment } from '../hooks/useClienteMutations'
import type { RecordKind } from '@/types/cliente.types'

interface ClientCommentsProps {
  clientId: string
  /** Vai para o feed de atividades, ex. o nome do cliente. */
  entityTitle: string
  /** Pessoa que não é cliente usa a mesma tabela de notas (migration 78). */
  kind?: RecordKind
}

/** Notas do cliente. Mesma apresentação da thread do caso — só a fonte muda. */
export function ClientComments({ clientId, entityTitle, kind = 'client' }: ClientCommentsProps) {
  const { data: comments = [], isLoading, isError } = useClientComments(clientId)
  const addComment = useAddClientComment(clientId, entityTitle)

  return (
    <CommentThread
      comments={comments}
      isLoading={isLoading}
      isError={isError}
      isPending={addComment.isPending}
      onSubmit={(content, onDone) => addComment.mutate(content, { onSuccess: onDone })}
      itemLabel={kind === 'person' ? 'cadastro' : 'cliente'}
      title="Notas"
      composerTitle="Adicionar nota"
      placeholder={
        kind === 'person'
          ? 'Registre uma tratativa, decisão ou observação sobre esta pessoa...'
          : 'Registre uma tratativa, decisão ou observação sobre o cliente...'
      }
    />
  )
}
