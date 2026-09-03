import { requirePermission } from '@/lib/auth/requirePermission'
import { PublicacaoDetailPage } from '@/features/publicacoes/components/PublicacaoDetailPage'

export default async function PublicacaoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission('publicacoes')
  const { id } = await params

  return <PublicacaoDetailPage publicacaoId={id} />
}
