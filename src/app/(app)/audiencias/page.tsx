import { Suspense } from 'react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { AudienciasContent } from '@/features/audiencias/components/AudienciasContent'

/**
 * A ficha da audiência não se lê sem o evento da Agenda, e a RLS de
 * `hearings` responde a `agenda:*` (migration 76) — então o porteiro da rota é
 * `agenda`, não um recurso próprio. Mesmo raciocínio de Movimentações com
 * `processos`.
 *
 * `Suspense`: a tela lê `?ficha=` com `useSearchParams`.
 */
export default async function AudienciasPage() {
  await requirePermission('agenda')

  return (
    <Suspense fallback={null}>
      <AudienciasContent />
    </Suspense>
  )
}
