'use client'

import type { ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useProfiles } from '@/hooks/useProfiles'
import { ProfileOption, ProfileOptionCompact } from '@/components/shared/ProfileOption'
import { ClienteCombobox } from '@/features/clientes/components/ClienteCombobox'
import { ProcessoCombobox } from '@/features/processos/components/ProcessoCombobox'
import { personFilterValue, screenFilters } from '@/features/ia/context/screenContext'
import { useAssistantScreen } from '@/features/ia/hooks/useAssistantScreen'
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_ORIGIN_LABELS,
  type DocumentCategory,
} from '@/types/document.types'
import {
  DOCUMENT_FORMAT_LABELS,
  DOCUMENT_LINK_LABELS,
  DOCUMENT_SIGNATURE_FILTER_LABELS,
  countActiveDocumentFilters,
  emptyDocumentFilters,
  hasActiveDocumentFilters,
  type DocumentFilters,
  type DocumentFormat,
  type DocumentLink,
  type DocumentOriginFilter,
  type DocumentSignatureFilter,
} from '../utils/filterDocuments'

const ALL = '__all__'

const CATEGORY_OPTIONS = DOCUMENT_CATEGORY_LABELS
const ORIGIN_OPTIONS: Record<DocumentOriginFilter, string> = {
  ...DOCUMENT_ORIGIN_LABELS,
  // Antes da migration 87 nada registrava a origem.
  sem_registro: 'Sem registro de origem',
}

interface DocumentFilterBarProps {
  filters: DocumentFilters
  onChange: (filters: DocumentFilters) => void
  /** A integração com a D4Sign está ligada — sem ela não há selo a filtrar. */
  signatureReady: boolean
  resultCount: number
  total: number
}

export function DocumentFilterBar({
  filters,
  onChange,
  signatureReady,
  resultCount,
  total,
}: DocumentFilterBarProps) {
  const { data: profiles = [] } = useProfiles()
  const active = hasActiveDocumentFilters(filters)

  function set<K extends keyof DocumentFilters>(key: K, value: DocumentFilters[K]) {
    onChange({ ...filters, [key]: value })
  }

  const uploader = filters.uploadedBy
    ? profiles.find((p) => p.id === filters.uploadedBy)
    : undefined

  // Os filtros visíveis vão para o painel do Assistente com a pergunta.
  useAssistantScreen({
    filters: screenFilters([
      ['Busca', filters.search.trim()],
      ['Categoria', filters.category && DOCUMENT_CATEGORY_LABELS[filters.category]],
      ['Formato', filters.format && DOCUMENT_FORMAT_LABELS[filters.format]],
      ['Vinculado a', filters.link && DOCUMENT_LINK_LABELS[filters.link]],
      ['Origem', filters.origin && ORIGIN_OPTIONS[filters.origin]],
      ['Assinatura', filters.signature && DOCUMENT_SIGNATURE_FILTER_LABELS[filters.signature]],
      ['Cliente', filters.clientId && `id: ${filters.clientId}`],
      ['Processo', filters.legalProcessId && `id: ${filters.legalProcessId}`],
      ['Enviado por', personFilterValue(filters.uploadedBy, uploader?.full_name)],
      ['Enviado de', filters.periodFrom],
      ['Enviado até', filters.periodTo],
    ]),
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Busca */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            placeholder="Buscar por nome, cliente, CNJ ou tarefa..."
            className="pl-8 h-9 text-sm"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => set('search', '')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <FilterSelect<DocumentCategory>
          value={filters.category}
          onChange={(v) => set('category', v)}
          options={CATEGORY_OPTIONS}
          allLabel="Todas as categorias"
          width="w-[200px]"
        />
        <FilterSelect<DocumentFormat>
          value={filters.format}
          onChange={(v) => set('format', v)}
          options={DOCUMENT_FORMAT_LABELS}
          allLabel="Todo formato"
          width="w-[150px]"
        />
        <FilterSelect<DocumentLink>
          value={filters.link}
          onChange={(v) => set('link', v)}
          options={DOCUMENT_LINK_LABELS}
          allLabel="Todo vínculo"
          width="w-[170px]"
        />
        <FilterSelect<DocumentOriginFilter>
          value={filters.origin}
          onChange={(v) => set('origin', v)}
          options={ORIGIN_OPTIONS}
          allLabel="Toda origem"
          width="w-[190px]"
        />
        {signatureReady && (
          <FilterSelect<DocumentSignatureFilter>
            value={filters.signature}
            onChange={(v) => set('signature', v)}
            options={DOCUMENT_SIGNATURE_FILTER_LABELS}
            allLabel="Toda assinatura"
            width="w-[160px]"
          />
        )}
      </div>

      {/* Segunda linha: quem, onde e quando — campos mais largos, como na
          barra do Financeiro. */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="w-[240px]">
          <ClienteCombobox
            value={filters.clientId}
            onChange={(id) => set('clientId', id)}
            placeholder="Todos os clientes"
            className="py-1.5"
          />
        </div>

        <div className="w-[280px]">
          <ProcessoCombobox
            value={filters.legalProcessId}
            onChange={(id) => set('legalProcessId', id)}
            placeholder="Todos os processos"
            className="py-1.5"
          />
        </div>

        <Select
          value={filters.uploadedBy ?? ALL}
          onValueChange={(v) => set('uploadedBy', v === ALL ? null : v)}
        >
          <SelectTrigger className="h-9 w-[190px] text-sm">
            <SelectValue>
              {!filters.uploadedBy ? (
                'Enviado por todos'
              ) : uploader ? (
                <ProfileOptionCompact profile={uploader} />
              ) : (
                'Enviado por'
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Enviado por todos</SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <ProfileOption profile={p} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Enviado</span>
          <Input
            type="date"
            value={filters.periodFrom ?? ''}
            onChange={(e) => set('periodFrom', e.target.value || null)}
            className="h-9 w-[150px] text-sm"
            aria-label="Enviado de"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <Input
            type="date"
            value={filters.periodTo ?? ''}
            onChange={(e) => set('periodTo', e.target.value || null)}
            className="h-9 w-[150px] text-sm"
            aria-label="Enviado até"
          />
        </div>

        {active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(emptyDocumentFilters)}
            className="h-9 text-muted-foreground"
          >
            <X className="w-3.5 h-3.5 mr-1" />
            Limpar ({countActiveDocumentFilters(filters)})
          </Button>
        )}

        {total > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {resultCount} de {total} arquivo{total === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </div>
  )
}

interface FilterSelectProps<T extends string> {
  value: T | null
  onChange: (value: T | null) => void
  options: Record<T, string>
  allLabel: string
  width: string
}

/** Um seletor de opção única com "todos" — o formato de cada filtro da linha
 * de cima. */
function FilterSelect<T extends string>({
  value,
  onChange,
  options,
  allLabel,
  width,
}: FilterSelectProps<T>): ReactNode {
  const keys = Object.keys(options) as T[]
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? null : (v as T))}>
      <SelectTrigger className={cn('h-9 text-sm', width)}>
        <SelectValue>{value ? options[value] : allLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {keys.map((key) => (
          <SelectItem key={key} value={key}>
            {options[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
