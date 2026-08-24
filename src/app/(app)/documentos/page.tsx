import { requirePermission } from '@/lib/auth/requirePermission'
import { DocumentosContent } from '@/features/documentos/components/DocumentosContent'

export default async function DocumentosPage() {
  await requirePermission('documentos')
  return <DocumentosContent />
}
