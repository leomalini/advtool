import { Suspense } from 'react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { redirectToRecordKind } from '@/lib/cadastro/recordKindRoute'
import { ClienteDetailPage } from '@/features/clientes/components/ClienteDetailPage'

export default async function ClienteDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission('clientes')
  const { id } = await params
  // Quem não é cliente abre na ficha de pessoa (migration 78).
  await redirectToRecordKind(id, 'client')

  return (
    <Suspense fallback={null}>
      <ClienteDetailPage clienteId={id} />
    </Suspense>
  )
}
