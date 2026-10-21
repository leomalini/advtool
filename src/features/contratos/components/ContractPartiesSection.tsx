'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  FileSearch,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
  UserRound,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Can } from '@/components/shared/Can'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ClienteForm } from '@/features/clientes/components/ClienteForm'
import {
  useCreateCliente,
  useCreatePessoa,
} from '@/features/clientes/hooks/useClienteMutations'
import type { RecordKind } from '@/types/cliente.types'
import { personFieldValues } from '@/features/documentos/templates/partyFields'
import type { CreateClientInput } from '@/schemas/cliente.schema'
import {
  CONTRACT_PARTY_SOURCE_LABELS,
  sourceKindLabel,
  type ContractParty,
  type PartyFieldSources,
  type PartyPersonData,
} from '@/types/contract.types'
import type { DocumentWithRelations } from '@/types/document.types'
import type { TemplatePartyRole } from '@/types/documentTemplate.types'
import { formatDocument } from '@/utils/format'
import { useContractParties } from '../hooks/useContracts'
import { RECEITA_SOURCE } from '../reading/readerTypes'
import {
  useDeleteContractParty,
  useRefreshPartyFromClient,
  useUpdateContractParty,
} from '../hooks/useContractPartyMutations'
import {
  clientDefaultsFromParty,
  missingPartyData,
  partyToInput,
  personFromInput,
} from '../utils/partyData'
import { AddPartyDialog, type AddPartyMode } from './AddPartyDialog'
import { PartyForm } from './PartyForm'

/** Origens que ainda batem com o dado: editar um campo à mão tira dele a
 * marca "lido de…", que deixaria de ser verdade. */
function keepMatchingSources(
  before: PartyPersonData,
  after: PartyPersonData,
  sources: PartyFieldSources,
): PartyFieldSources {
  const kept: PartyFieldSources = {}
  for (const [field, documentId] of Object.entries(sources) as [keyof PartyPersonData, string][]) {
    if (JSON.stringify(before[field]) === JSON.stringify(after[field])) kept[field] = documentId
  }
  return kept
}

interface ContractPartiesSectionProps {
  contractId: string
  templateRoles: readonly TemplatePartyRole[]
  /** Os arquivos do contrato — dão nome às origens "lido de…". */
  documents: readonly DocumentWithRelations[]
  onReadDocuments: () => void
}

