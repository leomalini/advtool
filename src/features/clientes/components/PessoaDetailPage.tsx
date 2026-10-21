'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Pencil, UserCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Can } from '@/components/shared/Can'
import type { CreateClientInput } from '@/schemas/cliente.schema'
import { getClientDisplayName } from '@/types/cliente.types'
import { DocumentsTab } from '@/features/documentos/components/DocumentsTab'
import { EntityContractsTab } from '@/features/contratos/components/EntityContractsTab'
import { PartyProcessesTab } from '@/features/processos/components/PartyProcessesTab'
import { usePermissions } from '@/hooks/usePermissions'
import { useCliente } from '../hooks/useClientes'
import { useUpdateCliente } from '../hooks/useClienteMutations'
import { CadastroHeader } from './CadastroHeader'
import { CadastroTab } from './CadastroTab'
import { ClienteForm } from './ClienteForm'
import { ClientComments } from './ClientComments'
import { ConvertToClientDialog } from './ConvertToClientDialog'

type Tab = 'cadastro' | 'notas' | 'processos' | 'contratos' | 'arquivos'

/** Sem Pendências, Portal, Financeiro, Casos e Agenda: são coisas de cliente.
 * Processos e Contratos são aqueles em que a pessoa é PARTE — de quem é o
 * processo ou o contrato é outra pergunta, e a resposta é sempre um cliente. */
const TABS: { id: Tab; label: string }[] = [
  { id: 'cadastro', label: 'Cadastro' },
  { id: 'notas', label: 'Notas' },
  { id: 'processos', label: 'Processos' },
  { id: 'contratos', label: 'Contratos' },
  { id: 'arquivos', label: 'Arquivos' },
]

/**
 * Ficha de pessoa que não é cliente (migration 78) — parte contrária,
 * testemunha, fiador. Mesmo cabeçalho e mesma aba Cadastro da ficha de
 * cliente; a rota redireciona para `/clientes/[id]` quando o registro é
 * cliente.
 */
export function PessoaDetailPage({ pessoaId }: { pessoaId: string }) {
  const router = useRouter()
  const { data: pessoa, isLoading, error } = useCliente(pessoaId)
  const { can } = usePermissions()

  const [tab, setTab] = useState<Tab>('cadastro')
  const [editOpen, setEditOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)

  const updatePessoa = useUpdateCliente(pessoaId, 'person')

  async function handleEditSubmit(data: CreateClientInput) {
    await updatePessoa.mutateAsync(data)
    setEditOpen(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !pessoa) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-sm text-muted-foreground">Pessoa não encontrada</p>
        <Button variant="outline" onClick={() => router.push('/pessoas')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
      </div>
    )
  }

  const name = getClientDisplayName(pessoa)

  return (
    <div className="flex flex-col h-full -m-6">
      {/* ── Breadcrumb ── */}
      <div className="px-6 py-3 border-b bg-card shrink-0">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground" aria-label="Trilha">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">
            Início
          </Link>
          <span className="text-border">/</span>
          <Link href="/pessoas" className="hover:text-foreground transition-colors">
            Pessoas
          </Link>
          <span className="text-border">/</span>
          <span className="text-foreground font-medium truncate">{name}</span>
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-4">
          {/* ── Cabeçalho ── */}
          <CadastroHeader
            cliente={pessoa}
            actions={
              <>
                <Can resource="clientes" action="create">
                  <Button size="sm" onClick={() => setConvertOpen(true)}>
                    <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                    Tornar cliente
                  </Button>
                </Can>
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Editar cadastro
                </Button>
              </>
            }
          />

          {/* ── Abas ── */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex gap-0 overflow-x-auto border-b border-border px-2">
              {TABS.filter(
                (t) =>
                  (t.id !== 'contratos' || can('contratos', 'view')) &&
                  (t.id !== 'processos' || can('processos', 'view'))
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-all',
                    tab === t.id
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground/80'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {tab === 'cadastro' && <CadastroTab cliente={pessoa} />}
              {tab === 'notas' && (
                <ClientComments clientId={pessoaId} entityTitle={name} kind="person" />
              )}
              {tab === 'processos' && <PartyProcessesTab personId={pessoaId} />}
              {tab === 'contratos' && (
                <EntityContractsTab clientId={pessoaId} itemLabel="cadastro" allowCreate={false} />
              )}
              {tab === 'arquivos' && (
                <DocumentsTab clientId={pessoaId} lockedClientId={pessoaId} itemLabel="cadastro" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Diálogos ── */}
      <ClienteForm
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSubmit={handleEditSubmit}
        isLoading={updatePessoa.isPending}
        defaultValues={pessoa}
        kind="person"
      />

      {/* Convertida, a ficha de pessoa não vale mais: o registro abre na de
          cliente, onde estão processos, financeiro e pendências. */}
      <ConvertToClientDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        personId={pessoaId}
        personName={name}
        onConverted={() => router.push(`/clientes/${pessoaId}`)}
      />
    </div>
  )
}
