import { Suspense } from 'react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { PublicacoesContent } from '@/features/publicacoes/components/PublicacoesContent'

export default async function PublicacoesPage() {
  await requirePermission('publicacoes')

  return (
    <Suspense fallback={null}>
      <PublicacoesContent />
    </Suspense>
  )
}
