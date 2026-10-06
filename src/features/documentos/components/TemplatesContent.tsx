'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Download, FileSignature, FileText, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Can } from '@/components/shared/Can'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { DOCUMENT_CATEGORY_LABELS } from '@/types/document.types'
import type { DocumentTemplate } from '@/types/documentTemplate.types'
import { useDeleteTemplate, useDocumentTemplates } from '../hooks/useDocumentTemplates'
import { useOpenDocument } from '../hooks/useDocumentMutations'
import { GenerateDocumentDialog } from './GenerateDocumentDialog'
import { TemplateCatalogPanel } from './TemplateCatalogPanel'
import { TemplateFieldBadges } from './TemplateFieldBadges'
import { TemplateFormDialog } from './TemplateFormDialog'

/**
 * Modelos .docx do escritório. Aqui se sobe, define os campos, gera e remove
 * modelos; o Assistente usa os mesmos.
 */
export function TemplatesContent() {
  const { data: templates = [], isLoading } = useDocumentTemplates()
  const deleteTemplate = useDeleteTemplate()
  const openDocument = useOpenDocument()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<DocumentTemplate | null>(null)
  const [generating, setGenerating] = useState<DocumentTemplate | null>(null)
  const [pendingDelete, setPendingDelete] = useState<DocumentTemplate | null>(null)

  function openForm(template: DocumentTemplate | null) {
    setEditing(template)
    setFormOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Gere pelo botão <span className="font-medium text-foreground">Gerar</span> (aqui, no
          cliente ou no processo) ou peça no Assistente. O sistema preenche o cadastro, você
          completa os campos manuais e a IA redige os campos de texto — fonte, margens e timbre do
          modelo ficam como estão.
        </p>
        <Can resource="documentos" action="create">
          <Button size="sm" onClick={() => openForm(null)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Novo modelo
          </Button>
        </Can>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {isLoading &&
            [0, 1].map((index) => <Skeleton key={index} className="h-28 w-full rounded-lg" />)}

          {!isLoading && templates.length === 0 && (
            <EmptyState
              icon={FileText}
              title="Nenhum modelo ainda"
              description={
                'Suba um .docx com campos entre chaves para gerar documentos no formato do ' +
                'escritório.'
              }
            />
          )}

          {templates.map((template) => (
            <Card key={template.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{template.name}</p>
                      <Badge variant="secondary" className="text-[11px]">
                        {DOCUMENT_CATEGORY_LABELS[template.category]}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {template.file_name} · atualizado em{' '}
                      {format(parseISO(template.updated_at), "dd/MM/yyyy 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                  <Button size="sm" className="h-8" onClick={() => setGenerating(template)}>
                    <FileSignature className="h-4 w-4" />
                    Gerar
                  </Button>
                  <Can resource="documentos" action="update">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Editar ${template.name}`}
                      onClick={() => openForm(template)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </Can>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Baixar o arquivo de ${template.name}`}
                    onClick={() => openDocument.mutate(template.file_path)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Can resource="documentos" action="delete">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      aria-label={`Excluir ${template.name}`}
                      onClick={() => setPendingDelete(template)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </Can>
                </div>
                {template.description && (
                  <p className="text-sm text-muted-foreground">{template.description}</p>
                )}
                <TemplateFieldBadges fields={template.fields} settings={template.field_settings} />
              </CardContent>
            </Card>
          ))}
        </div>

        <TemplateCatalogPanel />
      </div>

      <TemplateFormDialog open={formOpen} onOpenChange={setFormOpen} template={editing} />

      <GenerateDocumentDialog
        open={generating !== null}
        onOpenChange={(open) => {
          if (!open) setGenerating(null)
        }}
        templateId={generating?.id}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title="Excluir modelo?"
        description={
          `"${pendingDelete?.name ?? ''}" deixa de estar disponível para gerar documentos. ` +
          'Documentos já gerados com ele não são afetados.'
        }
        confirmLabel="Excluir"
        isLoading={deleteTemplate.isPending}
        onConfirm={() => {
          if (!pendingDelete) return
          deleteTemplate.mutate(pendingDelete, { onSuccess: () => setPendingDelete(null) })
        }}
      />
    </div>
  )
}
