import { Suspense } from 'react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { ClientesContent } from '@/features/clientes/components/ClientesContent'
import { isEmailConfigured } from '@/lib/email/config'

export default async function ClientesPage() {
  await requirePermission('clientes')

  return (
    <Suspense fallback={null}>
      {/* Lido aqui, no servidor: a chave do Resend não chega ao navegador. */}
      <ClientesContent emailEnabled={isEmailConfigured()} />
    </Suspense>
  )
}
