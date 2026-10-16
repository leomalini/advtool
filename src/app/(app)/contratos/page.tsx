import { requirePermission } from '@/lib/auth/requirePermission'
import { ContratosTabs } from '@/features/contratos/components/ContratosTabs'

export default async function ContratosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requirePermission('contratos')

  const { aba } = await searchParams
  return <ContratosTabs initialTab={typeof aba === 'string' ? aba : undefined} />
}
