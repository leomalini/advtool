'use client'

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
import { formatDate } from '@/utils/date'
import {
  MapPin,
  Mail,
  Phone,
  FileText,
  User,
  Building2,
  Scale,
  Pencil,
  ExternalLink,
} from 'lucide-react'
import type { ClientWithRelations } from '@/types/cliente.types'
import { getClientDisplayName, getClientDocument } from '@/types/cliente.types'

interface ClienteDetailModalProps {
  cliente: ClientWithRelations | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit?: (cliente: ClientWithRelations) => void
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
  }).format(value)
}

// ── Aba: Resumo ───────────────────────────────────────────────

function AbaResumo({ cliente }: { cliente: ClientWithRelations }) {
  const isPF = cliente.type === 'individual'
  const TipoIcon = isPF ? User : Building2
  const doc = getClientDocument(cliente)

  const phones = [
    ...(cliente.phone ? [{ value: cliente.phone, label: 'Principal' }] : []),
    ...(cliente.contacts?.filter((c) => c.type === 'phone').map((c) => ({
      value: c.value,
      label: c.label ?? 'Telefone',
    })) ?? []),
  ]

  const emails = [
    ...(cliente.email ? [{ value: cliente.email, label: 'Principal' }] : []),
    ...(cliente.contacts?.filter((c) => c.type === 'email').map((c) => ({
      value: c.value,
      label: c.label ?? 'E-mail',
    })) ?? []),
  ]

  const hasAddress =
    cliente.address_street ||
    cliente.address_city ||
    cliente.address_state

  return (
    <div className="space-y-4 pt-2">
      {/* Dados pessoais */}
      <section className="rounded-lg border p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Dados {isPF ? 'pessoais' : 'da empresa'}
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-2">
            <TipoIcon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">{isPF ? 'Nome' : 'Razão Social'}</p>
              <p className="text-sm font-medium">
                {isPF ? cliente.name : cliente.company_name}
              </p>
            </div>
          </div>

          {!isPF && cliente.trade_name && (
            <div className="flex items-start gap-2">
              <Building2 className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Nome Fantasia</p>
                <p className="text-sm font-medium">{cliente.trade_name}</p>
              </div>
            </div>
          )}

          {doc && (
            <div className="flex items-start gap-2">
              <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">
                  {isPF ? 'CPF' : 'CNPJ'}
                </p>
                <p className="text-sm font-medium font-mono">{doc}</p>
              </div>
            </div>
          )}

          {!isPF && cliente.contact_person && (
            <div className="flex items-start gap-2">
              <User className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Responsável</p>
                <p className="text-sm font-medium">{cliente.contact_person}</p>
              </div>
            </div>
          )}

          {cliente.legal_area && (
            <div className="flex items-start gap-2">
              <Scale className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Área jurídica</p>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium mt-0.5',
                    AREAS_JURIDICAS[cliente.legal_area].bg,
                    AREAS_JURIDICAS[cliente.legal_area].color
                  )}
                >
                  {AREAS_JURIDICAS[cliente.legal_area].label}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Cliente desde</p>
              <p className="text-sm font-medium">{formatDate(cliente.created_at)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Contatos */}
      {(phones.length > 0 || emails.length > 0) && (
        <section className="rounded-lg border p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Contato
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {phones.map((p, i) => (
              <div key={i} className="flex items-start gap-2">
                <Phone className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">{p.label}</p>
                  <p className="text-sm font-medium">{p.value}</p>
                </div>
              </div>
            ))}
            {emails.map((e, i) => (
              <div key={i} className="flex items-start gap-2">
                <Mail className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">{e.label}</p>
                  <a
                    href={`mailto:${e.value}`}
                    className="text-sm font-medium break-all hover:underline flex items-center gap-1"
                  >
                    {e.value}
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Endereço */}
      {hasAddress && (
        <section className="rounded-lg border p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Endereço
          </h3>
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <p className="text-sm leading-relaxed">
              {[
                cliente.address_street,
                cliente.address_number,
                cliente.address_complement,
                cliente.address_neighborhood,
                [cliente.address_city, cliente.address_state].filter(Boolean).join('/'),
                cliente.address_zip ? `CEP ${cliente.address_zip}` : null,
              ]
                .filter(Boolean)
                .join(', ')}
            </p>
          </div>
        </section>
      )}

      {/* Observações */}
      {cliente.notes && (
        <section className="rounded-lg border p-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Observações
          </h3>
          <p className="text-sm text-foreground/80 leading-relaxed">{cliente.notes}</p>
        </section>
      )}
    </div>
  )
}

// ── Aba: Casos (placeholder até módulo de processos) ─────────

function AbaCasos() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Scale className="h-8 w-8 text-muted-foreground mb-3" />
      <p className="text-sm font-medium">Integração com processos em desenvolvimento</p>
      <p className="text-xs text-muted-foreground mt-1">
        Os casos deste cliente aparecerão aqui quando o módulo de processos for implementado.
      </p>
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
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <div className="flex items-start gap-3">
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

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          <Tabs defaultValue="resumo">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="resumo" className="flex-1">Resumo</TabsTrigger>
              <TabsTrigger value="casos" className="flex-1">Casos</TabsTrigger>
              <TabsTrigger value="financeiro" className="flex-1">Financeiro</TabsTrigger>
            </TabsList>

            <TabsContent value="resumo">
              <AbaResumo cliente={cliente} />
            </TabsContent>
            <TabsContent value="casos">
              <AbaCasos />
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
