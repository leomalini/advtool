import { requirePermission } from '@/lib/auth/requirePermission'
import { FinanceiroContent } from '@/features/financeiro/components/FinanceiroContent'
import { parseSituationFilter } from '@/features/financeiro/utils/filterFinancialEntries'

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requirePermission('financeiro')

  // `?id=` vem do aviso do sino (pagamento recebido pela InfinitePay): abre o
  // lançamento direto. `?situacao=` vem do dashboard: abre a lista no recorte
  // do número clicado. A `key` remonta a tela quando um dos dois muda.
  const { id, situacao } = await searchParams
  const entryId = typeof id === 'string' ? id : undefined
  const situation = parseSituationFilter(situacao)
  return (
    <FinanceiroContent
      key={`${entryId ?? 'lista'}:${situation ?? 'tudo'}`}
      initialEntryId={entryId}
      initialSituation={situation}
    />
  )
}
