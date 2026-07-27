'use client'

import { useState } from 'react'
import {
  MapPin,
  Mail,
  Phone,
  FileText,
  ExternalLink,
  MessageCircle,
  AlertTriangle,
  X,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AREAS_JURIDICAS } from '@/data/mock'
import { formatDate } from '@/utils/date'
import { formatPhone } from '@/utils/format'
import { getInitials } from '@/utils/profile'
import { useUpdateCliente } from '../hooks/useClienteMutations'
import { EMAIL_REGEX, PHONE_DIGITS_REGEX } from '@/schemas/cliente.schema'
import type { ClientWithRelations } from '@/types/cliente.types'
import { getClientDocument } from '@/types/cliente.types'

/** Brazilian phone → wa.me link. Assumes a local (no country code) number if fewer than 12 digits. */
function whatsappLink(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const withCountry = digits.length >= 12 ? digits : `55${digits}`
  return `https://wa.me/${withCountry}`
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="text-sm font-medium text-foreground mt-0.5 truncate">{children}</div>
    </div>
  )
}

/** Quick add for the primary phone/email — used when the field is a flagged pendency, so the user
 * doesn't have to open the full edit form just to fill one field. */
function QuickAddContact({
  kind,
  onSave,
  isSaving,
}: {
  kind: 'phone' | 'email'
  onSave: (value: string) => void
  isSaving: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const label = kind === 'phone' ? 'Telefone' : 'E-mail'
  const Icon = kind === 'phone' ? Phone : Mail

  if (!editing) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-warning/8 border border-warning/20">
        <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
        <span className="text-xs text-warning flex-1">{label} não cadastrado</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs font-semibold text-accent-foreground hover:underline shrink-0"
        >
          + Adicionar
        </button>
      </div>
    )
  }

  function isValid(value: string): boolean {
    if (kind === 'email') return EMAIL_REGEX.test(value)
    return PHONE_DIGITS_REGEX.test(value.replace(/\D/g, ''))
  }

  function handleSave() {
    const value = kind === 'phone' ? formatPhone(draft) : draft.trim()
    if (!value) return
    if (!isValid(value)) {
      setError(kind === 'phone' ? 'Telefone inválido' : 'E-mail inválido')
      return
    }
    setError(null)
    onSave(value)
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          autoFocus
          type={kind === 'email' ? 'email' : 'text'}
          inputMode={kind === 'phone' ? 'numeric' : undefined}
          value={draft}
          onChange={(e) => {
            setError(null)
            setDraft(kind === 'phone' ? formatPhone(e.target.value) : e.target.value)
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder={kind === 'phone' ? '(11) 98765-4321' : 'email@exemplo.com'}
          maxLength={kind === 'phone' ? 15 : 254}
          className={cn(
            'flex-1 h-7 px-2 rounded-md border bg-card text-xs focus:outline-none focus:ring-2 focus:ring-ring/20',
            error ? 'border-destructive focus:ring-destructive/20' : 'border-border focus:border-ring'
          )}
          disabled={isSaving}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !draft.trim()}
          className="flex items-center justify-center h-7 w-7 rounded-md text-success hover:bg-success/12 disabled:opacity-40 shrink-0"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => { setEditing(false); setDraft(''); setError(null) }}
          className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-muted shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {error && <p className="text-[11px] text-destructive pl-5">{error}</p>}
    </div>
  )
}

interface ClienteResumoProps {
  cliente: ClientWithRelations
}

