import { Suspense } from 'react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { ClienteDetailPage } from '@/features/clientes/components/ClienteDetailPage'

export default async function ClienteDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission('clientes')
  const { id } = await params

  return (
    <Suspense fallback={null}>
      <ClienteDetailPage clienteId={id} />
    </Suspense>
  )
}
