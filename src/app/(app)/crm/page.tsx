import { requirePermission } from '@/lib/auth/requirePermission'
import { CrmWorkboard } from '@/features/crm/components/CrmWorkboard'

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requirePermission('crm')

  // `?id=` vem da lista de casos do cliente: abre o card direto, no fluxo dele.
  // A `key` remonta o quadro quando o link aponta para outro card.
  const { id } = await searchParams
  const itemId = typeof id === 'string' ? id : undefined
  return <CrmWorkboard key={itemId ?? 'quadro'} initialItemId={itemId} />
}
