export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { ShieldOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from './SignOutButton'

/**
 * Fim de linha para quem tem sessão válida mas nenhuma permissão — na prática,
 * conta desativada. Existe para quebrar o loop de redirect descrito em
 * `requirePermission()`: toda rota do app manda o usuário sem acesso para cá, e
 * daqui ele só sai saindo.
 *
 * Fica fora do grupo `(app)` para não renderizar Sidebar nem Header, que
 * consultariam dados que esta pessoa não pode ler.
 */
export default async function SemAcessoPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // A policy `profiles_select` deixa qualquer um ler a própria linha justamente
  // para este caso: sem isso, a tela não teria como distinguir "desativado" de
  // "sem permissão para esta área".
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, is_active')
    .eq('id', user.id)
    .maybeSingle()

  const desativado = profile?.is_active === false

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground mb-4">
            <ShieldOff className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-center">
            {desativado ? 'Acesso desativado' : 'Sem permissão'}
          </h1>
          <p className="text-sm text-muted-foreground mt-2 text-center">
            {desativado
              ? 'Sua conta foi desativada por um administrador do escritório. Procure quem administra o AdvTool para reativá-la.'
              : 'Seu perfil não tem acesso a nenhuma área do sistema. Peça a um administrador para revisar suas permissões.'}
          </p>
        </div>

        <div className="bg-card rounded-xl border shadow-sm p-6 space-y-4">
          <p className="text-xs text-muted-foreground text-center">
            Conectado como{' '}
            <span className="font-medium text-foreground">
              {profile?.full_name ?? user.email}
            </span>
          </p>
          <SignOutButton />
        </div>
      </div>
    </div>
  )
}
