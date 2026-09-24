import { requirePermission } from '@/lib/auth/requirePermission'
import { DocumentosTabs } from '@/features/documentos/components/DocumentosTabs'

export default async function DocumentosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requirePermission('documentos')

  const { aba } = await searchParams
  return <DocumentosTabs initialTab={typeof aba === 'string' ? aba : undefined} />
}
