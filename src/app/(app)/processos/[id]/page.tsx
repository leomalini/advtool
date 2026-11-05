import { Suspense } from 'react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { ProcessoDetailPage } from '@/features/processos/components/ProcessoDetailPage'

/**
 * The `key` is the query that reached the server: a link to this same page with
 * another tab or entry — the bell's success fee notice — remounts it on them.
 * The page reads them with `useSearchParams`, hence the `Suspense`.
 */
export default async function ProcessoDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requirePermission('processos')
  const { id } = await params
  const { aba, apurar, publicacao } = await searchParams

  return (
    <Suspense fallback={null}>
      <ProcessoDetailPage key={`${id}:${aba}:${apurar}:${publicacao}`} processoId={id} />
    </Suspense>
  )
}
