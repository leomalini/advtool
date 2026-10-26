'use client'

import { useMemo, useState } from 'react'
import { FolderLock, Loader2, Plus, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  useListD4SignSafes,
  useOfficeSettings,
} from '@/features/configuracoes/hooks/useOfficeSettings'
import { useProfiles } from '@/hooks/useProfiles'
import { resolveSafe, safeRouteForContract } from '@/lib/d4sign/safeRoutes'
import { sendForSignatureSchema } from '@/schemas/signature.schema'
import type { ContractParty, ContractWithRelations } from '@/types/contract.types'
import type { D4SignSafe } from '@/types/d4sign.types'
import type { DocumentWithRelations } from '@/types/document.types'
import {
  AUTH_METHODS_NEEDING_CPF,
  SIGNABLE_FILE_TYPES,
  SIGNATURE_ACTS,
  SIGNATURE_ACT_LABELS,
  SIGNER_AUTH_LABELS,
  actForRole,
  availableAuthMethods,
  type SignatureAct,
  type SignerAuthMethod,
} from '@/types/signature.types'
import { formatDate } from '@/utils/date'
import { toBrazilianE164 } from '@/utils/format'
import { getDisplayName } from '@/utils/profile'
import { SignatureRouteError } from '../services/signatures.service'
import { useSendForSignature } from '../hooks/useContractSignatures'

interface SendForSignatureDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contract: ContractWithRelations
  parties: ContractParty[]
  /** Os arquivos do contrato — vai um PDF ou Word deles. */
  documents: DocumentWithRelations[]
}

/** Uma linha da lista de quem assina, como o formulário a edita. */
interface SignerDraft {
  key: string
  /** O papel no contrato, para a pessoa se localizar. */
  roleLabel: string | null
  name: string
  email: string
  /** CPF ou CNPJ, só dígitos. */
  document: string
  /** Celular em E.164, quando a parte tem um válido. */
  phone: string | null
  whatsapp: boolean
  act: SignatureAct
  auth: SignerAuthMethod
  contractPartyId: string | null
  clientId: string | null
  /** Alguém do escritório: assina com o e-mail do login. */
  profileId: string | null
  office: boolean
}

const digits = (value: string | null) => (value ?? '').replace(/\D/g, '')

let draftCounter = 0
const nextKey = () => `novo-${++draftCounter}`

/** As partes do contrato viram a lista inicial; a do escritório vira o
 * responsável pelo contrato, que pode ser trocado. */
function initialSigners(contract: ContractWithRelations, parties: ContractParty[]): SignerDraft[] {
  return parties.map((party) => {
    const office = party.source === 'escritorio'
    return {
      key: party.id,
      roleLabel: party.role_label,
      name: office
        ? getDisplayName(contract.responsible?.full_name ?? party.name ?? 'Escritório')
        : (party.name ?? party.role_label),
      email: office ? '' : (party.email ?? ''),
      document: office ? '' : digits(party.document),
      phone: !office && party.phone ? toBrazilianE164(party.phone) : null,
      whatsapp: false,
      act: actForRole(party.role_key),
      auth: 'email',
      contractPartyId: party.id,
      clientId: office ? null : party.client_id,
      profileId: office ? contract.responsible_id : null,
      office,
    }
  })
}

/**
 * "Enviar para assinatura" pela D4Sign: o arquivo, o cofre (o do tipo, que dá
 * para trocar), quem assina e como, e o prazo. O servidor confere tudo de
 * novo — inclusive os recursos do plano — antes de gastar o envio.
 */