/** Compact client summary — shared by the client detail modal and the CRM/Processo "Cliente" tab. */
export function ClienteResumo({ cliente }: ClienteResumoProps) {
  const isPF = cliente.type === 'individual'
  const doc = getClientDocument(cliente)
  const updateCliente = useUpdateCliente(cliente.id)

  const extraPhones = cliente.contacts?.filter((c) => c.type === 'phone') ?? []
  const extraEmails = cliente.contacts?.filter((c) => c.type === 'email') ?? []

  const hasAddress = cliente.address_street || cliente.address_city || cliente.address_state
  const area = cliente.legal_area ? AREAS_JURIDICAS[cliente.legal_area] : null

  function saveField(field: 'phone' | 'email', value: string) {
    updateCliente.mutate({ [field]: value })
  }

  return (
    <div className="space-y-3 pt-2">
      <section className="rounded-lg border divide-y divide-border overflow-hidden">
        {/* Header row */}
        <div className="flex items-center gap-3 p-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
            {(isPF ? cliente.name : cliente.company_name)?.slice(0, 2).toUpperCase() ?? '—'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">
              {isPF ? cliente.name : cliente.company_name}
            </p>
            {!isPF && cliente.trade_name && (
              <p className="text-xs text-muted-foreground truncate">{cliente.trade_name}</p>
            )}
          </div>
        </div>

        {/* Compact info grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 p-3.5">
          {doc && (
            <InfoField label={isPF ? 'CPF' : 'CNPJ'}>
              <span className="font-mono">{doc}</span>
            </InfoField>
          )}
          {area && (
            <InfoField label="Área jurídica">
              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', area.bg, area.color)}>
                {area.label}
              </span>
            </InfoField>
          )}
          {!isPF && cliente.contact_person && (
            <InfoField label="Contato responsável">{cliente.contact_person}</InfoField>
          )}
          {cliente.assignee && (
            <InfoField label="Advogado responsável">
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold bg-accent text-accent-foreground shrink-0">
                  {getInitials(cliente.assignee.full_name)}
                </span>
                <span className="truncate">{cliente.assignee.full_name}</span>
              </span>
            </InfoField>
          )}
          <InfoField label="Cliente desde">{formatDate(cliente.created_at)}</InfoField>
        </div>

        {/* Contato */}
        <div className="p-3.5 space-y-2">
          {cliente.phone ? (
            <div className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm">{cliente.phone}</span>
              <a
                href={whatsappLink(cliente.phone)}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir no WhatsApp"
                className="inline-flex items-center justify-center h-5 w-5 rounded-full text-success hover:bg-success/12 transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" />
              </a>
            </div>
          ) : (
            <QuickAddContact kind="phone" onSave={(v) => saveField('phone', v)} isSaving={updateCliente.isPending} />
          )}

          {cliente.email ? (
            <a
              href={`mailto:${cliente.email}`}
              className="flex items-center gap-1.5 text-sm hover:underline w-fit"
            >
              <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {cliente.email}
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
          ) : (
            <QuickAddContact kind="email" onSave={(v) => saveField('email', v)} isSaving={updateCliente.isPending} />
          )}

          {(extraPhones.length > 0 || extraEmails.length > 0) && (
            <div className="pt-1.5 mt-1.5 border-t border-border/60 space-y-1.5">
              {extraPhones.map((c) => (
                <div key={c.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3 shrink-0" />
                  {c.label ?? 'Telefone'}: <span className="text-foreground">{c.value}</span>
                  <a
                    href={whatsappLink(c.value)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir no WhatsApp"
                    className="inline-flex items-center justify-center h-4 w-4 rounded-full text-success hover:bg-success/12 transition-colors"
                  >
                    <MessageCircle className="h-3 w-3" />
                  </a>
                </div>
              ))}
              {extraEmails.map((c) => (
                <a
                  key={c.id}
                  href={`mailto:${c.value}`}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:underline w-fit"
                >
                  <Mail className="h-3 w-3 shrink-0" />
                  {c.label ?? 'E-mail'}: <span className="text-foreground">{c.value}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      {hasAddress && (
        <section className="rounded-lg border p-3.5 flex items-start gap-2">
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
        </section>
      )}

      {cliente.notes && (
        <section className="rounded-lg border p-3.5 space-y-1.5">
          <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Observações
          </h3>
          <p className="text-sm text-foreground/80 leading-relaxed">{cliente.notes}</p>
        </section>
      )}

      {cliente.creator && (
        <p className="text-xs text-muted-foreground/70">
          Cadastrado por {cliente.creator.full_name}
        </p>
      )}
    </div>
  )
}
