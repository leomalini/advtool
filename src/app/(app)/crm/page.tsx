import { requirePermission } from '@/lib/auth/requirePermission'
import { CrmWorkboard } from '@/features/crm/components/CrmWorkboard'

export default async function CrmPage() {
  await requirePermission('crm')
  return <CrmWorkboard />
}
