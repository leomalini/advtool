'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export function useAuth() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  /**
   * Encerrar a sessão é só o primeiro dos três passos.
   *
   * Sem os outros dois, a pessoa fica parada na rota em que estava vendo a
   * casca da aplicação: `user` vira `null`, a Sidebar esconde todos os módulos
   * por falta de permissão e o e-mail cai para o placeholder — mas a URL segue
   * em `/dashboard` até um F5. O proxy só redireciona na próxima navegação, e
   * nenhuma acontece por conta própria.
   */
  const signOut = async () => {
    const { error } = await supabase.auth.signOut()

    // Não bloqueia a saída: o supabase-js já limpou o storage local, e manter a
    // pessoa numa tela autenticada porque a rede caiu seria o pior desfecho.
    if (error) console.error('[auth] signOut falhou:', error.message)

    // O cache do React Query ainda guarda os dados do escritório carregados sob
    // a sessão que acabou de morrer. Num computador compartilhado do escritório
    // — que é o cenário deste produto —, o próximo login renderizaria esse
    // conteúdo antes do primeiro refetch.
    queryClient.clear()

    // `replace` e não `push`: voltar no histórico não deve reabrir a tela de
    // quem saiu. E o `refresh` descarta o cache de Server Components, montado
    // com a sessão antiga.
    router.replace('/login')
    router.refresh()
  }

  return { user, loading, signOut }
}
