import { requirePermission } from '@/lib/auth/requirePermission'
import { PendenciasContent } from '@/features/pendencias/components/PendenciasContent'

export default async function PendenciasPage() {
  await requirePermission('pendencias')
  return <PendenciasContent />
}
