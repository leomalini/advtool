'use client'

import { useState } from 'react'
import { AlertCircle, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DOCUMENT_CATEGORY_LABELS } from '@/types/document.types'
import {
  TEMPLATE_CATEGORIES,
  type DocumentTemplate,
  type TemplateCategory,
  type TemplateFieldSettings,
} from '@/types/documentTemplate.types'
import { useCreateTemplate, useUpdateTemplate } from '../hooks/useDocumentTemplates'
import { inspectTemplateFile } from '../services/templates.service'
import { TemplateFieldBadges } from './TemplateFieldBadges'
import { TemplateFieldDefinitions } from './TemplateFieldDefinitions'

interface TemplateFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Modelo em edição. Sem ele, a tela cria um modelo novo. */
  template?: DocumentTemplate | null
}

/** Cadastro e edição de um modelo: arquivo, nome, categoria e a definição dos
 * campos que não são do cadastro. */
export function TemplateFormDialog({
  open,
  onOpenChange,
  template = null,
}: TemplateFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {/* Montado a cada abertura: o formulário começa limpo (ou com o modelo
            em edição) sem precisar de reset. */}
        {open && <TemplateFormBody template={template} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

type Inspection =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'ok'; fields: string[] }
  | { status: 'error'; message: string }

function TemplateFormBody({
  template,
  onClose,
}: {
  template: DocumentTemplate | null
  onClose: () => void
}) {
  const createTemplate = useCreateTemplate()
  const updateTemplate = useUpdateTemplate()
  const [name, setName] = useState(template?.name ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [category, setCategory] = useState<TemplateCategory>(template?.category ?? 'peticao')
  const [file, setFile] = useState<File | null>(null)
  const [inspection, setInspection] = useState<Inspection>({ status: 'idle' })
  const [settings, setSettings] = useState<TemplateFieldSettings>(template?.field_settings ?? {})

  // Arquivo novo manda; sem ele, valem os campos do arquivo atual do modelo.
  const fields = inspection.status === 'ok' ? inspection.fields : (template?.fields ?? [])
  const isPending = createTemplate.isPending || updateTemplate.isPending
  const fileReady = template
    ? inspection.status === 'idle' || inspection.status === 'ok'
    : inspection.status === 'ok'
  const canSave = fileReady && name.trim().length > 0 && !isPending

  async function handleFile(selected: File | null) {
    setFile(selected)
    if (!selected) {
      setInspection({ status: 'idle' })
      return
    }
    // O nome do arquivo é um bom ponto de partida para o nome do modelo.
    if (!name.trim()) setName(selected.name.replace(/\.docx$/i, ''))
    setInspection({ status: 'reading' })
    try {
      setInspection({ status: 'ok', fields: await inspectTemplateFile(selected) })
    } catch (error) {
      setInspection({
        status: 'error',
        message: error instanceof Error ? error.message : 'Não foi possível ler o arquivo.',
      })
    }
  }

  async function handleSubmit() {
    if (!canSave) return
    const input = { name, description, category, fieldSettings: settings }
    if (template) {
      await updateTemplate.mutateAsync({ template, input: { ...input, file } })
    } else if (file) {
      await createTemplate.mutateAsync({ ...input, file })
    }
    onClose()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{template ? 'Editar modelo' : 'Novo modelo'}</DialogTitle>
        <DialogDescription>
          Um .docx do escritório com campos entre chaves, como {'{cliente_nome}'} ou{' '}
          {'{valor_honorarios}'}. A formatação do arquivo é mantida no documento gerado.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="template-file">{template ? 'Arquivo' : 'Arquivo (.docx)'}</Label>
          {template && !file && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">{template.file_name}</span>
            </p>
          )}
          <Input
            id="template-file"
            type="file"
            accept=".docx"
            onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
          />
          {template && (
            <p className="text-xs text-muted-foreground">
              Envie um arquivo só para trocar o atual. As definições dos campos que continuarem no
              arquivo novo são mantidas.
            </p>
          )}
        </div>

        {inspection.status === 'reading' && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Lendo os campos do modelo…
          </p>
        )}
        {inspection.status === 'error' && (
          <p className="flex gap-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {inspection.message}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Nome</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Procuração ad judicia"
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as TemplateCategory)}
            >
              <SelectTrigger className="h-9" aria-label="Categoria">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_CATEGORIES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {DOCUMENT_CATEGORY_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="template-description">Descrição (opcional)</Label>
          <Textarea
            id="template-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Quando usar este modelo — o Assistente lê isto para escolher o certo."
            rows={2}
            maxLength={500}
          />
        </div>

        {(inspection.status === 'ok' || (template && inspection.status === 'idle')) && (
          <>
            <div className="space-y-1.5">
              <Label>Campos encontrados</Label>
              <TemplateFieldBadges fields={fields} settings={settings} />
            </div>
            <div className="space-y-1.5">
              <Label>Campos que não são do cadastro</Label>
              <TemplateFieldDefinitions
                fields={fields}
                settings={settings}
                onChange={setSettings}
              />
            </div>
          </>
        )}
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => void handleSubmit()} disabled={!canSave}>
          {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Salvar modelo
        </Button>
      </DialogFooter>
    </>
  )
}
