'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

const MIN_LENGTH = 8

export function DefinirSenhaForm() {
  const router = useRouter()
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (senha.length < MIN_LENGTH) {
      setErro(`A senha precisa de pelo menos ${MIN_LENGTH} caracteres.`)
      return
    }
    if (senha !== confirmacao) {
      setErro('As senhas não coincidem.')
      return
    }

    setLoading(true)

    // Funciona porque o link do convite já criou a sessão no callback — é ela
    // que autoriza a troca, sem senha antiga.
    const { error } = await createClient().auth.updateUser({ password: senha })

    if (error) {
      setErro('Não foi possível definir a senha. O link pode ter expirado.')
      setLoading(false)
      return
    }

    toast.success('Senha definida! Bem-vindo(a).')
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="senha">Nova senha</Label>
        <Input
          id="senha"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
          autoComplete="new-password"
          minLength={MIN_LENGTH}
        />
        <p className="text-xs text-muted-foreground">Mínimo de {MIN_LENGTH} caracteres.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmacao">Confirme a senha</Label>
        <Input
          id="confirmacao"
          type="password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          required
          autoComplete="new-password"
        />
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Definir senha e entrar
      </Button>
    </form>
  )
}