/** As partes do contrato: quem são, de onde vieram os dados e o que falta. */
export function ContractPartiesSection({
  contractId,
  templateRoles,
  documents,
  onReadDocuments,
}: ContractPartiesSectionProps) {
  const { data: parties = [], isLoading } = useContractParties(contractId)
  const updateParty = useUpdateContractParty(contractId)
  const deleteParty = useDeleteContractParty(contractId)
  const refreshParty = useRefreshPartyFromClient(contractId)
  const createClient = useCreateCliente()
  const createPerson = useCreatePessoa()
  const [adding, setAdding] = useState<AddPartyMode | null>(null)
  const [editing, setEditing] = useState<ContractParty | null>(null)
  const [removing, setRemoving] = useState<ContractParty | null>(null)
  const [registering, setRegistering] = useState<ContractParty | null>(null)
  const [registeringKind, setRegisteringKind] = useState<RecordKind>('person')

  const rolesWithoutParty = templateRoles.filter(
    (role) => !parties.some((party) => party.role_key === role.key),
  )
  const documentName = (id: string) => {
    if (id === RECEITA_SOURCE) return 'Receita (CNPJ)'
    const document = documents.find((item) => item.id === id)
    if (!document) return null
    return sourceKindLabel(document.source_kind) ?? document.file_name
  }

  /** Parte de contrato que não está no cadastro nasce pessoa (migration 78):
   * fiador, locador e testemunha não são clientes, e como cliente cairiam na
   * lista de Clientes e nas Pendências. O formulário deixa trocar — o
   * contratante de honorários, por exemplo, é cliente. */
  function startRegistering(party: ContractParty) {
    setRegisteringKind('person')
    setRegistering(party)
  }

  async function registerAsClient(party: ContractParty, input: CreateClientInput) {
    const client =
      registeringKind === 'person'
        ? await createPerson.mutateAsync(input)
        : await createClient.mutateAsync(input)
    await updateParty.mutateAsync({ id: party.id, patch: { client_id: client.id } })
    setRegistering(null)
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Partes</h2>
          {parties.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {parties.length}
            </span>
          )}
        </div>
        <Can resource="contratos" action="update">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-3.5 w-3.5" />
                Adicionar parte
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onReadDocuments}>
                <FileSearch className="h-4 w-4" />
                Ler documentos (CNH, RG, comprovante…)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAdding('cliente')}>
                <Users className="h-4 w-4" />
                Do cadastro de pessoas
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAdding('escritorio')}>
                <Building2 className="h-4 w-4" />
                O escritório
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAdding('manual')}>
                <Pencil className="h-4 w-4" />
                Digitar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Can>
      </div>

      {rolesWithoutParty.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <span>
            O modelo usa{' '}
            {rolesWithoutParty.map((role) => role.label).join(', ')} e o contrato ainda não tem
            parte nesse papel — os campos saem como [FALTA].
          </span>
        </p>
      )}

      {isLoading ? (
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
      ) : parties.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center text-muted-foreground">
          <UserRound className="h-7 w-7" />
          <p className="text-sm">Nenhuma parte ainda</p>
          <p className="max-w-sm text-xs">
            Leia os documentos das partes, escolha do cadastro de clientes ou digite. A minuta
            preenche os campos de cada papel com elas.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {parties.map((party) => {
            const values = personFieldValues(party)
            const missing = missingPartyData(party)
            const sources = [
              ...new Set(
                Object.values(party.field_sources)
                  .map((id) => (id ? documentName(id) : null))
                  .filter((name): name is string => !!name),
              ),
            ]
            return (
              <li key={party.id} className="group space-y-1.5 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-start gap-2">
                  <Badge variant="secondary" className="text-[11px]">
                    {party.role_label}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {party.name ?? 'Sem nome'}
                      {party.document && (
                        <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                          {formatDocument(party.document)}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {CONTRACT_PARTY_SOURCE_LABELS[party.source]}
                      {sources.length > 0 && ` · lido de ${sources.join(', ')}`}
                      {party.client_id && (
                        <>
                          {' · '}
                          {/* Sem o embed (RLS), cai na ficha de cliente, que
                              redireciona se o cadastro for de pessoa. */}
                          <Link
                            href={
                              party.client?.is_client === false
                                ? `/pessoas/${party.client_id}`
                                : `/clientes/${party.client_id}`
                            }
                            className="hover:text-foreground hover:underline"
                          >
                            {party.client?.is_client === false
                              ? 'pessoa cadastrada'
                              : 'cliente cadastrado'}
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  <Can resource="contratos" action="update">
                    <div className="flex shrink-0 items-center gap-0.5">
                      {party.client_id ? (
                        <button
                          type="button"
                          title="Atualizar do cadastro"
                          onClick={() => refreshParty.mutate(party)}
                          disabled={refreshParty.isPending}
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <Can resource="clientes" action="create">
                          <button
                            type="button"
                            title="Cadastrar"
                            onClick={() => startRegistering(party)}
                            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                          </button>
                        </Can>
                      )}
                      <button
                        type="button"
                        title="Editar"
                        onClick={() => setEditing(party)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Tirar do contrato"
                        onClick={() => setRemoving(party)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </Can>
                </div>
                {values.qualificacao && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {values.qualificacao}
                  </p>
                )}
                {missing.length > 0 && (
                  <p className="flex items-center gap-1 text-[11px] text-warning">
                    <AlertTriangle className="h-3 w-3" />
                    Falta: {missing.join(', ')}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <AddPartyDialog
        contractId={contractId}
        mode={adding}
        onClose={() => setAdding(null)}
        templateRoles={templateRoles}
        suggestedRole={rolesWithoutParty[0] ?? null}
      />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar parte</DialogTitle>
            <DialogDescription>
              Muda só este contrato. O cadastro do cliente, se houver, continua como está.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <PartyForm
              defaultValues={partyToInput(editing)}
              templateRoles={templateRoles}
              isLoading={updateParty.isPending}
              submitLabel="Salvar parte"
              onSubmit={(data) => {
                const person = personFromInput(data)
                updateParty.mutate(
                  {
                    id: editing.id,
                    patch: {
                      ...person,
                      role_key: data.role_key,
                      role_label: data.role_label,
                      field_sources: keepMatchingSources(editing, person, editing.field_sources),
                    },
                  },
                  { onSuccess: () => setEditing(null) },
                )
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ClienteForm
        open={registering !== null}
        onClose={() => setRegistering(null)}
        isLoading={createClient.isPending || createPerson.isPending || updateParty.isPending}
        defaultValues={registering ? clientDefaultsFromParty(registering) : undefined}
        kind={registeringKind}
        onKindChange={setRegisteringKind}
        onSubmit={(input) => {
          if (!registering) return
          registerAsClient(registering, input).catch(() => {
            // As mutações já avisaram; o formulário fica aberto para corrigir.
          })
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Tirar parte do contrato"
        description={`"${removing?.name ?? 'Esta parte'}" sai do contrato. Os documentos dela continuam nos arquivos.`}
        confirmLabel="Tirar"
        loadingLabel="Tirando..."
        isLoading={deleteParty.isPending}
        onConfirm={() => {
          if (!removing) return
          deleteParty.mutate(removing.id, { onSuccess: () => setRemoving(null) })
        }}
      />
    </section>
  )
}
