import { requirePermission } from '@/lib/auth/requirePermission'
import { AgendaContent } from '@/features/agenda/components/AgendaContent'

export default async function AgendaPage() {
  await requirePermission('agenda')
  return <AgendaContent />
}
