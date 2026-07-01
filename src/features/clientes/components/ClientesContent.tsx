'use client'

import { useState, useMemo } from 'react'
import { Plus, Search, Users, Phone, Mail, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/shared/EmptyState'
import { ClienteDetailModal } from './ClienteDetailModal'
import { cn } from '@/lib/utils'
import {
  CLIENTES,
  AREAS_JURIDICAS,
  type Cliente,
  type AreaJuridica,
} from '@/data/mock'
import { formatRelative } from '@/utils/date'

// Todas as áreas presentes nos clientes (sem duplicatas, com ordenação)
const AREAS_FILTRO: { id: AreaJuridica | 'todas'; label: string }[] = [
  { id: 'todas', label: 'Todos' },
  ...Object.entries(AREAS_JURIDICAS)
    .filter(([area]) =>
      CLIENTES.some((c) => c.areaJuridica === (area as AreaJuridica))
    )
    .map(([area, cfg]) => ({ id: area as AreaJuridica, label: cfg.label })),
]

// ── Linha da tabela ──────────────────────────────────────────

interface ClienteRowProps {
  cliente: Cliente
  onVerDetalhe: (cliente: Cliente) => void
}

function ClienteRow({ cliente, onVerDetalhe }: ClienteRowProps) {
  const area = AREAS_JURIDICAS[cliente.areaJuridica]

  return (
    <tr className="group border-b last:border-0 hover:bg-muted/30 transition-colors">
      {/* Nome */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
            {cliente.nome[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{cliente.nome}</p>
            <span
              className={cn(
                'inline-flex items-center rounded border px-1 py-0 text-xs font-medium',
                cliente.tipo === 'pj'
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              )}
            >
              {cliente.tipo === 'pj' ? 'PJ' : 'PF'}
            </span>
          </div>
        </div>
      </td>

      {/* Contato */}
      <td className="px-4 py-3 hidden md:table-cell">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">{cliente.telefone}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground truncate max-w-[160px]">
              {cliente.email}
            </span>
          </div>
        </div>
      </td>

      {/* Área jurídica */}
      <td className="px-4 py-3 hidden sm:table-cell">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
            area.bg,
            area.color
          )}
        >
          {area.label}
        </span>
      </td>

      {/* Casos */}
      <td className="px-4 py-3 hidden lg:table-cell">
        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <span className="text-sm font-semibold tabular-nums">
              {cliente.casosAtivos}
            </span>
            <span className="text-xs text-muted-foreground">
              de {cliente.totalCasos} total
            </span>
          </div>
          {/* Mini indicador visual */}
          <div className="h-6 w-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="w-full rounded-full bg-blue-500 transition-all"
              style={{
                height: `${Math.round((cliente.casosAtivos / Math.max(cliente.totalCasos, 1)) * 100)}%`,
              }}
            />
          </div>
        </div>
      </td>

      {/* Última atualização */}
      <td className="px-4 py-3 hidden xl:table-cell">
        <span className="text-xs text-muted-foreground">
          {formatRelative(cliente.ultimaAtualizacao)}
        </span>
      </td>

      {/* Ações */}
      <td className="px-4 py-3">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2.5 text-xs gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onVerDetalhe(cliente)}
        >
          Ver detalhe
          <ArrowRight className="h-3 w-3" />
        </Button>
      </td>
    </tr>
  )
}

// ── Componente principal ─────────────────────────────────────

export function ClientesContent() {
  const [search, setSearch] = useState('')
  const [areaFiltro, setAreaFiltro] = useState<AreaJuridica | 'todas'>('todas')
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null)
  const [modalAberto, setModalAberto] = useState(false)

  const clientesFiltrados = useMemo(() => {
    const q = search.toLowerCase()
    return CLIENTES.filter((c) => {
      const matchSearch =
        !q ||
        c.nome.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.cpfCnpj.includes(q) ||
        c.telefone.includes(q)

      const matchArea = areaFiltro === 'todas' || c.areaJuridica === areaFiltro

      return matchSearch && matchArea
    })
  }, [search, areaFiltro])

  function handleVerDetalhe(cliente: Cliente) {
    setClienteSelecionado(cliente)
    setModalAberto(true)
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Clientes</h2>
          <p className="text-sm text-muted-foreground">
            {CLIENTES.length} clientes · {CLIENTES.reduce((s, c) => s + c.casosAtivos, 0)} casos ativos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email, CPF..."
              className="pl-9 h-8 w-[220px] text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button size="sm" className="h-8 gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Novo Cliente
          </Button>
        </div>
      </div>

      {/* ── Filtros por área jurídica ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {AREAS_FILTRO.map((filtro) => (
          <button
            key={filtro.id}
            onClick={() => setAreaFiltro(filtro.id)}
            className={cn(
              'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors border',
              areaFiltro === filtro.id
                ? 'bg-foreground text-background border-foreground'
                : 'bg-transparent text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground'
            )}
          >
            {filtro.label}
          </button>
        ))}
      </div>

      {/* ── Tabela ── */}
      {clientesFiltrados.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum cliente encontrado"
          description={
            search || areaFiltro !== 'todas'
              ? 'Tente ajustar a busca ou os filtros.'
              : 'Cadastre o primeiro cliente clicando em "Novo Cliente".'
          }
        />
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  Nome
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">
                  Contato
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">
                  Área
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">
                  Casos
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hidden xl:table-cell">
                  Última atualização
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-card">
              {clientesFiltrados.map((cliente) => (
                <ClienteRow
                  key={cliente.id}
                  cliente={cliente}
                  onVerDetalhe={handleVerDetalhe}
                />
              ))}
            </tbody>
          </table>

          {/* Footer com contador */}
          <div className="border-t bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
            Exibindo {clientesFiltrados.length} de {CLIENTES.length} clientes
          </div>
        </div>
      )}

      {/* ── Modal de detalhe ── */}
      <ClienteDetailModal
        cliente={clienteSelecionado}
        open={modalAberto}
        onOpenChange={setModalAberto}
      />
    </div>
  )
}
