'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Download, FileText, Signature, Trash2, Upload } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Pagination } from '@/components/shared/Pagination'
import { useListPagination } from '@/hooks/useListPagination'
import { useSearchParamsMirror } from '@/hooks/useSearchParamsMirror'
import { slicePage } from '@/lib/pagination'
import { cn } from '@/lib/utils'
import { getDisplayName } from '@/utils/profile'
import { getClientDisplayName } from '@/types/cliente.types'
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_ORIGIN_LABELS,
  documentPermission,
  formatFileSize,
  getFileExtension,
  type DocumentCategory,
  type DocumentWithRelations,
} from '@/types/document.types'
import { useDocuments } from '../hooks/useDocuments'
import {
  useDeleteDocument,
  useOpenDocument,
  useUpdateDocumentCategory,
} from '../hooks/useDocumentMutations'
import { documentOwners, filterDocuments, type DocumentFilters } from '../utils/filterDocuments'
import { parseDocumentFilters, serializeDocumentFilters } from '../utils/documentFiltersUrl'
import { DocumentFilterBar } from './DocumentFilterBar'
import { Can } from '@/components/shared/Can'
import {
  DocumentSignatureDialogs,
  DocumentSignatureSealBadge,
  canSendDocumentForSignature,
  useDocumentSignatureSeals,
} from '@/features/assinaturas/components/DocumentSignature'

const CATEGORIES = Object.keys(DOCUMENT_CATEGORY_LABELS) as DocumentCategory[]
const TABLE_GRID = 'grid grid-cols-[1fr_170px_150px_200px_100px_104px]'
const ITEM_LABEL = { singular: 'documento', plural: 'documentos' }

