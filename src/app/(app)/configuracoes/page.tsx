import { requirePermission } from '@/lib/auth/requirePermission'
import { ConfiguracoesContent } from '@/features/configuracoes/components/ConfiguracoesContent'

export default async function ConfiguracoesPage() {
  await requirePermission('configuracoes')
  return <ConfiguracoesContent />
}
