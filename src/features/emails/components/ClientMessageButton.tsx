'use client'

import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CLIENT_MESSAGE_LIMITS,
  clientMessageSchema,
  type ClientMessageInput,
} from '@/schemas/clientMessage.schema'
import type { ClientMessagePreview } from '../services/emailMessages.service'
import { usePreviewClientMessage, useSendClientMessage } from '../hooks/useEmailMutations'

interface ClientMessageButtonProps {
  clientId: string
  /** Para onde vai — a mesma regra da rota (`pickClientEmail`). */
  recipient: string | null
  /** O servidor consegue mandar e-mail. */
  emailEnabled: boolean
  /** Para começar o texto com a saudação certa. */
  greetingName: string | null
}

/**
 * "Enviar e-mail", no cabeçalho da ficha do cliente: a mensagem avulsa
 * (docs/emails-clientes.md, PR 4).
 *
 * Escrever → revisar como o cliente vai ler → enviar. A revisão é a
 * confirmação: o e-mail sai em nome do escritório e não volta, então ninguém
 * envia sem ver a mensagem pronta, com a assinatura.
 *
 * O formulário mora aqui, e não dentro do diálogo: fechar sem querer não
 * apaga o rascunho. Só o envio o limpa.
 */
export function ClientMessageButton({
  clientId,
  recipient,
  emailEnabled,
  greetingName,
}: ClientMessageButtonProps) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<ClientMessagePreview | null>(null)
  const buildPreview = usePreviewClientMessage(clientId)
  const send = useSendClientMessage(clientId)

  const initialValues: ClientMessageInput = {
    subject: '',
    body: greetingName ? `Olá, ${greetingName}!\n\n` : 'Olá!\n\n',
  }
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    control,
    formState: { errors },
  } = useForm<ClientMessageInput>({
    resolver: zodResolver(clientMessageSchema),
    defaultValues: initialValues,
  })
  const bodyLength = useWatch({ control, name: 'body' })?.length ?? 0

  const blocker = !emailEnabled
    ? 'O envio de e-mail não está configurado (Configurações → E-mail).'
    : !recipient
      ? 'O cadastro não tem um e-mail válido. Inclua um e-mail para escrever ao cliente.'
      : null

  function handleOpenChange(next: boolean) {
    setOpen(next)
    // Reabrir volta para a escrita: a prévia é do texto daquele momento.
    if (!next) setPreview(null)
  }

  async function review(values: ClientMessageInput) {
    try {
      setPreview(await buildPreview.mutateAsync(values))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível montar a prévia.')
    }
  }

  async function confirmSend() {
    try {
      const message = await send.mutateAsync(getValues())
      toast.success(
        message.sandbox_to
          ? `Modo de teste: a mensagem foi para ${message.sandbox_to}, não para o cliente.`
          : `Mensagem enviada para ${message.to_address}.`
      )
      reset(initialValues)
      setPreview(null)
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.')
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Mail className="h-3.5 w-3.5 mr-1.5" />
        Enviar e-mail
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{preview ? 'Revise antes de enviar' : 'Mensagem para o cliente'}</DialogTitle>
            <DialogDescription>
              {recipient ? `Para ${recipient}. ` : ''}Sai em nome do escritório, com a sua
              assinatura, e fica registrada na aba E-mails. As respostas vão para o e-mail do
              escritório.
            </DialogDescription>
          </DialogHeader>

          {blocker ? (
            <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <p className="text-muted-foreground">{blocker}</p>
            </div>
          ) : preview ? (
            <div className="space-y-2">
              <p className="text-sm">
                <span className="text-muted-foreground">Assunto: </span>
                {preview.subject}
              </p>
              <iframe
                title="Prévia da mensagem"
                srcDoc={preview.html}
                sandbox=""
                className="h-[55vh] w-full rounded-lg border bg-white"
              />
            </div>
          ) : (
            <form id="client-message-form" onSubmit={handleSubmit(review)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="client-message-subject">Assunto</Label>
                <Input
                  id="client-message-subject"
                  {...register('subject')}
                  maxLength={CLIENT_MESSAGE_LIMITS.subject}
                  placeholder="Ex.: Documentos para a audiência"
                />
                {errors.subject && <p className="text-xs text-destructive">{errors.subject.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="client-message-body">Mensagem</Label>
                {/* O Textarea do projeto cresce com o conteúdo (`field-sizing-content`)
                    e ignora `rows`: a altura mínima é a de uma carta curta, e a
                    máxima rola em vez de empurrar os botões para fora da tela. */}
                <Textarea
                  id="client-message-body"
                  {...register('body')}
                  className="min-h-56 max-h-96 overflow-y-auto"
                  maxLength={CLIENT_MESSAGE_LIMITS.body}
                />
                <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    Texto simples. Linha em branco separa parágrafos; a assinatura entra sozinha.
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {bodyLength}/{CLIENT_MESSAGE_LIMITS.body}
                  </span>
                </div>
                {errors.body && <p className="text-xs text-destructive">{errors.body.message}</p>}
              </div>
            </form>
          )}

          <DialogFooter>
            {preview ? (
              <>
                <Button variant="ghost" onClick={() => setPreview(null)} disabled={send.isPending}>
                  Voltar a editar
                </Button>
                <Button onClick={() => void confirmSend()} disabled={send.isPending}>
                  {send.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Enviar
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                  Fechar
                </Button>
                <Button
                  type="submit"
                  form="client-message-form"
                  disabled={blocker !== null || buildPreview.isPending}
                >
                  {buildPreview.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Revisar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
