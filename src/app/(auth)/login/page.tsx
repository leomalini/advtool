import { LoginForm } from './LoginForm'
import { Scale, TriangleAlert } from 'lucide-react'

/** O callback redireciona para cá quando o token do link não vale mais. */
const MENSAGENS_DE_ERRO: Record<string, string> = {
  link_invalido:
    'Este link expirou ou já foi usado. Peça um novo convite ao administrador, ou use "Esqueci minha senha".',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const erro = (await searchParams).erro
  const mensagem = typeof erro === 'string' ? MENSAGENS_DE_ERRO[erro] : undefined

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground mb-4">
            <Scale className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">Jurídico</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Entre com sua conta para continuar
          </p>
        </div>
        {mensagem && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive">
            <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
            <p>{mensagem}</p>
          </div>
        )}

        <div className="bg-card rounded-xl border shadow-sm p-6">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
