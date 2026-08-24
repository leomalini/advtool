import { Suspense } from 'react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { ProcessoDetailPage } from '@/features/processos/components/ProcessoDetailPage'

export default async function ProcessoDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission('processos')
  const { id } = await params

  return (
    <Suspense fallback={null}>
      <ProcessoDetailPage processoId={id} />
    </Suspense>
  )
}