export function SendForSignatureDialog(props: SendForSignatureDialogProps) {
  const send = useSendForSignature()
  return (
    <Dialog
      open={props.open}
      onOpenChange={(value) => !send.isPending && props.onOpenChange(value)}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        {/* Montado a cada abertura: a lista nasce das partes de agora. */}
        {props.open && (
          <SendForm {...props} send={send} onClose={() => props.onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function SendForm({
  contract,
  parties,
  documents,
  send,
  onClose,
}: SendForSignatureDialogProps & {
  send: ReturnType<typeof useSendForSignature>
  onClose: () => void
}) {
  const { data: settings = null } = useOfficeSettings()
  const { data: profiles = [] } = useProfiles()
  const listSafes = useListD4SignSafes()

  const features = settings?.d4sign_features ?? {}
  const authMethods = availableAuthMethods(features)
  const safeMap = settings?.d4sign_safes ?? {}
  const lawyers = profiles.filter(
    (profile) => profile.is_active && (profile.role === 'attorney' || profile.role === 'admin'),
  )

  const files = useMemo(
    () =>
      documents
        .filter((document) => SIGNABLE_FILE_TYPES.includes(document.file_type))
        // A minuta mais nova primeiro; o resto depois.
        .sort((a, b) => {
          const roleOrder = Number(b.contract_file_role === 'minuta') - Number(a.contract_file_role === 'minuta')
          return roleOrder !== 0 ? roleOrder : b.created_at.localeCompare(a.created_at)
        }),
    [documents],
  )

  const [documentId, setDocumentId] = useState(files[0]?.id ?? '')
  const [chosenSafe, setChosenSafe] = useState<D4SignSafe | null>(null)
  const [signers, setSigners] = useState<SignerDraft[]>(() => initialSigners(contract, parties))
  const [ordered, setOrdered] = useState(false)
  const [message, setMessage] = useState('')
  const [deadline, setDeadline] = useState('')
  const [error, setError] = useState<string | null>(null)

  const suggestedSafe = resolveSafe(safeMap, safeRouteForContract(contract.kind))
  const safe = chosenSafe ?? suggestedSafe
  // Os cofres do mapa e, se pedidos, todos os da conta — no máximo uns 15.
  const safeOptionsByUuid = new Map<string, D4SignSafe>()
  for (const item of Object.values(safeMap)) if (item) safeOptionsByUuid.set(item.uuid, item)
  for (const item of listSafes.data ?? []) safeOptionsByUuid.set(item.uuid, item)
  const safeOptions = [...safeOptionsByUuid.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR'),
  )

  const credit = settings?.d4sign_balance_credit ?? null
  const sent = settings?.d4sign_balance_sent ?? null
  // O prazo mais cedo é amanhã — calculado uma vez, ao abrir.
  const [tomorrow] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10))

  function patch(key: string, change: Partial<SignerDraft>) {
    setSigners((current) => current.map((signer) => (signer.key === key ? { ...signer, ...change } : signer)))
  }

  function addPerson() {
    setSigners((current) => [
      ...current,
      {
        key: nextKey(),
        roleLabel: null,
        name: '',
        email: '',
        document: '',
        phone: null,
        whatsapp: false,
        act: 4,
        auth: 'email',
        contractPartyId: null,
        clientId: null,
        profileId: null,
        office: false,
      },
    ])
  }

  function addLawyer() {
    const lawyer = lawyers.find((profile) => !signers.some((signer) => signer.profileId === profile.id))
    setSigners((current) => [
      ...current,
      {
        key: nextKey(),
        roleLabel: 'Escritório',
        name: lawyer ? getDisplayName(lawyer.full_name) : '',
        email: '',
        document: '',
        phone: null,
        whatsapp: false,
        act: 4,
        auth: 'email',
        contractPartyId: null,
        clientId: null,
        profileId: lawyer?.id ?? null,
        office: true,
      },
    ])
  }

  function submit() {
    if (!safe) {
      setError('Escolha o cofre da D4Sign.')
      return
    }
    const parsed = sendForSignatureSchema.safeParse({
      contractId: contract.id,
      documentId,
      safe,
      signers: signers.map((signer) => ({
        name: signer.name,
        email: signer.office ? null : signer.email || null,
        document: signer.document || null,
        whatsapp: signer.whatsapp ? signer.phone : null,
        act: signer.act,
        auth: signer.auth,
        contractPartyId: signer.contractPartyId,
        clientId: signer.clientId,
        profileId: signer.office ? signer.profileId : null,
      })),
      ordered,
      message: message || null,
      deadline: deadline || null,
    })
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      // Problema de um signatário: diz de quem é, com a lista longa.
      const index = issue?.path[0] === 'signers' ? issue.path[1] : null
      const who = typeof index === 'number' ? signers[index]?.name.trim() : null
      const message = issue?.message ?? 'Confira os dados do envio.'
      setError(who ? `${who}: ${message}` : message)
      return
    }
    setError(null)
    send.mutate(parsed.data, {
      onSuccess: onClose,
      // Criado e parado num passo: some daqui e aparece na seção, com
      // "Tentar de novo". Recusado antes de criar: fica aberto para corrigir.
      onError: (failure) => {
        if (failure instanceof SignatureRouteError && failure.request) onClose()
        else setError(failure.message)
      },
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Enviar para assinatura</DialogTitle>
        <DialogDescription>
          Pela D4Sign. Quem assina recebe o link por e-mail; o PDF assinado volta para os arquivos do
          contrato.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Arquivo</Label>
            {files.length === 0 ? (
              <p className="text-xs text-destructive">
                O contrato não tem PDF nem Word. Gere a minuta ou anexe o arquivo antes.
              </p>
            ) : (
              <Select value={documentId} onValueChange={setDocumentId} disabled={send.isPending}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Escolha o arquivo" />
                </SelectTrigger>
                <SelectContent>
                  {files.map((file) => (
                    <SelectItem key={file.id} value={file.id}>
                      {file.file_name}
                      {file.contract_file_role === 'minuta' ? ' · minuta' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Cofre na D4Sign</Label>
            <Select
              value={safe?.uuid ?? ''}
              onValueChange={(uuid) => setChosenSafe(safeOptions.find((item) => item.uuid === uuid) ?? null)}
              disabled={send.isPending}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Escolha o cofre" />
              </SelectTrigger>
              <SelectContent>
                {safeOptions.map((item) => (
                  <SelectItem key={item.uuid} value={item.uuid}>
                    {item.name}
                    {item.uuid === suggestedSafe?.uuid ? ' · do tipo' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {listSafes.data ? null : (
              <button
                type="button"
                className="flex items-center gap-1 text-[11px] text-muted-foreground underline underline-offset-2"
                disabled={listSafes.isPending}
                onClick={() => listSafes.mutate()}
              >
                {listSafes.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <FolderLock className="h-3 w-3" />
                )}
                Ver todos os cofres
              </button>
            )}
            {!suggestedSafe && (
              <p className="text-[11px] text-warning">
                Nenhum cofre ligado a este tipo nem padrão — ver em Configurações → Assinatura.
              </p>
            )}
          </div>
        </div>

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Quem assina</Label>
            <div className="flex gap-1">
              <Button type="button" size="xs" variant="outline" onClick={addPerson} disabled={send.isPending}>
                <Plus className="h-3 w-3" />
                Pessoa
              </Button>
              <Button type="button" size="xs" variant="outline" onClick={addLawyer} disabled={send.isPending}>
                <Plus className="h-3 w-3" />
                Advogado
              </Button>
            </div>
          </div>

          {signers.length === 0 && (
            <p className="text-xs text-muted-foreground">
              O contrato não tem partes. Inclua quem assina pelos botões acima.
            </p>
          )}

          <ul className="space-y-2">
            {signers.map((signer) => {
              const needsCpf = AUTH_METHODS_NEEDING_CPF.includes(signer.auth)
              return (
                <li key={signer.key} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-start gap-2">
                    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                      {signer.office ? (
                        <Select
                          value={signer.profileId ?? ''}
                          onValueChange={(profileId) =>
                            patch(signer.key, {
                              profileId,
                              name: getDisplayName(
                                lawyers.find((profile) => profile.id === profileId)?.full_name ?? '',
                              ),
                            })
                          }
                          disabled={send.isPending}
                        >
                          <SelectTrigger className="w-full" size="sm">
                            <SelectValue placeholder="Advogado que assina" />
                          </SelectTrigger>
                          <SelectContent>
                            {lawyers.map((profile) => (
                              <SelectItem key={profile.id} value={profile.id}>
                                {getDisplayName(profile.full_name)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={signer.name}
                          onChange={(event) => patch(signer.key, { name: event.target.value })}
                          placeholder="Nome"
                          className="h-8"
                          disabled={send.isPending}
                        />
                      )}
                      {signer.office ? (
                        <p className="self-center text-xs text-muted-foreground">
                          Assina com o e-mail do login.
                        </p>
                      ) : (
                        <Input
                          type="email"
                          value={signer.email}
                          onChange={(event) => patch(signer.key, { email: event.target.value })}
                          placeholder="E-mail"
                          className="h-8"
                          disabled={send.isPending}
                          aria-invalid={!signer.email}
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSigners((current) => current.filter((item) => item.key !== signer.key))}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label={`Tirar ${signer.name || 'esta pessoa'} do envio`}
                      disabled={send.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {signer.roleLabel && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                        {signer.roleLabel}
                      </span>
                    )}
                    <Select
                      value={String(signer.act)}
                      onValueChange={(value) => patch(signer.key, { act: Number(value) as SignatureAct })}
                      disabled={send.isPending}
                    >
                      <SelectTrigger size="sm" className="h-7 text-xs" aria-label="Assina como">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SIGNATURE_ACTS.map((act) => (
                          <SelectItem key={act} value={String(act)}>
                            Assina como {SIGNATURE_ACT_LABELS[act].toLowerCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={signer.auth}
                      onValueChange={(value) => patch(signer.key, { auth: value as SignerAuthMethod })}
                      disabled={send.isPending || authMethods.length === 1}
                    >
                      <SelectTrigger size="sm" className="h-7 text-xs" aria-label="Como confirma quem é">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {authMethods.map((method) => (
                          <SelectItem key={method} value={method}>
                            {SIGNER_AUTH_LABELS[method]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {features.whatsapp && signer.phone && (
                      <label className="flex items-center gap-1.5 text-muted-foreground">
                        <Checkbox
                          checked={signer.whatsapp}
                          onCheckedChange={(checked) => patch(signer.key, { whatsapp: checked === true })}
                          disabled={send.isPending}
                        />
                        Link também no WhatsApp
                      </label>
                    )}
                  </div>

                  {needsCpf && signer.document.length !== 11 && (
                    <Input
                      value={signer.document}
                      onChange={(event) => patch(signer.key, { document: digits(event.target.value).slice(0, 11) })}
                      placeholder={`CPF — ${SIGNER_AUTH_LABELS[signer.auth]} pede`}
                      inputMode="numeric"
                      className="h-8 max-w-56"
                      disabled={send.isPending}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="signature-deadline">Prazo para assinar</Label>
            <Input
              id="signature-deadline"
              type="date"
              min={tomorrow}
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              disabled={send.isPending}
            />
            <p className="text-[11px] text-muted-foreground">
              Opcional. Passado o dia, a D4Sign cancela sozinha.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Ordem</Label>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={ordered}
                onCheckedChange={(checked) => setOrdered(checked === true)}
                className="mt-0.5"
                disabled={send.isPending}
              />
              <span>
                Assinar na ordem da lista
                <span className="block text-[11px] text-muted-foreground">
                  Cada um só recebe o link depois de o anterior assinar.
                </span>
              </span>
            </label>
          </div>
        </section>

        <div className="space-y-2">
          <Label htmlFor="signature-message">Mensagem no e-mail</Label>
          <Textarea
            id="signature-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Opcional"
            rows={2}
            maxLength={1000}
            disabled={send.isPending}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <DialogFooter className="items-center gap-2 sm:justify-between">
        <p className="text-[11px] text-muted-foreground">
          {credit !== null && sent !== null
            ? `Gasta 1 envio do plano: restam ${Math.max(credit - sent, 0)} de ${credit}` +
              (settings?.d4sign_balance_checked_at
                ? ` (lido em ${formatDate(settings.d4sign_balance_checked_at)}).`
                : '.')
            : 'Gasta 1 envio do plano.'}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={send.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={send.isPending || files.length === 0 || !documentId || signers.length === 0}
          >
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}
