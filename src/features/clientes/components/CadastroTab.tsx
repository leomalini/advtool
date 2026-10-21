'use client'

import { Copy, FileText, IdCard, Phone, Scale, User } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DataSection } from '@/components/shared/DataSection'
import {
  ADDRESS_KIND_LABELS,
  getClientDocument,
  MARITAL_STATUS_LABELS,
  SEX_LABELS,
} from '@/types/cliente.types'
import type { ClientWithRelations } from '@/types/cliente.types'
import { formatDocument } from '@/utils/format'
import { formatDate } from '@/utils/date'
import { buildQualificacao, formatAddressLine, getClientAge } from '../utils/qualificacao'
import { CopyableValue } from './CopyableValue'
import { LegalAreaBadges } from './LegalAreaBadges'

function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 px-4 py-3 border-b border-border last:border-b-0">
      <span className="w-44 shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1 text-sm text-foreground">{children}</div>
    </div>
  )
}

/** Aba Cadastro — a mesma na ficha de cliente e na de pessoa: os campos são
 * os mesmos (migration 78). Muda só a linha da data, que para cliente é
 * "desde quando é cliente" e para pessoa é a do cadastro. */
export function CadastroTab({ cliente }: { cliente: ClientWithRelations }) {
  const isPF = cliente.type === 'individual'
  const qualificacao = buildQualificacao(cliente)
  const age = getClientAge(cliente.birth_date)
  const areas = cliente.legal_areas ?? []

  const addresses = cliente.addresses ?? []

  return (
    <div className="space-y-4">
      <DataSection
        icon={<Scale className="h-3.5 w-3.5" />}
        title="Qualificação completa"
        action={
          qualificacao ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                navigator.clipboard.writeText(qualificacao)
                toast.success('Qualificação copiada')
              }}
            >
              <Copy className="h-3 w-3 mr-1" />
              Copiar
            </Button>
          ) : undefined
        }
      >
        <div className="p-4">
          {qualificacao ? (
            <>
              <p className="text-sm leading-relaxed text-foreground">{qualificacao}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Gerada a partir do cadastro — complete os campos para enriquecê-la.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sem dados suficientes para gerar a qualificação.
            </p>
          )}
        </div>
      </DataSection>

      <DataSection icon={<User className="h-3.5 w-3.5" />} title="Informações pessoais">
        <DataRow label="Tipo de cadastro">{isPF ? 'Pessoa Física' : 'Pessoa Jurídica'}</DataRow>
        <DataRow label={isPF ? 'Nome' : 'Razão social'}>
          <CopyableValue value={(isPF ? cliente.name : cliente.company_name) ?? '—'} />
        </DataRow>
        {!isPF && cliente.trade_name && (
          <DataRow label="Nome fantasia">
            <CopyableValue value={cliente.trade_name} />
          </DataRow>
        )}
        <DataRow label="CPF/CNPJ">
          {getClientDocument(cliente) ? (
            <CopyableValue value={formatDocument(getClientDocument(cliente))} mono />
          ) : (
            '—'
          )}
        </DataRow>
        {isPF && (
          <>
            <DataRow label="Data de nascimento">
              {cliente.birth_date
                ? `${formatDate(cliente.birth_date)}${age != null ? ` (${age} anos)` : ''}`
                : '—'}
            </DataRow>
            <DataRow label="Sexo">{cliente.sex ? SEX_LABELS[cliente.sex] : '—'}</DataRow>
            <DataRow label="Nacionalidade">{cliente.nationality || '—'}</DataRow>
            <DataRow label="Estado civil">
              {cliente.marital_status ? MARITAL_STATUS_LABELS[cliente.marital_status] : '—'}
            </DataRow>
            <DataRow label="Profissão">{cliente.profession || '—'}</DataRow>
            <DataRow label="RG">
              {cliente.rg ? (
                <CopyableValue
                  value={[cliente.rg, cliente.rg_issuer].filter(Boolean).join(' ')}
                  mono
                />
              ) : (
                '—'
              )}
            </DataRow>
          </>
        )}
        {!isPF && cliente.contact_person && (
          <DataRow label="Contato responsável">{cliente.contact_person}</DataRow>
        )}
        <DataRow label={areas.length > 1 ? 'Áreas jurídicas' : 'Área jurídica'}>
          <LegalAreaBadges areas={areas} empty="—" />
        </DataRow>
        <DataRow label="Advogado responsável">
          {cliente.assignee ? cliente.assignee.full_name : '—'}
        </DataRow>
        {cliente.is_client ? (
          <DataRow label="Cliente desde">
            {formatDate(cliente.client_since ?? cliente.created_at)}
          </DataRow>
        ) : (
          <DataRow label="Cadastrado em">{formatDate(cliente.created_at)}</DataRow>
        )}
      </DataSection>

      <DataSection icon={<Phone className="h-3.5 w-3.5" />} title="Contato">
        <DataRow label="Telefone principal">
          {cliente.phone ? <CopyableValue value={cliente.phone} /> : '—'}
        </DataRow>
        <DataRow label="E-mail principal">
          {cliente.email ? <CopyableValue value={cliente.email} /> : '—'}
        </DataRow>
        {(cliente.contacts ?? []).map((contact) => (
          <DataRow key={contact.id} label={contact.label || (contact.type === 'phone' ? 'Telefone' : 'E-mail')}>
            <CopyableValue value={contact.value} />
          </DataRow>
        ))}
      </DataSection>

      <DataSection
        icon={<IdCard className="h-3.5 w-3.5" />}
        title={addresses.length > 1 ? 'Endereços' : 'Endereço'}
      >
        {addresses.length === 0 ? (
          <DataRow label="Endereço completo">—</DataRow>
        ) : (
          addresses.map((address) => (
            <DataRow
              key={address.id}
              // O principal é o que a qualificação usa — o rótulo diz isso em
              // vez de deixar a pessoa deduzir pela ordem.
              label={
                address.is_primary
                  ? `${ADDRESS_KIND_LABELS[address.kind]} · principal`
                  : ADDRESS_KIND_LABELS[address.kind]
              }
            >
              <CopyableValue value={formatAddressLine(address) || '—'} />
            </DataRow>
          ))
        )}
      </DataSection>

      {cliente.notes && (
        <DataSection icon={<FileText className="h-3.5 w-3.5" />} title="Observações">
          <p className="p-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground/80">
            {cliente.notes}
          </p>
        </DataSection>
      )}
    </div>
  )
}
