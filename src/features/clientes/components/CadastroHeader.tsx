'use client'

import { Calendar, Copy, IdCard, Phone, Tag, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { InfoStripItem } from '@/components/shared/DetailStrip'
import type { CrmTag } from '@/schemas/crmItem.schema'
import { getClientDisplayName, getClientDocument } from '@/types/cliente.types'
import type { ClientWithRelations } from '@/types/cliente.types'
import { formatDocument } from '@/utils/format'
import { formatDate } from '@/utils/date'
import { getInitials } from '@/utils/profile'
import { tagAppearance } from '@/utils/tags'
import { getClientAge } from '../utils/qualificacao'
import { CopyableValue } from './CopyableValue'
import { LegalAreaBadges } from './LegalAreaBadges'

interface CadastroHeaderProps {
  cliente: ClientWithRelations
  /** Antes do nome — o selo de pendências, na ficha de cliente. */
  badge?: React.ReactNode
  /** Os botões à direita. Cada ficha tem os seus. */
  actions: React.ReactNode
}

/** Cabeçalho da ficha — o mesmo para cliente e pessoa (migration 78): nome,
 * documento, contato e etiquetas não mudam com o estado do cadastro. */
export function CadastroHeader({ cliente, badge, actions }: CadastroHeaderProps) {
  const name = getClientDisplayName(cliente)
  const document = getClientDocument(cliente)
  const age = getClientAge(cliente.birth_date)
  const areas = cliente.legal_areas ?? []
  const tags = (cliente.tags ?? []) as CrmTag[]
  const isCompany = cliente.type === 'company'

  // PJ não tem nascimento: a casa mostra a data do cadastro — de cliente, se
  // for cliente; de pessoa, se não.
  const companyDateLabel = cliente.is_client ? 'Cliente desde' : 'Cadastrado em'
  const companyDate = cliente.is_client
    ? (cliente.client_since ?? cliente.created_at)
    : cliente.created_at

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-sm font-bold text-accent-foreground">
            {getInitials(name)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {badge}
              <h1 className="text-xl font-bold tracking-tight truncate">{name}</h1>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(name)
                  toast.success('Nome copiado')
                }}
                title="Copiar nome"
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-sm text-muted-foreground">
                {isCompany ? 'Pessoa Jurídica' : 'Pessoa Física'}
              </span>
              <LegalAreaBadges areas={areas} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted-foreground hidden sm:block">
            Cadastrado em {formatDate(cliente.created_at)}
          </span>
          {actions}
        </div>
      </div>

      {/* ── Faixa de informações ── */}
      <div className="flex border-t border-border">
        <InfoStripItem icon={<IdCard className="h-3 w-3" />} label={isCompany ? 'CNPJ' : 'CPF'}>
          {document ? (
            <p className="text-sm font-semibold text-foreground truncate">
              <CopyableValue value={formatDocument(document)} mono />
            </p>
          ) : (
            <p className="text-sm font-semibold text-muted-foreground">—</p>
          )}
        </InfoStripItem>
        <InfoStripItem icon={<Phone className="h-3 w-3" />} label="Telefone" value={cliente.phone} />
        <InfoStripItem
          icon={<Calendar className="h-3 w-3" />}
          label={isCompany ? companyDateLabel : 'Nascimento'}
          value={
            isCompany
              ? formatDate(companyDate)
              : cliente.birth_date
                ? `${formatDate(cliente.birth_date)}${age != null ? ` (${age} anos)` : ''}`
                : null
          }
        />
        <InfoStripItem
          icon={<UserCog className="h-3 w-3" />}
          label="Responsável"
          value={cliente.assignee?.full_name}
        />
      </div>

      {/* ── Etiquetas ── */}
      <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
        <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {tags.length === 0 ? (
          <span className="text-sm text-muted-foreground">Sem etiquetas</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => {
              const et = tagAppearance(tag)
              return (
                <span
                  key={tag}
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                    et.color,
                    et.textColor
                  )}
                >
                  {et.label}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
