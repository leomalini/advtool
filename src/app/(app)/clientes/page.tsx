import { Suspense } from 'react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { ClientesContent } from '@/features/clientes/components/ClientesContent'

export default async function ClientesPage() {
  await requirePermission('clientes')

  return (
    <Suspense fallback={null}>
      <ClientesContent />
    </Suspense>
  )
}
