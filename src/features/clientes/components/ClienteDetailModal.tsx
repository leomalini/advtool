'use client'

import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AREAS_JURIDICAS } from '@/data/mock'
import { getInitials } from '@/utils/profile'
import { useWorkflows } from '@/features/crm/hooks/useWorkflows'
import { useLegalProcessesByClient } from '@/features/processos/hooks/useLegalProcesses'
import { formatPrazo, formatRelativeDate } from '@/features/crm/utils/prazo'
import { getCrmItemDisplayTitle } from '@/types/crmItem.types'
import type { AreaJuridica } from '@/data/mock'
import { FileText, Scale, Pencil, ArrowRight, Briefcase, Plus } from 'lucide-react'
import type { ClientWithRelations } from '@/types/cliente.types'
import { getClientDisplayName } from '@/types/cliente.types'
import { ClienteResumo } from './ClienteResumo'

interface ClienteDetailModalProps {
  cliente: ClientWithRelations | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit?: (cliente: ClientWithRelations) => void
}

// ── Aba: Casos ────────────────────────────────────────────────

function AbaCasos({ clientId }: { clientId: string }) {
  const { data: processos = [], isLoading } = useLegalProcessesByClient(clientId)
  const { data: workflows = [] } = useWorkflows()

  const novoProcessoHref = `/processos?create=1&clientId=${clientId}`

  const header = (
    <div className="flex items-center justify-between pt-2 pb-1">
      <span className="text-xs text-muted-foreground">
        {processos.length} processo{processos.length !== 1 ? 's' : ''}
      </span>
      <Button asChild size="sm" className="h-7 gap-1.5 text-xs">
        <Link href={novoProcessoHref}>
          <Plus className="h-3.5 w-3.5" />
          Novo Processo
        </Link>
      </Button>
    </div>
  )

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">Carregando processos...</p>
      </div>
    )
  }

  if (processos.length === 0) {
    return (
      <div className="space-y-2">
        {header}
        <div className="flex flex-col items-center justify-center py-14 text-center border rounded-lg border-dashed">
          <Scale className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Nenhum processo vinculado a este cliente</p>
          <p className="text-xs text-muted-foreground mt-1">
            Cadastre um processo e ele já aparecerá vinculado a este cliente.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {header}
      {processos.map((processo) => {
        const item = processo.crm_item
        const workflow = workflows.find((w) => w.id === item?.workflow_id)
        const coluna = workflow?.colunas.find((c) => c.id === item?.column_id)
        const legalArea = item?.legal_area ? AREAS_JURIDICAS[item.legal_area as AreaJuridica] : null
        const prazoInfo = item?.next_deadline ? formatPrazo(item.next_deadline) : null

        return (
          <Link
            key={processo.id}
            href={`/processos?id=${processo.id}`}
            className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/40 transition-colors group"
          >
            {legalArea && (
              <span
                className="w-[3px] self-stretch rounded-full shrink-0"
                style={{ backgroundColor: legalArea.accent }}
              />
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium truncate">{getCrmItemDisplayTitle(item)}</p>
                {legalArea && (
                  <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0', legalArea.bg, legalArea.color)}>
                    {legalArea.label}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                {workflow && <span>{workflow.nome}</span>}
                {coluna && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: coluna.cor }} />
                      {coluna.nome}
                    </span>
                  </>
                )}
                {processo.cnj_number && (
                  <>
                    <span>·</span>
                    <span className="font-mono">{processo.cnj_number}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {prazoInfo && (
                <span
                  className={cn(
                    'text-[11px] font-medium',
                    prazoInfo.tone === 'critical' && 'text-destructive animate-pulse-urgent',
                    prazoInfo.tone === 'warning' && 'text-warning',
                    prazoInfo.tone === 'neutral' && 'text-muted-foreground'
                  )}
                >
                  {prazoInfo.label}
                </span>
              )}
              {item?.assigned_profile && (
                <div
                  title={item.assigned_profile.full_name}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9.5px] font-bold bg-accent text-accent-foreground"
                >
                  {getInitials(item.assigned_profile.full_name)}
                </div>
              )}
              <span className="text-[10.5px] text-muted-foreground hidden sm:block">
                {item ? formatRelativeDate(item.updated_at) : '—'}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>
        )
      })}
    </div>
  )
}

// ── Aba: Financeiro (placeholder) ────────────────────────────

function AbaFinanceiro() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <FileText className="h-8 w-8 text-muted-foreground mb-3" />
      <p className="text-sm font-medium">Financeiro em desenvolvimento</p>
      <p className="text-xs text-muted-foreground mt-1">
        As movimentações financeiras deste cliente aparecerão aqui.
      </p>
    </div>
  )
}

// ── Modal principal ──────────────────────────────────────────

export function ClienteDetailModal({
  cliente,
  open,
  onOpenChange,
  onEdit,
}: ClienteDetailModalProps) {
  if (!cliente) return null

  const name = getClientDisplayName(cliente)
  const area = cliente.legal_area ? AREAS_JURIDICAS[cliente.legal_area] : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-lg font-bold text-muted-foreground">
              {name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold leading-snug">
                {name}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {cliente.type === 'company' ? 'Pessoa Jurídica' : 'Pessoa Física'}
                </span>
                {area && (
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium',
                      area.bg,
                      area.color
                    )}
                  >
                    {area.label}
                  </span>
                )}
              </div>
            </div>
            {onEdit && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 shrink-0"
                onClick={() => {
                  onOpenChange(false)
                  onEdit(cliente)
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 min-h-[360px]">
          <Tabs defaultValue="resumo">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="resumo" className="flex-1">Resumo</TabsTrigger>
              <TabsTrigger value="casos" className="flex-1 gap-1.5">
                <Briefcase className="h-3.5 w-3.5" />
                Casos
              </TabsTrigger>
              <TabsTrigger value="financeiro" className="flex-1">Financeiro</TabsTrigger>
            </TabsList>

            <TabsContent value="resumo">
              <ClienteResumo cliente={cliente} />
            </TabsContent>
            <TabsContent value="casos">
              <AbaCasos clientId={cliente.id} />
            </TabsContent>
            <TabsContent value="financeiro">
              <AbaFinanceiro />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
