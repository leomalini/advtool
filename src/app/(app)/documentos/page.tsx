import { requirePermission } from '@/lib/auth/requirePermission'
import { DocumentosTabs } from '@/features/documentos/components/DocumentosTabs'

export default async function DocumentosPage() {
  await requirePermission('documentos')
  return <DocumentosTabs />
}
