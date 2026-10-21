import { Suspense } from 'react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { redirectToRecordKind } from '@/lib/cadastro/recordKindRoute'
import { PessoaDetailPage } from '@/features/clientes/components/PessoaDetailPage'

export default async function PessoaDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission('clientes')
  const { id } = await params
  // Cliente abre na ficha de cliente, onde estão processos e pendências.
  await redirectToRecordKind(id, 'person')

  return (
    <Suspense fallback={null}>
      <PessoaDetailPage pessoaId={id} />
    </Suspense>
  )
}
