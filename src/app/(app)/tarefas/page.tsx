import { requirePermission } from '@/lib/auth/requirePermission'
import { TarefasContent } from '@/features/tarefas/components/TarefasContent'

export default async function TarefasPage() {
  await requirePermission('tarefas')
  return <TarefasContent />
}
