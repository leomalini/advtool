import { KeyRound } from 'lucide-react'
import { RecuperarSenhaForm } from './RecuperarSenhaForm'

/**
 * Pública — quem esqueceu a senha não tem sessão. Está em `PAGINAS_PUBLICAS`
 * de `src/lib/supabase/middleware.ts`.
 */
export default function RecuperarSenhaPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground mb-4">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-center">Esqueci minha senha</h1>
          <p className="text-sm text-muted-foreground mt-1 text-center">
            Informe seu e-mail e enviaremos um link para escolher uma nova senha.
          </p>
        </div>

        <div className="bg-card rounded-xl border shadow-sm p-6">
          <RecuperarSenhaForm />
        </div>
      </div>
    </div>
  )
}
