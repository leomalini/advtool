'use client'

import { useCallback, useState } from 'react'
import type { FileUIPart } from 'ai'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import {
  AI_FILES_PER_MESSAGE,
  AI_FILE_MAX_BYTES,
  aiFileTypeFromName,
  toAiFileUrl,
} from '../files/constants'
import { AiFileError, uploadAiFile, type RegisteredAiFile } from '../services/aiFiles.service'

export type AttachmentStatus = 'uploading' | 'ready' | 'error'

export interface ChatAttachment {
  localId: string
  file: File
  status: AttachmentStatus
  registered?: RegisteredAiFile
}

/**
 * Anexos da próxima mensagem. Cada arquivo sobe assim que é escolhido — quando
 * o usuário termina de digitar, o upload já acabou —, e o envio fica bloqueado
 * enquanto algum ainda está subindo.
 */
export function useChatAttachments(conversationId: string) {
  const { user } = useAuth()
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])

  const update = useCallback((localId: string, patch: Partial<ChatAttachment>) => {
    setAttachments((current) =>
      current.map((attachment) =>
        attachment.localId === localId ? { ...attachment, ...patch } : attachment,
      ),
    )
  }, [])

  const add = useCallback(
    (files: File[]) => {
      if (!user) return

      const accepted: ChatAttachment[] = []
      for (const file of files) {
        if (attachments.length + accepted.length >= AI_FILES_PER_MESSAGE) {
          toast.error(`No máximo ${AI_FILES_PER_MESSAGE} arquivos por mensagem.`)
          break
        }
        if (!aiFileTypeFromName(file.name)) {
          toast.error(`${file.name}: formato não suportado.`)
          continue
        }
        if (file.size > AI_FILE_MAX_BYTES) {
          toast.error(`${file.name} passa de 25 MB.`)
          continue
        }
        accepted.push({ localId: crypto.randomUUID(), file, status: 'uploading' })
      }
      if (accepted.length === 0) return

      setAttachments((current) => [...current, ...accepted])

      for (const attachment of accepted) {
        uploadAiFile({ file: attachment.file, userId: user.id, conversationId })
          .then((registered) => update(attachment.localId, { status: 'ready', registered }))
          .catch((error: unknown) => {
            console.error('[ia] anexo falhou:', error)
            toast.error(
              error instanceof AiFileError
                ? error.message
                : `Não foi possível enviar ${attachment.file.name}.`,
            )
            update(attachment.localId, { status: 'error' })
          })
      }
    },
    [attachments.length, conversationId, update, user],
  )

  const remove = useCallback((localId: string) => {
    // O arquivo já registrado continua no bucket da conversa, só não vai nesta
    // mensagem; some junto quando a conversa é excluída.
    setAttachments((current) => current.filter((attachment) => attachment.localId !== localId))
  }, [])

  const clear = useCallback(() => setAttachments([]), [])

  const fileParts: FileUIPart[] = attachments.flatMap((attachment) =>
    attachment.status === 'ready' && attachment.registered
      ? [
          {
            type: 'file',
            mediaType: attachment.registered.mediaType,
            filename: attachment.registered.fileName,
            url: toAiFileUrl(attachment.registered.id),
          },
        ]
      : [],
  )

  return {
    attachments,
    fileParts,
    isUploading: attachments.some((attachment) => attachment.status === 'uploading'),
    add,
    remove,
    clear,
  }
}
