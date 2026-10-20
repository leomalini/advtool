import { Suspense } from 'react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { MovimentacoesContent } from '@/features/movimentacoes/components/MovimentacoesContent'

/**
 * Movimentação é sub-entidade de processo pela convenção da migration 36, e a
 * RLS de `legal_process_movements` responde a `processos:*` — então o porteiro
 * da rota é `processos`, não um recurso próprio. Quem vê processos vê o feed, e
 * não há como configurar um perfil que abra a tela sem poder ler o dado.
 */
export default async function MovimentacoesPage() {
  await requirePermission('processos')

  return (
    <Suspense fallback={null}>
      <MovimentacoesContent />
    </Suspense>
  )
}
