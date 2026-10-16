'use client'

import { useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Download, FileSignature, FileText, Loader2, Paperclip, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Can } from '@/components/shared/Can'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useDocumentsForEntity } from '@/features/documentos/hooks/useDocuments'
import { useDeleteDocument, useOpenDocument } from '@/features/documentos/hooks/useDocumentMutations'
import { MAX_FILE_SIZE } from '@/schemas/document.schema'
import {
  CONTRACT_FILE_ROLE_LABELS,
  CONTRACT_FILE_ROLES,
  sourceKindLabel,
  type ContractFileRole,
  type ContractWithRelations,
} from '@/types/contract.types'
import {
  documentPermission,
  formatFileSize,
  getFileExtension,
  type DocumentWithRelations,
} from '@/types/document.types'
import { getDisplayName } from '@/utils/profile'
import { useUploadContractFiles } from '../hooks/useContractMutations'

const GROUP_HINTS: Record<ContractFileRole, string> = {
  minuta: 'Versões para revisar e enviar',
  assinado: 'O contrato como foi assinado',
  anexo: 'Documentos das partes, comprovantes',
}

interface ContractFilesSectionProps {
  contract: ContractWithRelations
  /** Abre a tela de geração — mora na página, porque os passos também a abrem. */
  onGenerate: () => void
  /** Nome de cada parte, para mostrar de quem é o documento lido. */
  partyNames: ReadonlyMap<string, string>
}

/** Os arquivos do contrato, separados pelo papel de cada um. */
export function ContractFilesSection({ contract, onGenerate, partyNames }: ContractFilesSectionProps) {
  const { data: documents = [], isLoading } = useDocumentsForEntity({ contractId: contract.id })
  const uploadFiles = useUploadContractFiles()
  const deleteDocument = useDeleteDocument()
  const openDocument = useOpenDocument()
  const inputRef = useRef<HTMLInputElement>(null)
  const [role, setRole] = useState<ContractFileRole>(
    contract.status === 'rascunho' || contract.status === 'aguardando_assinatura'
      ? 'minuta'
      : 'assinado'
  )
  const [pendingDelete, setPendingDelete] = useState<DocumentWithRelations | null>(null)
  const hasMinuta = documents.some((document) => document.contract_file_role === 'minuta')
  const [sizeError, setSizeError] = useState<string | null>(null)

  const uploadPermission = documentPermission({ contract_id: contract.id }, 'upload')

  function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    setSizeError(null)
    const accepted = Array.from(list).filter((file) => {
      if (file.size <= MAX_FILE_SIZE) return true
      setSizeError(`"${file.name}" passa de ${formatFileSize(MAX_FILE_SIZE)} e não foi enviado.`)
      return false
    })
    if (accepted.length > 0) {
      uploadFiles.mutate({
        contractId: contract.id,
        files: accepted.map((file) => ({ file, role })),
      })
    }
    // Permite reenviar o mesmo arquivo: sem isto o input não dispara change.
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Arquivos</h2>
          {documents.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {documents.length}
            </span>
          )}
        </div>
        <Can {...uploadPermission}>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={onGenerate}>
              <FileSignature className="h-3.5 w-3.5" />
              {hasMinuta ? 'Gerar nova versão' : 'Gerar minuta'}
            </Button>
            <Select value={role} onValueChange={(value) => setRole(value as ContractFileRole)}>
              <SelectTrigger className="h-8 w-[120px] text-xs" aria-label="Anexar como">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTRACT_FILE_ROLES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {CONTRACT_FILE_ROLE_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={uploadFiles.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {uploadFiles.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Paperclip className="h-3.5 w-3.5" />
              )}
              Anexar
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => handleFiles(event.target.files)}
            />
          </div>
        </Can>
      </div>

      {sizeError && <p className="text-xs text-destructive">{sizeError}</p>}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((index) => (
            <div key={index} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
          <FileText className="h-7 w-7" />
          <p className="text-sm">Nenhum arquivo ainda</p>
          <p className="text-xs">Anexe a minuta ou a versão assinada, ou gere a minuta de um modelo</p>
        </div>
      ) : (
        <div className="space-y-4">
          {CONTRACT_FILE_ROLES.map((group) => {
            const items = documents.filter((document) => document.contract_file_role === group)
            if (items.length === 0) return null
            return (
              <div key={group} className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-wider">
                    {CONTRACT_FILE_ROLE_LABELS[group]}
                  </span>
                  {' · '}
                  {GROUP_HINTS[group]}
                </p>
                {items.map((document) => (
                  <div
                    key={document.id}
                    className="group flex items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-[9px] font-bold text-muted-foreground">
                      {getFileExtension(document.file_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{document.file_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[
                          sourceKindLabel(document.source_kind),
                          document.contract_party_id
                            ? partyNames.get(document.contract_party_id)
                            : null,
                        ]
                          .filter(Boolean)
                          .map((label) => `${label} · `)
                          .join('')}
                        {formatFileSize(document.file_size)} ·{' '}
                        {format(parseISO(document.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                        {document.uploader && ` · ${getDisplayName(document.uploader.full_name)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        title="Abrir"
                        onClick={() => openDocument.mutate(document.file_path)}
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <Can {...documentPermission(document, 'delete')}>
                        <button
                          type="button"
                          title="Excluir"
                          onClick={() => setPendingDelete(document)}
                          className="rounded p-1.5 text-muted-foreground opacity-0 transition-colors group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </Can>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Excluir arquivo"
        description={`"${pendingDelete?.file_name}" será removido permanentemente.`}
        isLoading={deleteDocument.isPending}
        onConfirm={() => {
          if (!pendingDelete) return
          deleteDocument.mutate(
            { id: pendingDelete.id, filePath: pendingDelete.file_path },
            { onSuccess: () => setPendingDelete(null) }
          )
        }}
      />
    </section>
  )
}
