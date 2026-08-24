import { Suspense } from 'react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { ProcessosContent } from '@/features/processos/components/ProcessosContent'

export default async function ProcessosPage() {
  await requirePermission('processos')

  return (
    <Suspense fallback={null}>
      <ProcessosContent />
    </Suspense>
  )
}
