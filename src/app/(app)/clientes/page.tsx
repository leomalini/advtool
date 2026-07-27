import { Suspense } from 'react'
import { ClientesContent } from '@/features/clientes/components/ClientesContent'

export default function ClientesPage() {
  return (
    <Suspense fallback={null}>
      <ClientesContent />
    </Suspense>
  )
}
