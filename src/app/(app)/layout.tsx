export const dynamic = 'force-dynamic'

import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { AssistantPanel } from '@/features/ia/components/AssistantPanel'

/**
 * O shell é `fixed inset-0`, não `h-screen`.
 *
 * `h-screen` é 100vh, que NÃO é a mesma coisa que o espaço visível: qualquer
 * pressão de layout que reduza a viewport — uma barra de rolagem horizontal, a
 * barra de endereço no mobile — deixa o shell mais alto do que cabe, e o
 * documento inteiro passa a rolar alguns pixels. Como a sidebar vive dentro
 * dele, ela sobe junto: é o "scroll além do conteúdo que leva a sidebar".
 *
 * Fora do fluxo, o shell não contribui NADA para a altura do documento e é
 * medido contra a viewport real. O documento não tem mais como rolar nas rotas
 * do app; quem rola é o `main`, que é o que sempre se quis.
 *
 * O `p-3 gap-3` deixa a sidebar flutuar como um cartão sobre o fundo azulado
 * (docs/redesign-visual.md). O `px-3` do `main` dá espaço para a sombra dos
 * cards não ser cortada pela rolagem.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex gap-3 overflow-hidden bg-background p-3">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto px-3 pt-2 pb-6">{children}</main>
      </div>
      <AssistantPanel />
    </div>
  )
}
