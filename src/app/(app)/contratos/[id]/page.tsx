import { requirePermission } from '@/lib/auth/requirePermission'
import { ContractDetailPage } from '@/features/contratos/components/ContractDetailPage'

export default async function ContratoDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission('contratos')
  const { id } = await params

  return <ContractDetailPage contractId={id} />
}
