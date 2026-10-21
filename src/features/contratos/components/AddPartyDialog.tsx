'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ClienteCombobox } from '@/features/clientes/components/ClienteCombobox'
import { getClientById } from '@/features/clientes/services/clientes.service'
import { useOfficeSettings } from '@/features/configuracoes/hooks/useOfficeSettings'
import type { ContractPartyInput } from '@/schemas/contract.schema'
import type { TemplatePartyRole } from '@/types/documentTemplate.types'
import { formatDocument } from '@/utils/format'
import { useAddContractParties } from '../hooks/useContractPartyMutations'
import { personFromClient, personFromInput, personFromOffice } from '../utils/partyData'
import { PartyForm } from './PartyForm'
import { PartyRolePicker } from './PartyRolePicker'

/** De onde a parte nova vem — os botões do "Adicionar parte". */
export type AddPartyMode = 'cliente' | 'escritorio' | 'manual'

// O modo continua `cliente` (é o valor de `contract_parties.source`), mas desde
// a migration 78 ele busca em toda pessoa: fiador, locador e testemunha também
// moram no cadastro, sem ser clientes.
const TITLES: Record<AddPartyMode, string> = {
  cliente: 'Parte do cadastro de pessoas',
  escritorio: 'O escritório como parte',
  manual: 'Digitar uma parte',
}

const DESCRIPTIONS: Record<AddPartyMode, string> = {
  cliente:
    'Os dados do cadastro são copiados para o contrato. Se o cadastro mudar depois, use ' +
    '"Atualizar do cadastro" na parte.',
  escritorio:
    'Nome, CNPJ e endereço vêm de Configurações → Geral. Quem assina pelo escritório você ' +
    'completa depois, em Editar.',
  manual: 'Para quem não está no cadastro e não tem documento à mão.',
}

interface AddPartyDialogProps {
  contractId: string
  mode: AddPartyMode | null
  onClose: () => void
  templateRoles: readonly TemplatePartyRole[]
  /** Papel já sugerido — o primeiro do modelo que ainda está sem parte. */
  suggestedRole: TemplatePartyRole | null
}

export function AddPartyDialog({
  contractId,
  mode,
  onClose,
  templateRoles,
  suggestedRole,
}: AddPartyDialogProps) {
  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {mode && (
          <>
            <DialogHeader>
              <DialogTitle>{TITLES[mode]}</DialogTitle>
              <DialogDescription>{DESCRIPTIONS[mode]}</DialogDescription>
            </DialogHeader>
            {/* Montado a cada abertura: começa limpo. */}
            <AddPartyBody
              contractId={contractId}
              mode={mode}
              onDone={onClose}
              templateRoles={templateRoles}
              suggestedRole={suggestedRole}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function AddPartyBody({
  contractId,
  mode,
  onDone,
  templateRoles,
  suggestedRole,
}: {
  contractId: string
  mode: AddPartyMode
  onDone: () => void
  templateRoles: readonly TemplatePartyRole[]
  suggestedRole: TemplatePartyRole | null
}) {
  const addParties = useAddContractParties(contractId)
  const { data: office, isLoading: officeLoading } = useOfficeSettings()
  const [role, setRole] = useState<TemplatePartyRole | null>(
    mode === 'escritorio'
      ? (templateRoles.find((item) => item.key === 'contratado') ?? suggestedRole)
      : suggestedRole,
  )
  const [clientId, setClientId] = useState<string | null>(null)
  const [loadingClient, setLoadingClient] = useState(false)

  if (mode === 'manual') {
    return (
      <PartyForm
        defaultValues={
          suggestedRole ? { role_key: suggestedRole.key, role_label: suggestedRole.label } : undefined
        }
        templateRoles={templateRoles}
        isLoading={addParties.isPending}
        submitLabel="Adicionar parte"
        onSubmit={(data: ContractPartyInput) =>
          addParties.mutate(
            [
              {
                role_key: data.role_key,
                role_label: data.role_label,
                source: 'manual',
                person: personFromInput(data),
              },
            ],
            { onSuccess: onDone },
          )
        }
      />
    )
  }

  async function addFromClient() {
    if (!role?.key || !clientId) return
    setLoadingClient(true)
    try {
      const client = await getClientById(clientId)
      addParties.mutate(
        [
          {
            role_key: role.key,
            role_label: role.label,
            source: 'cliente',
            client_id: clientId,
            person: personFromClient(client),
          },
        ],
        { onSuccess: onDone },
      )
    } catch {
      toast.error('Não foi possível ler o cadastro.')
    } finally {
      setLoadingClient(false)
    }
  }

  function addOffice() {
    if (!role?.key || !office) return
    addParties.mutate(
      [
        {
          role_key: role.key,
          role_label: role.label,
          source: 'escritorio',
          person: personFromOffice(office),
        },
      ],
      { onSuccess: onDone },
    )
  }

  const busy = addParties.isPending || loadingClient
  const ready =
    !!role?.key && (mode === 'cliente' ? !!clientId : !!office?.name?.trim())

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="add-party-role">Papel</Label>
        <PartyRolePicker
          id="add-party-role"
          value={role}
          onChange={setRole}
          templateRoles={templateRoles}
        />
      </div>

      {mode === 'cliente' ? (
        <div className="space-y-1.5">
          <Label>Pessoa</Label>
          <ClienteCombobox value={clientId} onChange={setClientId} scope="people" />
        </div>
      ) : officeLoading ? (
        <p className="text-sm text-muted-foreground">Lendo os dados do escritório…</p>
      ) : office?.name?.trim() ? (
        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <p className="font-medium">{office.name}</p>
          <p className="text-xs text-muted-foreground">
            {[office.cnpj ? `CNPJ ${formatDocument(office.cnpj)}` : null, office.city]
              .filter(Boolean)
              .join(' · ') || 'Sem CNPJ nem endereço cadastrados'}
          </p>
        </div>
      ) : (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          O nome do escritório não está cadastrado.{' '}
          <Link href="/configuracoes" className="text-primary underline">
            Preencha em Configurações → Geral
          </Link>
          .
        </p>
      )}

      <Button
        type="button"
        className="w-full"
        disabled={!ready || busy}
        onClick={() => (mode === 'cliente' ? void addFromClient() : addOffice())}
      >
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Adicionar parte
      </Button>
    </div>
  )
}
