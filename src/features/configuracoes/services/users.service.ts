import type {
  AdminUser,
  InviteUserResult,
  ResendChannel,
  ResendInviteResult,
} from '@/types/user.types'
import type { InviteUserInput, UpdateUserInput } from '@/schemas/user.schema'

/**
 * Único service do projeto que NÃO fala com o Supabase direto.
 *
 * Gerenciar usuários exige ler `auth.users` (e-mail, confirmação do convite) e
 * escrever perfis de outras pessoas — as duas coisas só a `service_role` faz, e
 * ela nunca pode chegar ao browser. Por isso a rota `/api/admin/users` no meio:
 * ela confirma que o chamador é admin com o client de sessão e só então usa a
 * chave privilegiada.
 *
 * Consequência prática: as mensagens de erro aqui vêm do servidor, já em
 * português e já sem detalhe interno.
 */

const BASE = '/api/admin/users'

/** A rota responde `{ error: string }` em toda falha. Traduzir HTTP em Error
 * aqui deixa os hooks livres para só exibir `err.message`. */
async function throwApiError(response: Response): Promise<never> {
  let message = 'Erro inesperado. Tente novamente.'

  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body.error === 'string') message = body.error
  } catch {
    // Resposta sem corpo JSON (502 de proxy, por exemplo) — fica a genérica.
  }

  throw new Error(message)
}

export async function getUsers(): Promise<AdminUser[]> {
  const response = await fetch(BASE)
  if (!response.ok) await throwApiError(response)

  const body = (await response.json()) as { users: AdminUser[] }
  return body.users
}

/**
 * Devolve o resultado, e não `void`, porque a conta pode nascer sem que o
 * e-mail saia: nesse caso vem um `action_link` para o admin entregar à mão.
 */
export async function inviteUser(input: InviteUserInput): Promise<InviteUserResult> {
  const response = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!response.ok) await throwApiError(response)

  return (await response.json()) as InviteUserResult
}

export async function updateUser(id: string, patch: UpdateUserInput): Promise<void> {
  const response = await fetch(`${BASE}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })

  if (!response.ok) await throwApiError(response)
}

/**
 * Reemite o convite de quem ainda não o aceitou.
 *
 * `canal: 'link'` pula o e-mail e devolve o link direto — é o caminho de quem
 * ainda não configurou SMTP. Devolve o resultado em vez de `void` porque o
 * desfecho muda o que a tela faz: com link, ela abre o diálogo de cópia.
 */
export async function resendInvite(
  id: string,
  canal: ResendChannel = 'email'
): Promise<ResendInviteResult> {
  const response = await fetch(`${BASE}/${id}/resend?via=${canal}`, { method: 'POST' })
  if (!response.ok) await throwApiError(response)

  return (await response.json()) as ResendInviteResult
}
