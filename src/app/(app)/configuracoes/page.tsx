import { requirePermission } from '@/lib/auth/requirePermission'
import { infinitePaySetupStatus } from '@/lib/infinitepay/setup'
import { d4signSetupStatus } from '@/lib/d4sign/config'
import { ConfiguracoesContent } from '@/features/configuracoes/components/ConfiguracoesContent'

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requirePermission('configuracoes')

  const { aba } = await searchParams
  return (
    <ConfiguracoesContent
      initialTab={typeof aba === 'string' ? aba : undefined}
      paymentsSetup={infinitePaySetupStatus()}
      signatureSetup={d4signSetupStatus()}
    />
  )
}
