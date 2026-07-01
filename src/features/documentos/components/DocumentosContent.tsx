'use client'

import { useState, useMemo } from 'react'
import {
  FileText,
  FileArchive,
  File,
  Upload,
  Download,
  Eye,
  Search,
  FolderOpen,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { CASOS, AREAS_JURIDICAS } from '@/data/mock'
import type { Documento } from '@/data/mock'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────

type CategoriaFilter = 'todos' | Documento['categoria']

interface DocumentoEnriquecido extends Documento {
  clienteNome: string
  casoNome: string
  areaJuridica: string
}

// ── Helpers ────────────────────────────────────────────────────

const CATEGORIAS: { value: CategoriaFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'peticao', label: 'Petição' },
  { value: 'contrato', label: 'Contrato' },
  { value: 'procuracao', label: 'Procuração' },
  { value: 'decisao', label: 'Decisão' },
  { value: 'outros', label: 'Outros' },
]

const CATEGORIA_LABELS: Record<Documento['categoria'], string> = {
  peticao: 'Petição',
  contrato: 'Contrato',
  procuracao: 'Procuração',
  decisao: 'Decisão',
  outros: 'Outros',
}

const CATEGORIA_COLORS: Record<Documento['categoria'], string> = {
  peticao: 'bg-blue-50 text-blue-700 border-blue-200',
  contrato: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  procuracao: 'bg-violet-50 text-violet-700 border-violet-200',
  decisao: 'bg-amber-50 text-amber-700 border-amber-200',
  outros: 'bg-slate-50 text-slate-600 border-slate-200',
}

function FileIcon({ tipo, className }: { tipo: string; className?: string }) {
  const ext = tipo.toLowerCase()
  if (ext === 'pdf') {
    return (
      <div className={cn('flex items-center justify-center rounded-lg bg-red-50', className)}>
        <FileText className="h-5 w-5 text-red-500" />
      </div>
    )
  }
  if (ext === 'zip' || ext === 'rar') {
    return (
      <div className={cn('flex items-center justify-center rounded-lg bg-amber-50', className)}>
        <FileArchive className="h-5 w-5 text-amber-500" />
      </div>
    )
  }
  if (ext === 'doc' || ext === 'docx') {
    return (
      <div className={cn('flex items-center justify-center rounded-lg bg-blue-50', className)}>
        <FileText className="h-5 w-5 text-blue-500" />
      </div>
    )
  }
  return (
    <div className={cn('flex items-center justify-center rounded-lg bg-slate-100', className)}>
      <File className="h-5 w-5 text-slate-500" />
    </div>
  )
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}

// ── Upload Modal ───────────────────────────────────────────────

function UploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [isDragging, setIsDragging] = useState(false)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton={false} className="sm:max-w-[520px] p-0 gap-0 overflow-hidden">
        <div className="flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base font-semibold">Upload de Documento</DialogTitle>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-6 space-y-5">
            {/* Drag & Drop Area */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false) }}
              className={cn(
                'rounded-xl border-2 border-dashed px-8 py-12 flex flex-col items-center justify-center text-center transition-colors cursor-pointer',
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/40 hover:bg-muted/30',
              )}
            >
              <div className="rounded-full bg-muted p-4 mb-4">
                <Upload className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium mb-1">
                Arraste arquivos aqui ou clique para selecionar
              </p>
              <p className="text-xs text-muted-foreground">
                PDF, DOC, DOCX, ZIP — até 50 MB
              </p>
            </div>

            {/* Categoria */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Categoria</label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Selecionar categoria...</option>
                {CATEGORIAS.filter(c => c.value !== 'todos').map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Caso */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Caso relacionado</label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— Nenhum —</option>
                {CASOS.map(c => (
                  <option key={c.id} value={c.id}>{c.clienteNome}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t px-6 py-4 flex items-center justify-end gap-2 bg-muted/10">
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm">
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Fazer Upload
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Main Component ─────────────────────────────────────────────

export function DocumentosContent() {
  const [search, setSearch] = useState('')
  const [categoriaFilter, setCategoriaFilter] = useState<CategoriaFilter>('todos')
  const [clienteFilter, setClienteFilter] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)

  // Agregar todos documentos dos casos
  const todosDocumentos = useMemo<DocumentoEnriquecido[]>(() => {
    return CASOS.flatMap((caso) =>
      caso.documentos.map((doc) => ({
        ...doc,
        clienteNome: caso.clienteNome,
        casoNome: `${caso.clienteNome} — ${AREAS_JURIDICAS[caso.areaJuridica].label}`,
        areaJuridica: caso.areaJuridica,
      })),
    )
  }, [])

  const clientes = useMemo(() => {
    const map = new Map<string, string>()
    CASOS.forEach((c) => map.set(c.clienteId, c.clienteNome))
    return Array.from(map.entries()).map(([id, nome]) => ({ id, nome }))
  }, [])

  const documentosFiltrados = useMemo(() => {
    return todosDocumentos.filter((doc) => {
      const matchSearch =
        search === '' ||
        doc.nome.toLowerCase().includes(search.toLowerCase()) ||
        doc.clienteNome.toLowerCase().includes(search.toLowerCase())

      const matchCategoria = categoriaFilter === 'todos' || doc.categoria === categoriaFilter
      const matchCliente = clienteFilter === '' || doc.clienteId === clienteFilter

      return matchSearch && matchCategoria && matchCliente
    })
  }, [todosDocumentos, search, categoriaFilter, clienteFilter])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Documentos</h1>
          <span className="text-sm text-muted-foreground">
            {documentosFiltrados.length} documento{documentosFiltrados.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar documentos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 w-64 text-sm"
            />
          </div>
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Upload
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Categorias */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50">
          {CATEGORIAS.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategoriaFilter(cat.value)}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium transition-all',
                categoriaFilter === cat.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Filtro de cliente */}
        <select
          value={clienteFilter}
          onChange={(e) => setClienteFilter(e.target.value)}
          className="h-8 rounded-lg border border-input bg-background px-3 text-xs text-muted-foreground"
        >
          <option value="">Todos os clientes</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
      </div>

      {/* Lista */}
      {documentosFiltrados.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Nenhum documento encontrado"
          description="Faça o upload de documentos ou ajuste os filtros aplicados."
          action={
            <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Fazer Upload
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border overflow-hidden">
          {/* Cabeçalho da tabela */}
          <div className="grid grid-cols-[auto_1fr_130px_160px_160px_90px_130px_90px] items-center gap-4 px-4 py-2.5 bg-muted/30 border-b">
            <div className="w-9" />
            <span className="text-xs font-medium text-muted-foreground">Nome</span>
            <span className="text-xs font-medium text-muted-foreground">Categoria</span>
            <span className="text-xs font-medium text-muted-foreground">Cliente</span>
            <span className="text-xs font-medium text-muted-foreground">Caso</span>
            <span className="text-xs font-medium text-muted-foreground">Tamanho</span>
            <span className="text-xs font-medium text-muted-foreground">Upload em</span>
            <span className="text-xs font-medium text-muted-foreground text-right">Ações</span>
          </div>

          {/* Linhas */}
          <div className="divide-y">
            {documentosFiltrados.map((doc) => (
              <div
                key={doc.id}
                className="grid grid-cols-[auto_1fr_130px_160px_160px_90px_130px_90px] items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors group"
              >
                {/* Ícone */}
                <FileIcon tipo={doc.tipo} className="w-9 h-9" />

                {/* Nome */}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{doc.nome}</p>
                  <p className="text-xs text-muted-foreground">{doc.uploadPor}</p>
                </div>

                {/* Categoria */}
                <div>
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border',
                      CATEGORIA_COLORS[doc.categoria],
                    )}
                  >
                    {CATEGORIA_LABELS[doc.categoria]}
                  </span>
                </div>

                {/* Cliente */}
                <p className="text-xs text-muted-foreground truncate">{doc.clienteNome}</p>

                {/* Caso */}
                <p className="text-xs text-muted-foreground truncate">{doc.casoNome}</p>

                {/* Tamanho */}
                <p className="text-xs text-muted-foreground">{doc.tamanho}</p>

                {/* Data */}
                <p className="text-xs text-muted-foreground">{formatDate(doc.data)}</p>

                {/* Ações */}
                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    title="Visualizar"
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Download"
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  )
}
