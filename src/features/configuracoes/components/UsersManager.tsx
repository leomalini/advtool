'use client'

import { useState } from 'react'
import { Copy, Link2, Loader2, MailCheck, ShieldOff, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Can } from '@/components/shared/Can'
import { useAuth } from '@/hooks/useAuth'
import { useUsers } from '../hooks/useUsers'
import { useInviteUser, useResendInvite, useUpdateUser } from '../hooks/useUserMutations'
import { getAvatarTone, getDisplayName, getInitials, getRoleLabel } from '@/utils/profile'
import { cn } from '@/lib/utils'
import type { AppRole } from '@/types/permission.types'
import type { AdminUser } from '@/types/user.types'

const ROLES: AppRole[] = ['admin', 'attorney', 'paralegal', 'finance']

/**
 * Um convite que precisa ser entregue à mão. Chega de dois lugares — o convite
 * novo e a reemissão —, daí viver aqui e não em nenhum dos dois.
 */
interface LinkManual {
  email: string
  action_link: string
  /** Ausente quando o admin pediu o link de propósito. */
  reason?: string
  /** Convite pendente ou redefinição de senha de quem já entrou. */
  tipo: 'invite' | 'recovery'
}

/** O que cada perfil significa na prática. Sem isso, "Estagiário" e
 * "Financeiro" não dizem quem enxerga o quê, e a escolha vira chute. */
const ROLE_HINTS: Record<AppRole, string> = {
  admin: 'Acesso total, incluindo gerenciar usuários e a estrutura do sistema.',
  attorney: 'Acesso total aos dados do escritório, incluindo o Financeiro.',
  paralegal: 'Cria e edita, não exclui e não acessa o Financeiro.',
  finance: 'Financeiro, Agenda e Tarefas. Lê o resto sem editar.',
}

// ── Diálogo de convite ───────────────────────────────────────────────────────

