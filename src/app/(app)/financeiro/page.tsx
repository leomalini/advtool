import { requirePermission } from '@/lib/auth/requirePermission'
import { FinanceiroContent } from '@/features/financeiro/components/FinanceiroContent'

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requirePermission('financeiro')

  // `?id=` vem do aviso do sino (pagamento recebido pela InfinitePay): abre o
  // lançamento direto. A `key` remonta a tela quando o aviso aponta para outro.
  const { id } = await searchParams
  const entryId = typeof id === 'string' ? id : undefined
  return <FinanceiroContent key={entryId ?? 'lista'} initialEntryId={entryId} />
}
