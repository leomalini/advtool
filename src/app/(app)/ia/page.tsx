import { Suspense } from 'react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { IaContent } from '@/features/ia/components/IaContent'

export default async function IaPage() {
  await requirePermission('ia')
  return (
    // `useSearchParams` exige Suspense no App Router.
    <Suspense>
      <IaContent />
    </Suspense>
  )
}