export function DocumentosContent() {
  const { data: documents = [], isLoading } = useDocuments()
  const deleteDocument = useDeleteDocument()
  const openDocument = useOpenDocument()
  const updateCategory = useUpdateDocumentCategory()
  const searchParams = useSearchParams()

  const [pendingDelete, setPendingDelete] = useState<DocumentWithRelations | null>(null)
  // Os filtros partem da URL uma vez, ao montar; daí em diante a URL só os
  // espelha (useSearchParamsMirror).
  const [filters, setFilters] = useState<DocumentFilters>(() => parseDocumentFilters(searchParams))
  const signature = useDocumentSignatureSeals()
  const [sending, setSending] = useState<DocumentWithRelations | null>(null)
  const [viewing, setViewing] = useState<DocumentWithRelations | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(
    () => filterDocuments(documents, filters, signature.seals),
    [documents, filters, signature.seals]
  )

  // Fatiada no navegador (docs/paginacao.md): o filtro de assinatura depende
  // dos selos, calculados aqui sobre a lista inteira.
  const pagination = useListPagination({
    listKey: 'documentos',
    resetKey: JSON.stringify(filters),
    scrollContainerRef: listRef,
  })
  pagination.clampToTotal(isLoading ? undefined : filtered.length)
  const pageRows = slicePage(filtered, pagination.pageIndex, pagination.pageSize)

  useSearchParamsMirror({ ...serializeDocumentFilters(filters), ...pagination.urlParams })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Documentos</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Todos os arquivos do escritório</p>
      </div>

      {/* Não há upload avulso aqui: todo documento precisa de um dono (CHECK no
          banco), senão ninguém o encontra depois. O envio acontece na aba
          Documentos da entidade, e o arquivo aparece aqui automaticamente. */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Upload className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Para enviar um documento</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Abra o cliente, caso ou processo e use a aba <strong>Documentos</strong> — assim o
                arquivo já nasce vinculado e aparece aqui.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <DocumentFilterBar
        filters={filters}
        onChange={setFilters}
        signatureReady={signature.ready}
        resultCount={filtered.length}
        total={documents.length}
      />

      {/* Tabela */}
      <Card ref={listRef}>
        <CardContent className="p-0 pb-1">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <FileText className="w-7 h-7" />
              <p className="text-sm">Nenhum documento enviado</p>
              <p className="text-xs">Use a aba Documentos de um cliente, caso ou processo</p>
            </div>
          ) : (
            <div>
              <div
                className={cn(
                  TABLE_GRID,
                  'gap-3 px-4 py-2 bg-muted/30 border-y text-xs font-medium text-muted-foreground'
                )}
              >
                <span>Arquivo</span>
                <span>Cliente</span>
                <span>Processo</span>
                <span>Categoria</span>
                <span>Enviado</span>
                <span className="sr-only">Ações</span>
              </div>

              <div className="divide-y">
                {filtered.length === 0 && (
                  <div className="py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                      Nenhum documento com esses filtros.
                    </p>
                  </div>
                )}

                {pageRows.map((doc) => {
                  const { client, legalProcess } = documentOwners(doc)
                  const seal = signature.seals.get(doc.id)
                  const signedCopy =
                    seal?.kind === 'signed'
                      ? documents.find((item) => item.id === seal.signedDocumentId)
                      : undefined

                  return (
                    <div
                      key={doc.id}
                      className={cn(
                        TABLE_GRID,
                        'gap-3 px-4 py-3 items-center hover:bg-muted/20 transition-colors group'
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-[9px] font-bold text-muted-foreground">
                          {getFileExtension(doc.file_name)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm truncate">{doc.file_name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {formatFileSize(doc.file_size)}
                            {doc.uploader && ` · ${getDisplayName(doc.uploader.full_name)}`}
                            {doc.financial_entry &&
                              ` · Lançamento: ${doc.financial_entry.description}`}
                            {doc.contract && ` · Contrato: ${doc.contract.title}`}
                            {doc.task && ` · Tarefa: ${doc.task.title}`}
                            {doc.event && ` · Evento: ${doc.event.title}`}
                            {doc.origin && doc.origin !== 'upload' && (
                              <> · {DOCUMENT_ORIGIN_LABELS[doc.origin]}</>
                            )}
                          </p>
                          {seal && (
                            <div className="mt-0.5">
                              <DocumentSignatureSealBadge
                                seal={seal}
                                onOpen={() => setViewing(doc)}
                                onOpenSignedCopy={
                                  signedCopy
                                    ? () => openDocument.mutate(signedCopy.file_path)
                                    : undefined
                                }
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {client ? (
                        <Link
                          href={`/clientes/${client.id}`}
                          className="text-xs text-muted-foreground truncate hover:text-foreground hover:underline"
                        >
                          {getClientDisplayName(
                            client as Parameters<typeof getClientDisplayName>[0]
                          )}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}

                      {legalProcess ? (
                        <Link
                          href={`/processos/${legalProcess.id}`}
                          className="text-xs font-mono text-muted-foreground truncate hover:text-foreground hover:underline"
                        >
                          {legalProcess.cnj_number ?? 'Sem CNJ'}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}

                      {/* Reclassificar é editar o documento: segue o dono, como
                          a RLS de update. */}
                      <Can
                        {...documentPermission(doc, 'update')}
                        fallback={
                          <span className="text-xs text-muted-foreground truncate">
                            {DOCUMENT_CATEGORY_LABELS[doc.category]}
                          </span>
                        }
                      >
                        <Select
                          value={doc.category}
                          onValueChange={(v) =>
                            updateCategory.mutate({ id: doc.id, category: v as DocumentCategory })
                          }
                        >
                          <SelectTrigger
                            aria-label={`Categoria de ${doc.file_name}`}
                            className={cn(
                              'data-[size=default]:h-7 w-full min-w-0 px-1.5 text-xs text-muted-foreground',
                              'border-transparent bg-transparent dark:bg-transparent shadow-none hover:border-input'
                            )}
                          >
                            <SelectValue>{DOCUMENT_CATEGORY_LABELS[doc.category]}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>
                                {DOCUMENT_CATEGORY_LABELS[c]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Can>

                      <span className="text-xs text-muted-foreground">
                        {format(parseISO(doc.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                      </span>

                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          title="Abrir"
                          onClick={() => openDocument.mutate(doc.file_path)}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        {signature.ready && canSendDocumentForSignature(doc, seal) && (
                          <Can resource="documentos" action="update">
                            <button
                              type="button"
                              title="Enviar para assinatura"
                              onClick={() => setSending(doc)}
                              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <Signature className="w-3.5 h-3.5" />
                            </button>
                          </Can>
                        )}
                        <Can {...documentPermission(doc, 'delete')}>
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
                  )
                })}
              </div>

              {filtered.length > 0 && (
                <Pagination
                  className="mt-1 px-4"
                  pageIndex={pagination.pageIndex}
                  pageSize={pagination.pageSize}
                  total={filtered.length}
                  itemLabel={ITEM_LABEL}
                  onPageChange={pagination.setPageIndex}
                  onPageSizeChange={pagination.setPageSize}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <DocumentSignatureDialogs
        sending={sending}
        onSendingChange={setSending}
        viewing={viewing}
        onViewingChange={setViewing}
      />

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
