'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { AI_PROVIDER_LABELS, type AssistantProvider } from '@/features/ia/config/models'
import { aiApiKeySchema, aiWorkspaceIdSchema } from '@/schemas/aiSettings.schema'
import { useSaveAiKey } from '../hooks/useAiSettings'
import { StatusRow } from './StatusRow'

const WHERE_TO_GET: Record<AssistantProvider, { url: string; text: string }> = {
  anthropic: {
    url: 'https://platform.claude.com',
    text: 'platform.claude.com → Settings → API keys',
  },
  google: { url: 'https://aistudio.google.com/apikey', text: 'aistudio.google.com/apikey' },
}

interface AiKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  provider: AssistantProvider
  /** O workspace da chave do painel em uso, para não precisar redigitar. */
  currentWorkspaceId: string | null
}

/** Colar a chave → testar → salvar. Recusada, não grava e diz o porquê. */
export function AiKeyDialog(props: AiKeyDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        {/* Montado só aberto: cada abertura começa com o campo vazio. */}
        {props.open && <KeyForm {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function KeyForm({ onOpenChange, provider, currentWorkspaceId }: AiKeyDialogProps) {
  const save = useSaveAiKey()
  const [apiKey, setApiKey] = useState('')
  const [workspaceId, setWorkspaceId] = useState(currentWorkspaceId ?? '')
  const [error, setError] = useState<string | null>(null)
  const label = AI_PROVIDER_LABELS[provider]
  const where = WHERE_TO_GET[provider]
  const refused = save.data && !save.data.ok ? save.data.message : null

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const key = aiApiKeySchema.safeParse(apiKey)
    const workspace = aiWorkspaceIdSchema.safeParse(workspaceId)
    if (!key.success || !workspace.success) {
      setError(
        (!key.success ? key.error.issues[0]?.message : workspace.error?.issues[0]?.message) ??
          'Confira os campos.',
      )
      return
    }
    setError(null)
    save.mutate(
      { provider, apiKey: key.data, workspaceId: workspace.data ?? '' },
      { onSuccess: (result) => result.ok && onOpenChange(false) },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Chave de {label}</DialogTitle>
        <DialogDescription>
          Gere em{' '}
          <a
            href={where.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {where.text}
          </a>
          . O AdvTool testa a chave antes de salvar; recusada, a atual continua valendo.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <label htmlFor="ai-api-key" className="block text-xs text-muted-foreground">
          Chave de API
        </label>
        <Input
          id="ai-api-key"
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={save.isPending}
          aria-invalid={error !== null}
          autoFocus
        />
      </div>

      {provider === 'anthropic' && (
        <div className="space-y-1.5">
          <label htmlFor="ai-workspace" className="block text-xs text-muted-foreground">
            ID do workspace (opcional)
          </label>
          <Input
            id="ai-workspace"
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
            placeholder="wrkspc_…"
            autoComplete="off"
            spellCheck={false}
            disabled={save.isPending}
          />
          <p className="text-[11px] text-muted-foreground">
            Só para chave criada para vários workspaces. Chave criada dentro de um workspace não
            precisa.
          </p>
        </div>
      )}

      {(error ?? refused) && (
        <StatusRow ok={false} title={error ? 'Confira a chave' : 'A chave não foi salva'}>
          {error ?? refused}
        </StatusRow>
      )}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={save.isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={save.isPending || apiKey.trim() === ''}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {save.isPending ? 'Testando…' : 'Testar e salvar'}
        </Button>
      </DialogFooter>
    </form>
  )
}
