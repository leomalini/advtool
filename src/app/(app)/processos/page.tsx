import { Suspense } from 'react'
import { ProcessosContent } from '@/features/processos/components/ProcessosContent'

export default function ProcessosPage() {
  return (
    <Suspense fallback={null}>
      <ProcessosContent />
    </Suspense>
  )
}
