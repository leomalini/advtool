import { requirePermission } from '@/lib/auth/requirePermission'
import { FinanceiroContent } from '@/features/financeiro/components/FinanceiroContent'

export default async function FinanceiroPage() {
  await requirePermission('financeiro')
  return <FinanceiroContent />
}
