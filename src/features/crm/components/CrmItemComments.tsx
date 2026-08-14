'use client'

import { CommentThread } from '@/components/shared/CommentThread'
import { useCrmItemComments, useAddCrmItemComment } from '../hooks/useCrmItemComments'

interface CrmItemCommentsProps {
  /** Where new comments are written. In the Processo page this is the master item. */
  crmItemId: string
  /**
   * Which items to read from. A processo can own several CRM cards, and a
   * comment written from a Negociação card lives on that card — reading only
   * the master would split one conversation into threads neither side can see.
   * Defaults to just `crmItemId`.
   */
  readCrmItemIds?: string[]
  /** Used as the activity feed title, e.g. the client name. */
  entityTitle: string
  /** Shown in the empty-state hint, e.g. "caso" or "processo". */
  itemLabel?: string
}

/** Thread do caso/processo. A apresentação vive em `CommentThread`, compartilhada
 * com as notas do cliente — as tabelas são separadas, a UI não. */
export function CrmItemComments({
  crmItemId,
  readCrmItemIds,
  entityTitle,
  itemLabel = 'item',
}: CrmItemCommentsProps) {
  const ids = readCrmItemIds?.length ? readCrmItemIds : [crmItemId]
  const { data: comments = [], isLoading, isError } = useCrmItemComments(ids)
  const addComment = useAddCrmItemComment(crmItemId, entityTitle)

  return (
    <CommentThread
      comments={comments}
      isLoading={isLoading}
      isError={isError}
      isPending={addComment.isPending}
      onSubmit={(content, onDone) => addComment.mutate(content, { onSuccess: onDone })}
      itemLabel={itemLabel}
    />
  )
}
