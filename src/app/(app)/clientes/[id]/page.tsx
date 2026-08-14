import { Suspense } from 'react'
import { ClienteDetailPage } from '@/features/clientes/components/ClienteDetailPage'

export default async function ClienteDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <Suspense fallback={null}>
      <ClienteDetailPage clienteId={id} />
    </Suspense>
  )
}
