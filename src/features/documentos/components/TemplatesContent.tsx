'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Download, FileText, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Can } from '@/components/shared/Can'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { TEMPLATE_FIELD_CATALOG } from '@/features/ia/templates/catalog'
import type { DocumentTemplate } from '@/types/documentTemplate.types'
import { useDeleteTemplate, useDocumentTemplates } from '../hooks/useDocumentTemplates'
import { useOpenDocument } from '../hooks/useDocumentMutations'
import { TemplateFieldBadges } from './TemplateFieldBadges'
import { TemplateUploadDialog } from './TemplateUploadDialog'

/**
 * Modelos .docx do escritório, usados pelo Assistente para gerar petições no
 * formato original. Aqui se sobe, confere os campos e remove modelos.
 */
export function TemplatesContent() {
  const { data: templates = [], isLoading } = useDocumentTemplates()
  const deleteTemplate = useDeleteTemplate()
  const openDocument = useOpenDocument()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<DocumentTemplate | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          No Assistente, peça por exemplo “gere a petição inicial para a Maria Silva, no processo
          tal”. O sistema preenche os dados do cadastro e a IA redige os campos marcados com ✦ —
          fonte, margens e timbre do modelo ficam como estão.
        </p>
        <Can resource="documentos" action="create">
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Novo modelo
          </Button>
        </Can>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          {isLoading &&
            [0, 1].map((index) => <Skeleton key={index} className="h-28 w-full rounded-lg" />)}

          {!isLoading && templates.length === 0 && (
            <EmptyState
              icon={FileText}
              title="Nenhum modelo ainda"
              description="Suba um .docx com campos entre chaves para o Assistente gerar documentos no formato do escritório."
            />
          )}

          {templates.map((template) => (
            <Card key={template.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{template.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {template.file_name} · atualizado em{' '}
                      {format(parseISO(template.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Baixar ${template.name}`}
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
                <TemplateFieldBadges fields={template.fields} />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="h-fit">
          <CardContent className="space-y-3 p-4 text-sm">
            <div>
              <p className="font-semibold">Campos do cadastro</p>
              <p className="text-xs text-muted-foreground">
                Escreva no modelo exatamente assim, com as chaves. Qualquer outro nome entre
                chaves vira um campo ✦ que a IA redige — o nome é a instrução: {'{fatos}'},{' '}
                {'{pedidos}'}, {'{fundamentos}'}.
              </p>
            </div>
            <dl className="space-y-1.5">
              {TEMPLATE_FIELD_CATALOG.map((field) => (
                <div key={field.name}>
                  <dt className="font-mono text-xs">{`{${field.name}}`}</dt>
                  <dd className="text-xs text-muted-foreground">{field.description}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <TemplateUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title="Excluir modelo?"
        description={`"${pendingDelete?.name ?? ''}" deixa de estar disponível para o Assistente. Documentos já gerados com ele não são afetados.`}
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
