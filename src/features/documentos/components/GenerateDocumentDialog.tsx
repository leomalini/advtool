'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Download, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ClienteCombobox } from '@/features/clientes/components/ClienteCombobox'
import { useClientes } from '@/features/clientes/hooks/useClientes'
import { aiFileTypeFromName } from '@/features/ia/files/constants'
import {
  useLegalProcess,
  useLegalProcessesByClient,
} from '@/features/processos/hooks/useLegalProcesses'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { useProfiles } from '@/hooks/useProfiles'
import { getClientDisplayName } from '@/types/cliente.types'
import { DOCUMENT_CATEGORY_LABELS } from '@/types/document.types'
import { TEMPLATE_CATEGORIES } from '@/types/documentTemplate.types'
import { getCrmItemClientName } from '@/types/crmItem.types'
import { toSafeFileName } from '@/utils/download'
import { useDocumentTemplates } from '../hooks/useDocumentTemplates'
import { useDocumentsForEntity } from '../hooks/useDocuments'
import { useDraftTemplateTexts } from '../hooks/useDraftTemplateTexts'
import {
  useGenerateDocument,
  useProcessClientId,
  useTemplateFieldValues,
} from '../hooks/useGenerateDocument'
import { catalogEntry, type CatalogGroup } from '../templates/catalog'
import { DRAFT_MAX_DOCUMENTS } from '../templates/drafting'
import { classifyTemplateFields } from '../templates/fieldSettings'
import { buildTemplateValues, missingFields } from '../templates/values'
import { GenerateAiFields } from './GenerateAiFields'
import { GenerateCadastroFields } from './GenerateCadastroFields'
import { GenerateLawyerPicker } from './GenerateLawyerPicker'
import { GenerateManualFields } from './GenerateManualFields'

interface GenerateDocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Modelo já escolhido (botão "Gerar" da aba Modelos). */
  templateId?: string
  /** Cliente fixo (página do cliente). */
  clientId?: string
  /** Processo fixo (página do processo). O cliente vem dele. */
  processId?: string
}

/**
 * Gera um documento a partir de um modelo: cadastro lido do banco, campos
 * manuais digitados, texto da IA revisado — e o .docx montado no navegador,
 * para baixar e, se quiser, guardar no cliente/processo.
 */
