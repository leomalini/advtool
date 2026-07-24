'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Search, Link2, Unlink, Gavel } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatCnjNumber } from '@/utils/cnj'
import { useWorkflow } from '../hooks/useWorkflows'
import { useLegalProcess } from '@/features/processos/hooks/useLegalProcesses'
import { useCreateLegalProcess } from '@/features/processos/hooks/useLegalProcessMutations'
import { findLegalProcessByCnj } from '@/features/processos/services/legalProcesses.service'
import { getCrmItemClientName } from '@/types/crmItem.types'
import type { LegalProcessWithRelations } from '@/types/legalProcess.types'
import type { CrmLegalArea } from '@/schemas/crmItem.schema'

interface JudicialFields {
  court: string
  court_division: string
  plaintiff: string
  defendant: string
  opposing_counsel: string
}

const EMPTY_JUDICIAL_FIELDS: JudicialFields = {
  court: '',
  court_division: '',
  plaintiff: '',
  defendant: '',
  opposing_counsel: '',
}

interface VincularProcessoFieldProps {
  value: string | null
  onChange: (legalProcessId: string | null) => void
  defaults?: {
    client_id?: string | null
    legal_area?: CrmLegalArea | null
    assigned_to?: string | null
  }
}

export function VincularProcessoField({ value, onChange, defaults }: VincularProcessoFieldProps) {
  const [cnjInput, setCnjInput] = useState('')
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [localResult, setLocalResult] = useState<LegalProcessWithRelations | null>(null)
  const [judicialFields, setJudicialFields] = useState<JudicialFields>(EMPTY_JUDICIAL_FIELDS)
  const lastSearchedRef = useRef<string | null>(null)

  const workflow = useWorkflow('wf-processos')
  const { data: linkedProcesso } = useLegalProcess(value ?? '')
  const createProcess = useCreateLegalProcess()

  function reset() {
    setCnjInput('')
    setSearching(false)
    setSearched(false)
    setLocalResult(null)
    setJudicialFields(EMPTY_JUDICIAL_FIELDS)
    lastSearchedRef.current = null
  }

  // Debounced lookup: fires 600ms after the user types a complete CNJ (20 digits).
  // Local DB first — only falls back to the external API when nothing is found,
  // avoiding unnecessary BuscaProcessos calls for processos we already track.
  useEffect(() => {
    const digits = cnjInput.replace(/\D/g, '')
    if (digits.length !== 20) return
    if (cnjInput === lastSearchedRef.current) return

    const controller = new AbortController()

    const timeout = setTimeout(async () => {
      lastSearchedRef.current = cnjInput
      setSearching(true)
      setSearched(false)
      setLocalResult(null)
      setJudicialFields(EMPTY_JUDICIAL_FIELDS)

      try {
        const existing = await findLegalProcessByCnj(cnjInput)
        if (controller.signal.aborted) return

        if (existing) {
          setLocalResult(existing)
          setSearched(true)
          return
        }

        const res = await fetch(`/api/buscaprocessos/processos/${encodeURIComponent(cnjInput)}`, {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        const json = await res.json()

        if (res.ok) {
          setJudicialFields({
            court: json.court ?? '',
            court_division: json.court_division ?? '',
            plaintiff: json.plaintiff ?? '',
            defendant: json.defendant ?? '',
            opposing_counsel: '',
          })
        }
        setSearched(true)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setSearched(true)
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 600)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [cnjInput])

  function handleLinkExisting() {
    if (!localResult) return
    onChange(localResult.id)
    reset()
  }

  function handleCreateAndLink() {
    const firstColumnId = workflow?.colunas[0]?.id
    if (!firstColumnId) {
      toast.error('Workflow Processos sem etapas configuradas.')
      return
    }
    createProcess.mutate(
      {
        title: null,
        client_id: defaults?.client_id ?? null,
        legal_area: defaults?.legal_area ?? null,
        column_id: firstColumnId,
        assigned_to: defaults?.assigned_to ?? null,
        tags: [],
        next_deadline: new Date().toISOString().slice(0, 10),
        next_task_summary: null,
        notes: null,
        cnj_number: cnjInput,
        court: judicialFields.court || null,
        court_division: judicialFields.court_division || null,
        plaintiff: judicialFields.plaintiff || null,
        defendant: judicialFields.defendant || null,
        opposing_counsel: judicialFields.opposing_counsel || null,
      },
      {
        onSuccess: (created) => {
          onChange(created.id)
          reset()
        },
      }
    )
  }

  function handleUnlink() {
    onChange(null)
  }

  // ── Linked state ────────────────────────────────────────────────────────
  if (value) {
    if (!linkedProcesso) {
      return <div className="h-16 rounded-lg bg-muted/40 animate-pulse" />
    }
    const clientName = getCrmItemClientName(linkedProcesso.crm_item)
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-info/15 text-info shrink-0">
          <Gavel className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{clientName}</p>
          <p className="font-mono text-[11px] text-muted-foreground truncate">
            {linkedProcesso.cnj_number ?? 'Sem CNJ'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleUnlink}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
        >
          <Unlink className="w-3.5 h-3.5" />
          Desvincular
        </button>
      </div>
    )
  }

  // ── Unlinked state — search / create ────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="text"
          value={cnjInput}
          onChange={(e) => setCnjInput(formatCnjNumber(e.target.value))}
          placeholder="0000000-00.0000.0.00.0000"
          inputMode="numeric"
          className={cn(
            'w-full px-3 py-2 rounded-lg border border-border text-sm font-mono bg-card pr-9',
            'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors',
          )}
        />
        {searching
          ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          : <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />}
      </div>
      <p className="text-xs text-muted-foreground">
        Digite o número CNJ para vincular um processo já cadastrado ou criar um novo.
      </p>

      {localResult && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-info/30 bg-info/5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground">Processo já cadastrado</p>
            <p className="text-sm text-foreground truncate">{getCrmItemClientName(localResult.crm_item)}</p>
            <p className="font-mono text-[11px] text-muted-foreground truncate">{localResult.cnj_number}</p>
          </div>
          <button
            type="button"
            onClick={handleLinkExisting}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium shrink-0"
          >
            <Link2 className="w-3.5 h-3.5" />
            Vincular
          </button>
        </div>
      )}

      {searched && !localResult && (
        <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground">
            Processo não encontrado — preencha os dados para cadastrar um novo
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={judicialFields.court}
              onChange={(e) => setJudicialFields((f) => ({ ...f, court: e.target.value }))}
              placeholder="Tribunal (ex: TJSP)"
              className="px-2.5 py-1.5 rounded-md border border-border text-xs bg-card"
            />
            <input
              value={judicialFields.court_division}
              onChange={(e) => setJudicialFields((f) => ({ ...f, court_division: e.target.value }))}
              placeholder="Vara / Câmara"
              className="px-2.5 py-1.5 rounded-md border border-border text-xs bg-card"
            />
            <input
              value={judicialFields.plaintiff}
              onChange={(e) => setJudicialFields((f) => ({ ...f, plaintiff: e.target.value }))}
              placeholder="Requerente"
              className="px-2.5 py-1.5 rounded-md border border-border text-xs bg-card"
            />
            <input
              value={judicialFields.defendant}
              onChange={(e) => setJudicialFields((f) => ({ ...f, defendant: e.target.value }))}
              placeholder="Requerido"
              className="px-2.5 py-1.5 rounded-md border border-border text-xs bg-card"
            />
          </div>
          <button
            type="button"
            onClick={handleCreateAndLink}
            disabled={createProcess.isPending}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
          >
            {createProcess.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Cadastrar e vincular
          </button>
        </div>
      )}
    </div>
  )
}
