export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { KeyRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { DefinirSenhaForm } from './DefinirSenhaForm'

/**
 * Destino do link de convite, via `/api/auth/callback?next=/definir-senha`.
 *
 * A pessoa chega aqui já com sessão (o callback trocou o código por uma), mas
 * sem senha própria — daí `updateUser({ password })` funcionar sem pedir a
 * antiga. Sem sessão não há o que definir, então volta para o login.
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
