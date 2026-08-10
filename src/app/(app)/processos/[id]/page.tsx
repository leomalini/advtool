import { Suspense } from 'react'
import { ProcessoDetailPage } from '@/features/processos/components/ProcessoDetailPage'

export default async function ProcessoDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <Suspense fallback={null}>
      <ProcessoDetailPage processoId={id} />
    </Suspense>
  )
}
