import { requirePermission } from '@/lib/auth/requirePermission'
import { ConfiguracoesContent } from '@/features/configuracoes/components/ConfiguracoesContent'

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requirePermission('configuracoes')

  const { aba } = await searchParams
  return <ConfiguracoesContent initialTab={typeof aba === 'string' ? aba : undefined} />
}