function InviteDialog({
  open,
  onClose,
  onLink,
}: {
  open: boolean
  onClose: () => void
  onLink: (link: LinkManual) => void
}) {
  const invite = useInviteUser()

  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<AppRole>('attorney')
  const [oab, setOab] = useState('')

  function reset() {
    setEmail('')
    setFullName('')
    setRole('attorney')
    setOab('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (invite.isPending) return

    invite.mutate(
      { email, full_name: fullName, role, oab_number: oab },
      {
        onSuccess: (result) => {
          // A conta nasceu de qualquer forma; o que varia é se o convite saiu
          // por e-mail ou se o admin precisa entregá-lo.
          if (result.action_link) {
            onLink({
              email,
              action_link: result.action_link,
              reason: result.reason,
              tipo: 'invite',
            })
          }
          reset()
          onClose()
        },
      }
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !invite.isPending) {
          reset()
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Convidar usuário</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">E-mail</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@escritorio.adv.br"
              required
            />
            <p className="text-xs text-muted-foreground">
              A pessoa recebe um link para definir a própria senha.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-name">Nome completo</Label>
            <Input
              id="invite-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-role">Perfil de acesso</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {getRoleLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{ROLE_HINTS[role]}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-oab">
              OAB <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Input
              id="invite-oab"
              value={oab}
              onChange={(e) => setOab(e.target.value)}
              placeholder="OAB/SP 123.456"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={invite.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar convite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Link manual (quando o e-mail não sai) ────────────────────────────────────

/**
 * O link é o mesmo que iria no e-mail e vale uma vez: quem copia daqui precisa
 * entregar à pessoa por outro canal.
 *
 * Dois caminhos chegam aqui, e o `reason` os separa. **Sem `reason`** o admin
 * pediu o link de propósito — o modo de operação de quem ainda não configurou
 * SMTP, já que o serviço de e-mail embutido do Supabase só entrega para
 * endereços pré-autorizados da organização. **Com `reason`**, o envio foi
 * tentado e caiu, e aí o aviso vem antes do link.
 */
function ManualLinkDialog({
  result,
  onClose,
}: {
  result: LinkManual | null
  onClose: () => void
}) {
  const [copiado, setCopiado] = useState(false)

  function handleCopy() {
    if (!result) return
    navigator.clipboard.writeText(result.action_link)
    setCopiado(true)
    toast.success('Link copiado.')
  }

  return (
    <Dialog
      open={result !== null}
      onOpenChange={(v) => {
        if (!v) {
          setCopiado(false)
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {result?.reason
              ? 'Envie o link manualmente'
              : result?.tipo === 'recovery'
                ? 'Link para redefinir a senha'
                : 'Link de convite'}
          </DialogTitle>
          <DialogDescription>
            {result?.reason ? `${result.reason} ` : ''}
            Copie o link abaixo e entregue a {result?.email} por WhatsApp ou outro canal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input readOnly value={result?.action_link ?? ''} className="text-xs font-mono" />
          <Button type="button" variant="outline" size="lg" onClick={handleCopy}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            {copiado ? 'Copiado' : 'Copiar'}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          O link dá acesso à conta uma única vez, para definir a senha. Trate-o como uma senha:
          não reencaminhe para terceiros. Gerar um novo — ou reenviar o convite — invalida este.
          {result?.tipo === 'recovery' && ' A senha atual continua valendo até a pessoa trocá-la.'}
        </p>

        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Linha da lista ───────────────────────────────────────────────────────────

function UserRow({
  user,
  isSelf,
  onLink,
}: {
  user: AdminUser
  isSelf: boolean
  onLink: (link: LinkManual) => void
}) {
  const updateUser = useUpdateUser()
  const resendInvite = useResendInvite()
  const [confirmandoDesativar, setConfirmandoDesativar] = useState(false)

  const nome = getDisplayName(user.full_name)

  return (
    <>
      <div
        className={cn(
          'grid grid-cols-[auto_1fr_120px_160px_250px] gap-4 px-5 py-3.5 items-center transition-colors hover:bg-muted/20',
          !user.is_active && 'opacity-55'
        )}
      >
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white',
            getAvatarTone(user.id)
          )}
        >
          {getInitials(nome)}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{nome}</span>
            {isSelf && <span className="text-[10px] text-muted-foreground">(você)</span>}
          </div>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </div>

        <span className="text-xs text-muted-foreground truncate">{user.oab_number ?? '—'}</span>

        {/* Trocar o perfil vale na próxima requisição da pessoa: `public.can()`
            lê o banco a cada checagem, não um claim do token. */}
        <Select
          value={user.role}
          onValueChange={(v) => updateUser.mutate({ id: user.id, role: v as AppRole })}
          disabled={updateUser.isPending || !user.is_active}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {getRoleLabel(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center justify-end gap-2">
          {/* "Reenviar" só faz sentido enquanto o convite não foi aceito — sua
              presença é o indicador de "pendente". */}
          {user.invite_pending && user.is_active && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-warning hover:text-warning"
              title="Convite ainda não aceito. Clique para reenviar por e-mail."
              onClick={() =>
                resendInvite.mutate(
                  { id: user.id, canal: 'email' },
                  { onSuccess: (result) => !result.sent && onLink({ ...result, tipo: 'invite' }) }
                )
              }
              disabled={resendInvite.isPending}
            >
              {resendInvite.isPending ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <MailCheck className="h-3 w-3 mr-1" />
              )}
              Reenviar
            </Button>
          )}

          {/* "Link" vale para toda conta ativa, e não é plano B: sem SMTP, o
              e-mail do Supabase só alcança endereços da própria organização, e
              entregar o link por WhatsApp é o caminho normal. Para quem ainda
              não aceitou, é o convite; para quem já entrou, uma redefinição de
              senha. */}
          {user.is_active && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              title={
                user.invite_pending
                  ? 'Gerar o link de convite para entregar por WhatsApp ou outro canal.'
                  : 'Gerar um link de redefinição de senha para entregar à pessoa.'
              }
              onClick={() =>
                resendInvite.mutate(
                  { id: user.id, canal: 'link' },
                  {
                    onSuccess: (result) =>
                      !result.sent &&
                      onLink({
                        ...result,
                        tipo: user.invite_pending ? 'invite' : 'recovery',
                      }),
                  }
                )
              }
              disabled={resendInvite.isPending}
            >
              <Link2 className="h-3 w-3 mr-1" />
              Link
            </Button>
          )}

          {user.is_active ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmandoDesativar(true)}
              disabled={updateUser.isPending}
            >
              Desativar
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => updateUser.mutate({ id: user.id, is_active: true })}
              disabled={updateUser.isPending}
            >
              Reativar
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmandoDesativar}
        onOpenChange={setConfirmandoDesativar}
        title={`Desativar ${nome}?`}
        description={
          isSelf
            ? 'Você perde o acesso imediatamente e precisará de outro administrador para voltar.'
            : 'A pessoa perde o acesso na próxima requisição. O histórico dela (casos, tarefas, lançamentos) permanece intacto.'
        }
        confirmLabel="Desativar"
        isLoading={updateUser.isPending}
        onConfirm={() =>
          updateUser.mutate(
            { id: user.id, is_active: false },
            { onSuccess: () => setConfirmandoDesativar(false) }
          )
        }
      />
    </>
  )
}

// ── Manager ──────────────────────────────────────────────────────────────────

/**
 * Substitui a aba Usuários que lia o mock `ADVOGADOS`.
 *
 * Não há exclusão, só desativação: `created_by`, `author_id` e `uploaded_by`
 * apontam para `profiles` em quase todo o schema, então apagar alguém obrigaria
 * a apagar o histórico junto.
 */
export function UsersManager() {
  const { user } = useAuth()
  const { data: users = [], isLoading, error } = useUsers()
  const [convidando, setConvidando] = useState(false)
  const [linkManual, setLinkManual] = useState<LinkManual | null>(null)

  const ativos = users.filter((u) => u.is_active).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Usuários do Escritório</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isLoading
              ? 'Carregando...'
              : `${ativos} ativo${ativos !== 1 ? 's' : ''} de ${users.length}`}
          </p>
        </div>

        <Can resource="usuarios" action="manage">
          <Button size="sm" onClick={() => setConvidando(true)}>
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
            Convidar Usuário
          </Button>
        </Can>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-14 text-muted-foreground">
          <ShieldOff className="h-7 w-7" />
          <p className="text-sm font-medium">Não foi possível carregar os usuários</p>
          <p className="text-xs max-w-sm text-center">{error.message}</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-14 text-muted-foreground">
          <Users className="h-7 w-7" />
          <p className="text-sm font-medium">Nenhum usuário</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_120px_160px_250px] gap-4 px-5 py-2.5 bg-muted/30 border-b text-xs font-medium text-muted-foreground">
            <div className="w-9" />
            <span>Nome</span>
            <span>OAB</span>
            <span>Perfil</span>
            <span />
          </div>
          <div className="divide-y">
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                isSelf={u.id === user?.id}
                onLink={setLinkManual}
              />
            ))}
          </div>
        </div>
      )}

      <InviteDialog
        open={convidando}
        onClose={() => setConvidando(false)}
        onLink={setLinkManual}
      />

      <ManualLinkDialog result={linkManual} onClose={() => setLinkManual(null)} />
    </div>
  )
}