export function GenerateDocumentDialog({
  open,
  onOpenChange,
  templateId,
  clientId,
  processId,
}: GenerateDocumentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        {/* Montado a cada abertura: começa limpo, sem reset manual. */}
        {open && (
          <GenerateDocumentBody
            initialTemplateId={templateId}
            fixedClientId={clientId}
            fixedProcessId={processId}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}

function GenerateDocumentBody({
  initialTemplateId,
  fixedClientId,
  fixedProcessId,
  onClose,
}: {
  initialTemplateId?: string
  fixedClientId?: string
  fixedProcessId?: string
  onClose: () => void
}) {
  const { user } = useAuth()
  const { can } = usePermissions()
  const { data: templates = [], isLoading: templatesLoading } = useDocumentTemplates()
  const { data: profiles = [] } = useProfiles()
  const { data: clients = [] } = useClientes()
  const generate = useGenerateDocument()
  const draft = useDraftTemplateTexts()

  const [templateId, setTemplateId] = useState<string | null>(initialTemplateId ?? null)
  /** undefined = ainda não escolhido: vale o cliente do processo. */
  const [clientChoice, setClientChoice] = useState<string | null | undefined>(undefined)
  const [processChoice, setProcessChoice] = useState<string | null>(null)
  /** null = ainda não escolhido: vale a sugestão (quem gera, se tiver OAB). */
  const [lawyerChoice, setLawyerChoice] = useState<string[] | null>(null)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [manual, setManual] = useState<Record<string, string>>({})
  const [aiTexts, setAiTexts] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [documentIds, setDocumentIds] = useState<string[]>([])
  const [draftingFields, setDraftingFields] = useState<string[] | null>(null)

  const template = templates.find((item) => item.id === templateId) ?? null
  const classified = useMemo(
    () => (template ? classifyTemplateFields(template.fields, template.field_settings) : null),
    [template],
  )

  const processClient = useProcessClientId(fixedClientId ? null : fixedProcessId)
  const clientId =
    fixedClientId ?? (clientChoice !== undefined ? clientChoice : (processClient.data ?? null))
  const processId = fixedProcessId ?? processChoice

  const { data: fixedProcess } = useLegalProcess(fixedProcessId ?? '')
  const { data: clientProcesses = [] } = useLegalProcessesByClient(
    fixedProcessId ? '' : (clientId ?? ''),
  )

  const lawyers = useMemo(
    () => profiles.filter((profile) => profile.is_active && profile.oab_number),
    [profiles],
  )
  const suggestedLawyerIds = useMemo(() => {
    if (user && lawyers.some((lawyer) => lawyer.id === user.id)) return [user.id]
    return lawyers.length === 1 ? [lawyers[0].id] : []
  }, [lawyers, user])
  const lawyerIds = lawyerChoice ?? suggestedLawyerIds

  const usesGroup = (group: CatalogGroup) =>
    classified?.cadastro.some((field) => catalogEntry(field).group === group) ?? false

  const resolution = useTemplateFieldValues({
    templateId,
    fields: classified?.cadastro ?? [],
    clientId,
    processId,
    lawyerIds,
  })

  const { data: entityDocuments = [] } = useDocumentsForEntity({
    clientId,
    legalProcessId: processId,
  })
  // Só o que a IA consegue ler (PDF, imagem, Word, Excel, CSV, TXT).
  const readableDocuments = entityDocuments.filter((document) =>
    aiFileTypeFromName(document.file_name),
  )

  const values = classified
    ? buildTemplateValues({
        classified,
        cadastro: resolution.data?.values ?? {},
        cadastroOverrides: overrides,
        manual,
        ai: aiTexts,
      })
    : {}
  const missing = classified && !resolution.isLoading ? missingFields(values) : []

  const clientName = (() => {
    const client = clients.find((item) => item.id === clientId)
    return client ? getClientDisplayName(client) : null
  })()
  const canSave = can('documentos', 'create') && (!!clientId || !!processId)

  /** Troca de contexto invalida o que foi digitado por cima do cadastro
   * daquele grupo — um endereço corrigido do cliente A não vale para o B. */
  function dropOverrides(groups: CatalogGroup[]) {
    setOverrides((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([name]) => {
          const field = classified?.cadastro.find((item) => item === name)
          return !field || !groups.includes(catalogEntry(field).group)
        }),
      ),
    )
  }

  function selectTemplate(id: string) {
    setTemplateId(id)
    setOverrides({})
    setManual({})
    setAiTexts({})
  }

  function selectClient(id: string | null) {
    setClientChoice(id)
    setProcessChoice(null)
    setDocumentIds([])
    dropOverrides(['cliente', 'processo'])
  }

  function selectProcess(id: string | null) {
    setProcessChoice(id)
    setDocumentIds([])
    dropOverrides(['processo'])
  }

  function selectLawyers(ids: string[]) {
    setLawyerChoice(ids)
    dropOverrides(['advogado'])
  }

  function setOverride(name: string, value: string | null) {
    setOverrides((current) => {
      const next = { ...current }
      if (value === null) delete next[name]
      else next[name] = value
      return next
    })
  }

  function toggleDocument(id: string) {
    setDocumentIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length >= DRAFT_MAX_DOCUMENTS
          ? current
          : [...current, id],
    )
  }

  async function handleDraft(fields: string[]) {
    if (!template || fields.length === 0) return
    setDraftingFields(fields)
    try {
      const { texts, skipped } = await draft.mutateAsync({
        templateId: template.id,
        clientId,
        processId,
        notes,
        documentIds,
        fields,
      })
      setAiTexts((current) => ({ ...current, ...texts }))
      if (skipped.length > 0) toast.warning(`A IA não leu: ${skipped.join('; ')}.`)
      const untouched = fields.filter((field) => !texts[field])
      if (untouched.length > 0) {
        toast.warning(`A IA não devolveu texto para: ${untouched.join(', ')}.`)
      }
    } catch {
      // O aviso já saiu pelo onError do hook; o texto digitado fica como estava.
    } finally {
      setDraftingFields(null)
    }
  }

  function handleGenerate(save: boolean) {
    if (!template || !classified) return
    const fileName = toSafeFileName([template.name, clientName].filter(Boolean).join(' - '), 'docx')
    generate.mutate(
      { template, values, fileName, saveTo: save ? { clientId, processId } : null },
      {
        onSuccess: ({ saved }) => {
          // Baixar sem salvar deixa a tela aberta: dá para ajustar e baixar de novo.
          if (saved) onClose()
        },
      },
    )
  }

  const busy = generate.isPending || draftingFields !== null

  return (
    <>
      <DialogHeader>
        <DialogTitle>Gerar documento</DialogTitle>
        <DialogDescription>
          O sistema preenche o que está no cadastro; você completa o resto e revisa antes de
          baixar. O arquivo sai em .docx, com a formatação do modelo.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6">
        <Section title="Modelo">
          {!templatesLoading && templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum modelo cadastrado ainda.{' '}
              <Link
                href="/documentos?aba=modelos"
                className="text-primary underline"
                onClick={onClose}
              >
                Cadastrar em Documentos → Modelos
              </Link>
              .
            </p>
          ) : (
            <Select value={templateId ?? undefined} onValueChange={selectTemplate}>
              <SelectTrigger aria-label="Modelo">
                <SelectValue placeholder={templatesLoading ? 'Carregando…' : 'Escolha o modelo'} />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_CATEGORIES.map((category) => {
                  const items = templates.filter((item) => item.category === category)
                  if (items.length === 0) return null
                  return (
                    <SelectGroup key={category}>
                      <SelectLabel>{DOCUMENT_CATEGORY_LABELS[category]}</SelectLabel>
                      {items.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )
                })}
              </SelectContent>
            </Select>
          )}
          {template?.description && (
            <p className="text-xs text-muted-foreground">{template.description}</p>
          )}
        </Section>

        {template && classified && (
          <>
            <Section title="Cliente e processo">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Cliente</Label>
                  <ClienteCombobox
                    value={clientId}
                    onChange={selectClient}
                    disabled={!!fixedClientId}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Processo</Label>
                  {fixedProcessId ? (
                    <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                      <span className="font-mono text-xs">
                        {fixedProcess?.cnj_number ?? 'Sem CNJ'}
                      </span>
                      {fixedProcess && (
                        <span className="ml-2 text-muted-foreground">
                          {getCrmItemClientName(fixedProcess.crm_item)}
                        </span>
                      )}
                    </p>
                  ) : (
                    <Select
                      value={processId ?? 'none'}
                      onValueChange={(value) => selectProcess(value === 'none' ? null : value)}
                      disabled={!clientId}
                    >
                      <SelectTrigger aria-label="Processo">
                        <SelectValue
                          placeholder={clientId ? 'Nenhum processo' : 'Escolha o cliente antes'}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum processo</SelectItem>
                        {clientProcesses.map((process) => (
                          <SelectItem key={process.id} value={process.id}>
                            {process.cnj_number ?? 'Sem CNJ'}
                            {process.procedural_class ? ` · ${process.procedural_class}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </Section>

            {usesGroup('advogado') && (
              <Section title="Advogados">
                <GenerateLawyerPicker
                  lawyers={lawyers}
                  selected={lawyerIds}
                  onChange={selectLawyers}
                />
              </Section>
            )}

            {(resolution.data?.notes.length ?? 0) > 0 && (
              <ul className="space-y-1 text-xs">
                {resolution.data?.notes.map((note) => (
                  <li key={note} className="flex gap-1.5 rounded bg-warning/15 px-2 py-1">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            )}

            {classified.cadastro.length > 0 && (
              <Section title="Dados do cadastro">
                {resolution.isError ? (
                  <p className="text-sm text-destructive">
                    Não foi possível ler os dados do cadastro. Feche e tente de novo.
                  </p>
                ) : (
                  <GenerateCadastroFields
                    fields={classified.cadastro}
                    values={resolution.data?.values}
                    isLoading={resolution.isLoading}
                    overrides={overrides}
                    onOverride={setOverride}
                  />
                )}
              </Section>
            )}

            {classified.manual.length > 0 && (
              <Section title="Preencha">
                <GenerateManualFields
                  fields={classified.manual}
                  values={manual}
                  onChange={(name, value) =>
                    setManual((current) => ({ ...current, [name]: value }))
                  }
                />
              </Section>
            )}

            {classified.ai.length > 0 && (
              <Section title="Texto">
                <GenerateAiFields
                  fields={classified.ai}
                  texts={aiTexts}
                  onTextChange={(name, text) =>
                    setAiTexts((current) => ({ ...current, [name]: text }))
                  }
                  canUseAi={can('ia', 'view')}
                  notes={notes}
                  onNotesChange={setNotes}
                  documents={readableDocuments}
                  selectedDocumentIds={documentIds}
                  onToggleDocument={toggleDocument}
                  onDraft={(fields) => void handleDraft(fields)}
                  draftingFields={draftingFields}
                />
              </Section>
            )}
          </>
        )}
      </div>

      <DialogFooter className="items-center gap-2 sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {template && missing.length > 0
            ? `${missing.length} ${missing.length === 1 ? 'campo vai' : 'campos vão'} ` +
              'sair como [FALTA: …].'
            : ''}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          {canSave && (
            <Button
              variant="outline"
              disabled={!template || busy}
              onClick={() => handleGenerate(true)}
              title="Baixa o .docx e guarda uma cópia nos documentos do cliente/processo"
            >
              <Save className="h-4 w-4" />
              Baixar e salvar
            </Button>
          )}
          <Button disabled={!template || busy} onClick={() => handleGenerate(false)}>
            {generate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Baixar .docx
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}
