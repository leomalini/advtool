'use client'

import { useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Download, FileText, Loader2, Trash2, Upload } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { cn } from '@/lib/utils'
import { getDisplayName } from '@/utils/profile'
import {
  DOCUMENT_CATEGORY_LABELS,
  formatFileSize,
  getFileExtension,
  type DocumentCategory,
  type DocumentWithRelations,
} from '@/types/document.types'
import { MAX_FILE_SIZE } from '@/schemas/document.schema'
import { useDocumentsForEntity } from '../hooks/useDocuments'
import {
  useUploadDocument,
  useDeleteDocument,
  useOpenDocument,
} from '../hooks/useDocumentMutations'
import { Can } from '@/components/shared/Can'

const CATEGORIES = Object.keys(DOCUMENT_CATEGORY_LABELS) as DocumentCategory[]

interface DocumentsTabProps {
  legalProcessId?: string | null
  crmItemIds?: string[]
  clientId?: string | null
  eventId?: string | null
  /** Onde novos arquivos são gravados. */
  lockedLegalProcessId?: string | null
  lockedCrmItemId?: string | null
  lockedClientId?: string | null
  lockedEventId?: string | null
  itemLabel?: string
}

/** Aba Documentos — compartilhada entre CasoModal, a página do processo e
 * a página do cliente, para os três ficarem idênticos. */
export function DocumentsTab({
  legalProcessId,
  crmItemIds,
  clientId,
  eventId,
  lockedLegalProcessId,
  lockedCrmItemId,
  lockedClientId,
  lockedEventId,
  itemLabel = 'item',
}: DocumentsTabProps) {
  const { data: documents = [], isLoading, isError } = useDocumentsForEntity({
    legalProcessId,
    crmItemIds,
    clientId,
    eventId,
  })
  const uploadDocument = useUploadDocument()
  const deleteDocument = useDeleteDocument()
  const openDocument = useOpenDocument()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [category, setCategory] = useState<DocumentCategory>('outros')
  const [pendingDelete, setPendingDelete] = useState<DocumentWithRelations | null>(null)
  const [sizeError, setSizeError] = useState<string | null>(null)

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setSizeError(null)

    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        setSizeError(`"${file.name}" passa de ${formatFileSize(MAX_FILE_SIZE)} e não foi enviado.`)
        continue
      }
      uploadDocument.mutate({
        input: {
          category,
          legal_process_id: lockedLegalProcessId ?? '',
          crm_item_id: lockedCrmItemId ?? '',
          client_id: lockedClientId ?? '',
          event_id: lockedEventId ?? '',
        },
        file,
      })
    }

    // Permite reenviar o mesmo arquivo: sem isto o input não dispara change.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <FileText className="w-8 h-8" />
        <div className="text-center">
          <p className="text-sm font-medium">Não foi possível carregar os documentos</p>
          <p className="text-xs mt-1">Tente fechar e abrir novamente.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground/80">Documentos</h3>
          {documents.length > 0 && (
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
              {documents.length}
            </span>
          )}
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v as DocumentCategory)}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {DOCUMENT_CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Dropzone */}
      <Can resource="documentos" action="create">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-foreground/30 hover:bg-muted/30'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {uploadDocument.isPending ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Enviando...</p>
          </>
        ) : (
          <>
            <Upload className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-foreground/80">
              Arraste arquivos aqui ou <span className="text-primary">clique para escolher</span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              Serão salvos como{' '}
              <strong className="font-medium">{DOCUMENT_CATEGORY_LABELS[category]}</strong> · até{' '}
              {formatFileSize(MAX_FILE_SIZE)}
            </p>
          </>
        )}
      </div>
      </Can>

      {sizeError && <p className="text-xs text-destructive">{sizeError}</p>}

      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
          <FileText className="w-7 h-7" />
          <p className="text-sm">Nenhum documento</p>
          <p className="text-xs">Petições, contratos e procurações deste {itemLabel} ficam aqui</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 rounded-lg border border-border p-3 group"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-[9px] font-bold text-muted-foreground">
                {getFileExtension(doc.file_name)}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{doc.file_name}</p>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                  <span>{DOCUMENT_CATEGORY_LABELS[doc.category]}</span>
                  <span>·</span>
                  <span>{formatFileSize(doc.file_size)}</span>
                  <span>·</span>
                  <span>{format(parseISO(doc.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span>
                  {doc.uploader && (
                    <>
                      <span>·</span>
                      <span className="truncate">{getDisplayName(doc.uploader.full_name)}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  title="Abrir"
                  onClick={() => openDocument.mutate(doc.file_path)}
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <Can resource="documentos" action="delete">
                  <button
                    type="button"
                    title="Excluir"
                    onClick={() => setPendingDelete(doc)}
                    className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </Can>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Excluir documento"
        description={`"${pendingDelete?.file_name}" será removido permanentemente, junto com o arquivo.`}
        isLoading={deleteDocument.isPending}
        onConfirm={() => {
          if (!pendingDelete) return
          deleteDocument.mutate(
            { id: pendingDelete.id, filePath: pendingDelete.file_path },
            { onSuccess: () => setPendingDelete(null) }
          )
        }}
      />
    </div>
  )
}
