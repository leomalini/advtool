'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Download, FileText, Search, Trash2, Upload, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
import { getClientDisplayName } from '@/types/cliente.types'
import {
  DOCUMENT_CATEGORY_LABELS,
  documentPermission,
  formatFileSize,
  getFileExtension,
  type DocumentCategory,
  type DocumentWithRelations,
} from '@/types/document.types'
import { useDocuments } from '../hooks/useDocuments'
import { useDeleteDocument, useOpenDocument } from '../hooks/useDocumentMutations'
import { Can } from '@/components/shared/Can'

const CATEGORIES = Object.keys(DOCUMENT_CATEGORY_LABELS) as DocumentCategory[]
const ALL = '__all__'
const TABLE_GRID = 'grid grid-cols-[1fr_170px_150px_110px_100px_76px]'

/** Cliente e processo de um documento. O anexo de lançamento não tem vínculo
 * próprio (migration 63): herda os do lançamento, para não aparecer solto. */
function documentOwners(doc: DocumentWithRelations) {
  return {
    client: doc.client ?? doc.financial_entry?.client ?? null,
    legalProcess: doc.legal_process ?? doc.financial_entry?.legal_process ?? null,
  }
}

export function DocumentosContent() {
  const { data: documents = [], isLoading } = useDocuments()
  const deleteDocument = useDeleteDocument()
  const openDocument = useOpenDocument()

  const [pendingDelete, setPendingDelete] = useState<DocumentWithRelations | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const qDigits = q.replace(/\D/g, '')

    return documents.filter((doc) => {
      if (categoryFilter && doc.category !== categoryFilter) return false
      if (!q) return true

      const { client, legalProcess } = documentOwners(doc)
      const haystack = [
        doc.file_name,
        client
          ? getClientDisplayName(client as Parameters<typeof getClientDisplayName>[0])
          : null,
        legalProcess?.cnj_number,
        doc.financial_entry?.description,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const matchesText = haystack.includes(q)
      const matchesDigits =
        qDigits.length > 0 &&
        (legalProcess?.cnj_number?.replace(/\D/g, '') ?? '').includes(qDigits)

      return matchesText || matchesDigits
    })
  }, [documents, search, categoryFilter])

  const hasFilters = search.trim() !== '' || categoryFilter !== null

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

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, cliente ou CNJ..."
            className="pl-8 h-9 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <Select
          value={categoryFilter ?? ALL}
          onValueChange={(v) => setCategoryFilter(v === ALL ? null : (v as DocumentCategory))}
        >
          <SelectTrigger className="h-9 w-[180px] text-sm">
            <SelectValue>
              {categoryFilter ? DOCUMENT_CATEGORY_LABELS[categoryFilter] : 'Todas as categorias'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as categorias</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {DOCUMENT_CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setCategoryFilter(null)
            }}
            className="h-9 text-muted-foreground"
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Limpar
          </Button>
        )}

        {documents.length > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} de {documents.length} arquivo{documents.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Tabela */}
      <Card>
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

                {filtered.map((doc) => {
                  const { client, legalProcess } = documentOwners(doc)

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
                          </p>
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
                          href={`/processos?id=${legalProcess.id}`}
                          className="text-xs font-mono text-muted-foreground truncate hover:text-foreground hover:underline"
                        >
                          {legalProcess.cnj_number ?? 'Sem CNJ'}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}

                      <span className="text-xs text-muted-foreground">
                        {DOCUMENT_CATEGORY_LABELS[doc.category]}
                      </span>

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
                        <Can {...documentPermission(doc.financial_entry_id, 'delete')}>
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
            </div>
          )}
        </CardContent>
      </Card>

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
