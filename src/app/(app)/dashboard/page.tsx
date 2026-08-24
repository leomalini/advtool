import { requirePermission } from '@/lib/auth/requirePermission'
import { DashboardContent } from '@/features/dashboard/components/DashboardContent'

export default async function DashboardPage() {
  await requirePermission('dashboard')
  return <DashboardContent />
}
