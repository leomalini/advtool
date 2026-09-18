'use client'

import { useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { useCreateTemplate } from '../hooks/useDocumentTemplates'
import { inspectTemplateFile } from '../services/templates.service'
import { TemplateFieldBadges } from './TemplateFieldBadges'

interface TemplateUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Inspection =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'ok'; fields: string[] }
  | { status: 'error'; message: string }

export function TemplateUploadDialog({ open, onOpenChange }: TemplateUploadDialogProps) {
  const createTemplate = useCreateTemplate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [inspection, setInspection] = useState<Inspection>({ status: 'idle' })

  function reset() {
    setName('')
    setDescription('')
    setFile(null)
    setInspection({ status: 'idle' })
  }

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
    if (!file || inspection.status !== 'ok' || !name.trim()) return
    await createTemplate.mutateAsync({ name, description, file })
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo modelo</DialogTitle>
          <DialogDescription>
            Um .docx do escritório com campos entre chaves, como {'{cliente_nome}'} ou{' '}
            {'{fatos}'}. A formatação do arquivo é mantida na petição gerada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="template-file">Arquivo (.docx)</Label>
            <Input
              id="template-file"
              type="file"
              accept=".docx"
              onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
            />
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
          {inspection.status === 'ok' && (
            <div className="space-y-1.5">
              <Label>Campos encontrados</Label>
              <TemplateFieldBadges fields={inspection.fields} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="template-name">Nome</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Petição inicial — indenização"
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="template-description">Descrição (opcional)</Label>
            <Textarea
              id="template-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Quando usar este modelo — a IA lê isto para escolher o modelo certo."
              rows={3}
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={inspection.status !== 'ok' || !name.trim() || createTemplate.isPending}
          >
            {createTemplate.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Salvar modelo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
