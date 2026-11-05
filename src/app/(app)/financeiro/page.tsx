import { Suspense } from 'react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { FinanceiroContent } from '@/features/financeiro/components/FinanceiroContent'

/**
 * The screen reads its filters and the open entry from the URL with
 * `useSearchParams` (hence the `Suspense`), and rewrites the URL itself with
 * `history.replaceState`, which never comes back here.
 *
 * The `key` is the query that reached the server: a link that brings other
 * filters — the bell's `?id=`, a dashboard number, the Assistant — remounts
 * the screen on them, instead of keeping the filters it had.
 */
export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requirePermission('financeiro')

  const params = await searchParams
  const query = new URLSearchParams(
    Object.entries(params).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : []
    )
  ).toString()

  return (
    <Suspense fallback={null}>
      <FinanceiroContent key={query} />
    </Suspense>
  )
}
