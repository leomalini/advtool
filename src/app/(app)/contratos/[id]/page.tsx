import { requirePermission } from '@/lib/auth/requirePermission'
import { d4signSetupStatus } from '@/lib/d4sign/config'
import { ContractDetailPage } from '@/features/contratos/components/ContractDetailPage'

export default async function ContratoDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission('contratos')
  const { id } = await params

  // Só os nomes do que falta: as chaves da D4Sign não saem do servidor.
  return (
    <ContractDetailPage contractId={id} signatureReady={d4signSetupStatus().problems.length === 0} />
  )
}
