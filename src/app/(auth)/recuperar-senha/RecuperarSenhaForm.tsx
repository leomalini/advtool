'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MailCheck, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function RecuperarSenhaForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    // O link do e-mail volta pelo mesmo callback do convite, que troca o token
    // por sessão e encaminha para a tela de definir senha.
    await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/api/auth/callback?next=/definir-senha`,
    })

    // Sempre o mesmo desfecho, com ou sem erro: dizer "este e-mail não existe"
    // entregaria a quem tem a tela quais contas existem no escritório.
    setEnviado(true)
    setLoading(false)
  }

  if (enviado) {
    return (
      <div className="space-y-4 text-center">
        <div className="flex justify-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-success/12 text-success">
            <MailCheck className="h-5 w-5" />
          </div>
        </div>
        <p className="text-sm">
          Se houver uma conta para <span className="font-medium">{email}</span>, o link de
          redefinição chega em instantes.
        </p>
        <p className="text-xs text-muted-foreground">
          Confira também a caixa de spam. O link vale por tempo limitado.
        </p>
        <p className="text-xs text-muted-foreground">
          Não chegou? Peça um link de acesso ao administrador do escritório — ele consegue
          gerar um pela tela de Usuários.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">Voltar ao login</Link>
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Enviar link de redefinição
      </Button>

      <Button asChild variant="ghost" className="w-full">
        <Link href="/login">Voltar ao login</Link>
      </Button>
    </form>
  )
}
