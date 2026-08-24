export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { KeyRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { DefinirSenhaForm } from './DefinirSenhaForm'

/**
 * Destino de DOIS links, ambos via `/api/auth/callback?next=/definir-senha`:
 * o convite (`type=invite`) e a recuperação de senha (`type=recovery`).
 *
 * A pessoa chega aqui já com sessão — o callback trocou o token do e-mail por
 * uma —, e é essa sessão que autoriza `updateUser({ password })` sem pedir a
 * senha antiga. Sem sessão não há o que definir, então volta para o login.
 *
 * NÃO é uma página pública: se estivesse em `PAGINAS_PUBLICAS` do
 * `middleware.ts`, quem tem sessão seria mandado ao dashboard sem nunca poder
 * escolher a senha.
 */
export default async function DefinirSenhaPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground mb-4">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-center">Defina sua senha</h1>
          <p className="text-sm text-muted-foreground mt-1 text-center">
            {profile?.full_name
              ? `Olá, ${profile.full_name.split(' ')[0]} — escolha uma senha para acessar o AdvTool.`
              : 'Escolha uma senha para acessar o AdvTool.'}
          </p>
        </div>

        <div className="bg-card rounded-xl border shadow-sm p-6">
          <DefinirSenhaForm />
        </div>
      </div>
    </div>
  )
}
