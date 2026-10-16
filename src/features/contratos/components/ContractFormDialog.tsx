'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ContractInput, UpdateContractInput } from '@/schemas/contract.schema'
import type { Contract } from '@/types/contract.types'
import {
  useCreateContract,
  useUpdateContract,
  type PendingContractFile,
} from '../hooks/useContractMutations'
import { ContractForm } from './ContractForm'

/** O registro como o formulário o edita: texto vazio onde o banco tem null. */
function toFormValues(contract: Contract): Partial<ContractInput> {
  return {
    kind: contract.kind,
    title: contract.title,
    status: contract.status,
    client_id: contract.client_id ?? '',
    legal_process_id: contract.legal_process_id ?? '',
    responsible_id: contract.responsible_id ?? '',
    template_id: contract.template_id ?? '',
    total_amount: contract.total_amount,
    installments: contract.installments,
    first_due_date: contract.first_due_date ?? '',
    success_fee_percent: contract.success_fee_percent,
    start_date: contract.start_date ?? '',
    end_date: contract.end_date ?? '',
    notice_days: contract.notice_days,
    auto_renew: contract.auto_renew,
    adjustment_index: contract.adjustment_index ?? '',
    signed_at: contract.signed_at ?? '',
    notes: contract.notes ?? '',
  }
}

interface ContractFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Contrato em edição. Sem ele, a tela registra um contrato novo e abre o
   * detalhe dele. */
  contract?: Contract | null
  /** Contrato novo já ligado a algo — a aba Contratos do cliente ou do processo. */
  initialValues?: Partial<ContractInput>
}

export function ContractFormDialog({
  open,
  onOpenChange,
  contract = null,
  initialValues,
}: ContractFormDialogProps) {
  const router = useRouter()
  // Aqui, e não no formulário: o diálogo existe desde que a página abriu, então
  // a sessão já foi lida quando ele abre. Um `useAuth` montado junto com o
  // formulário ainda estaria sem usuário no primeiro render, e o padrão do
  // responsável sairia vazio.
  const { user } = useAuth()
  const createContract = useCreateContract()
  const updateContract = useUpdateContract()
  const editing = contract !== null

  async function handleSubmit(data: ContractInput, files: PendingContractFile[]) {
    if (editing) {
      const patch: UpdateContractInput = { ...data, id: contract.id }
      // O status não é editado aqui: muda pelos botões do detalhe, e o valor
      // do formulário pode estar velho se outra pessoa o mudou nesse meio-tempo.
      delete patch.status
      await updateContract.mutateAsync(patch)
      onOpenChange(false)
      return
    }
    const { contract: created } = await createContract.mutateAsync({ ...data, files })
    onOpenChange(false)
    router.push(`/contratos/${created.id}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar contrato' : 'Novo contrato'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'O status muda pelos botões do contrato, que guardam o histórico.'
              : 'Registre o contrato e anexe a minuta ou a versão assinada. A minuta também ' +
                'pode ser gerada de um modelo, depois, no contrato.'}
          </DialogDescription>
        </DialogHeader>
        {/* Montado a cada abertura: começa limpo (ou com o contrato em edição). */}
        {open && (
          <ContractForm
            defaultValues={
              contract
                ? toFormValues(contract)
                : { responsible_id: user?.id ?? '', ...initialValues }
            }
            onSubmit={(data, files) => {
              handleSubmit(data, files).catch(() => {
                // O aviso já saiu pelo onError da mutação; o formulário fica
                // aberto para tentar de novo.
              })
            }}
            isLoading={createContract.isPending || updateContract.isPending}
            withStatus={!editing}
            withFiles={!editing}
            submitLabel={editing ? 'Salvar alterações' : 'Registrar contrato'}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
