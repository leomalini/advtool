import { LoginForm } from './LoginForm'
import { Scale } from 'lucide-react'

export default function LoginPage() {
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
        <div className="bg-card rounded-xl border shadow-sm p-6">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
