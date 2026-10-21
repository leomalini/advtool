import { Suspense } from 'react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { ClientesContent } from '@/features/clientes/components/ClientesContent'

/** Pessoas é a mesma tabela de Clientes (migration 78), sob o mesmo recurso
 * `clientes` — um recurso próprio exigiria policy por linha. */
export default async function PessoasPage() {
  await requirePermission('clientes')

  return (
    <Suspense fallback={null}>
      <ClientesContent scope="people" />
    </Suspense>
  )
}
