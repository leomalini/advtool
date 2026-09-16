'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  createLegalProcess,
  updateLegalProcess,
  deleteLegalProcess,
  addLegalProcessMovement,
  markMovement,
  setMovementClientVisibility,
  replaceLegalProcessParties,
  linkPartyToClient,
} from '../services/legalProcesses.service'
import { syncProcessoFromApi } from '../services/syncProcesso.service'
import {
  createProcessMonitoring,
  deleteProcessMonitoring,
  isPendingMonitoring,
} from '../services/monitoramento.service'
import { linkPublicationsToProcess } from '@/features/publicacoes/services/publications.service'
import { legalProcessKeys } from './useLegalProcesses'
import { crmItemKeys } from '@/features/crm/hooks/useCrmItems'
import { useAuth } from '@/hooks/useAuth'
import type { LegalProcessInput } from '@/schemas/legalProcess.schema'
import { MONITORING_FREQUENCY_LABELS } from '@/types/legalProcess.types'
import type {
  LegalProcessPartyInput,
  LegalProcessWithRelations,
  MonitoringFrequency,
} from '@/types/legalProcess.types'

export function useInvalidateLegalProcesses() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: legalProcessKeys.all })
    queryClient.invalidateQueries({ queryKey: crmItemKeys.workflow('wf-processos') })
    queryClient.invalidateQueries({ queryKey: crmItemKeys.counts() })
  }
}

/** Marca uma publicação como lida/tratada. Invalida a lista inteira porque a
 * contagem de não lidas aparece no cabeçalho e nas abas. */
export function useMarkMovement() {
  const invalidate = useInvalidateLegalProcesses()

  return useMutation({
    mutationFn: ({
      movementId,
      ...patch
    }: {
      movementId: string
      read?: boolean
      handled?: boolean
    }) => markMovement(movementId, patch),
    onSuccess: () => invalidate(),
    onError: () => toast.error('Não foi possível atualizar a publicação.'),
  })
}

/** Mostra ou esconde um ato no link de acompanhamento do cliente. */
export function useSetMovementClientVisibility() {
  const invalidate = useInvalidateLegalProcesses()

  return useMutation({
    mutationFn: ({ movementId, hidden }: { movementId: string; hidden: boolean }) =>
      setMovementClientVisibility(movementId, hidden),
    onSuccess: (_data, { hidden }) => {
      invalidate()
      toast.success(
        hidden
          ? 'Ato oculto: o cliente não vê mais este item.'
          : 'Ato liberado: o cliente passa a ver este item.'
      )
    },
    onError: () => toast.error('Não foi possível alterar a visibilidade do ato.'),
  })
}

/** Vincula uma parte a um cliente cadastrado — ou desfaz o vínculo com `null`. */
export function useLinkPartyToClient() {
  const invalidate = useInvalidateLegalProcesses()

  return useMutation({
    mutationFn: ({ partyId, clientId }: { partyId: string; clientId: string | null }) =>
      linkPartyToClient(partyId, clientId),
    onSuccess: (_data, { clientId }) => {
      invalidate()
      toast.success(clientId ? 'Parte vinculada ao cliente.' : 'Vínculo removido.')
    },
    onError: () => toast.error('Não foi possível vincular a parte.'),
  })
}

export function useReplaceLegalProcessParties() {
  const invalidate = useInvalidateLegalProcesses()

  return useMutation({
    mutationFn: ({
      legalProcessId,
      parties,
    }: {
      legalProcessId: string
      parties: LegalProcessPartyInput[]
    }) => replaceLegalProcessParties(legalProcessId, parties),
    onSuccess: () => invalidate(),
    onError: () => toast.error('Erro ao salvar as partes.'),
  })
}

/** Coleta os dados do tribunal para um processo recém-criado.
 *
 * Os avisos saem daqui, e não do `onSuccess`, porque o retorno da mutation
 * continua sendo o processo: duas telas usam `.id` do resultado para abrir o
 * cadastro em seguida, e embrulhá-lo num objeto quebraria as duas.
 */
async function collectFromApi(
  processo: LegalProcessWithRelations,
  capaAlreadyFetched: boolean,
): Promise<void> {
  if (!processo.cnj_number) return

  try {
    const sync = await syncProcessoFromApi({
      legalProcessId: processo.id,
      cnj: processo.cnj_number,
      // A tela já consultou a capa para preencher o formulário e os valores
      // foram gravados no insert. Buscar de novo pagaria R$ 0,12 pelo mesmo
      // dado e ainda desfaria qualquer correção feita à mão antes de salvar.
      assumeFresh: capaAlreadyFetched ? ['capa'] : undefined,
    })

    if (sync.pending.length > 0) {
      toast.info(
        `Ainda em processamento na BuscaProcessos: ${sync.pending.join(', ')}. Atualize em instantes.`,
      )
    }
    if (sync.failed.length > 0) {
      toast.warning(`Não foi possível carregar: ${sync.failed.map((f) => f.block).join(', ')}.`)
    }
  } catch {
    // Cadastro feito é cadastro feito: falha na coleta vira aviso, não erro
    // do salvamento. Sincronizar de novo depois traz o que faltou.
    toast.warning('Dados do tribunal não foram carregados. Sincronize o processo depois.')
  }
}

/** Liga o monitoramento contínuo do processo na BuscaProcessos.
 *
 * Roda depois da coleta e fora do caminho de erro do cadastro: o monitoramento
 * é cobrado por mês, mas falhar em criá-lo não desfaz um processo já gravado —
 * vira aviso, e a tela de detalhes permite ligar depois.
 */
async function startMonitoring(
  processo: LegalProcessWithRelations,
  frequencia: MonitoringFrequency,
): Promise<void> {
  if (!processo.cnj_number) return

  try {
    const result = await createProcessMonitoring({
      legalProcessId: processo.id,
      cnj: processo.cnj_number,
      frequencia,
      tribunal: processo.court,
    })

    const label = MONITORING_FREQUENCY_LABELS[frequencia].toLowerCase()
    if (isPendingMonitoring(result)) {
      toast.info(`Monitoramento ${label}: ${result.message}`)
    } else {
      toast.success(`Monitoramento ${label} ativado.`)
    }
  } catch {
    toast.warning('Processo cadastrado, mas o monitoramento não foi ativado. Tente pelos detalhes.')
  }
}

/**
 * Etapas do cadastro, na ordem em que acontecem.
 *
 * Existem porque cadastrar um processo não é um insert: depois dele vêm a
 * coleta na BuscaProcessos (capa, movimentações, documentos e resumo por IA),
 * o vínculo das publicações órfãs e, se pedido, o monitoramento. São segundos
 * de espera em que um spinner sozinho parece travado.
 */
export const CREATE_PROCESS_STEPS = ['saving', 'collecting', 'linking', 'monitoring'] as const

export type CreateProcessStep = (typeof CREATE_PROCESS_STEPS)[number]

export const CREATE_PROCESS_STEP_LABELS: Record<CreateProcessStep, string> = {
  saving: 'Gravando o processo',
  collecting: 'Buscando dados no tribunal',
  linking: 'Vinculando publicações',
  monitoring: 'Ativando o monitoramento',
}

export interface CreateLegalProcessVars {
  input: LegalProcessInput
  /** `true` quando a tela já consultou a capa na BuscaProcessos para preencher
   * os campos — o bloco de capa é então só carimbado, sem nova consulta. */
  capaAlreadyFetched?: boolean
  /** Ausente = o usuário escolheu não monitorar. Não é campo de
   * `legal_processes` alimentado pelo formulário: o valor só chega à coluna
   * pela resposta da BuscaProcessos. */
  monitoringFrequency?: MonitoringFrequency | null
  /** Chamado a cada etapa concluída, para a tela mostrar onde está. */
  onStep?: (step: CreateProcessStep) => void
}

/** Cadastra o processo e o popula com capa, movimentações, documentos públicos
 * e resumo por IA. Tudo fica gravado no banco: abrir o processo depois não
 * consulta a API de novo — cada consulta é cobrada. */
export function useCreateLegalProcess() {
  const invalidate = useInvalidateLegalProcesses()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({
      input,
      capaAlreadyFetched = false,
      monitoringFrequency,
      onStep,
    }: CreateLegalProcessVars) => {
      onStep?.('saving')
      const processo = await createLegalProcess(input, user!.id)

      onStep?.('collecting')
      await collectFromApi(processo, capaAlreadyFetched)

      // Publicações que chegaram antes do processo existir ficam órfãs; agora
      // que ele existe, passam a apontar para ele.
      onStep?.('linking')
      if (processo.cnj_number) {
        try {
          await linkPublicationsToProcess(processo.cnj_number, processo.id)
        } catch {
          // Vínculo é conveniência, não parte do cadastro.
        }
      }

      if (monitoringFrequency) {
        onStep?.('monitoring')
        await startMonitoring(processo, monitoringFrequency)
      }

      return processo
    },
    onSuccess: () => {
      invalidate()
      toast.success('Processo cadastrado!')
    },
    onError: () => toast.error('Erro ao cadastrar processo.'),
  })
}

/** Recoleta os dados do tribunal para um processo já cadastrado.
 *
 * Capa e movimentações são refeitas (R$ 0,24): mudam com o andamento do
 * processo, e um cache eterno delas ficaria errado em uma semana. Documentos
 * públicos (R$ 0,25) e resumo por IA (R$ 0,12) só são buscados se ainda não
 * estiverem gravados — mudam pouco e custam mais.
 *
 * Essa divisão é política de custo, não regra da API: mexer aqui muda quanto
 * cada clique gasta.
 */
export function useSyncProcesso() {
  const invalidate = useInvalidateLegalProcesses()

  return useMutation({
    mutationFn: ({ legalProcessId, cnj }: { legalProcessId: string; cnj: string }) =>
      syncProcessoFromApi({ legalProcessId, cnj, force: ['capa', 'movimentacoes'] }),
    onSuccess: (sync) => {
      invalidate()

      if (sync.failed.length > 0) {
        toast.warning(`Não foi possível carregar: ${sync.failed.map((f) => f.block).join(', ')}.`)
      } else if (sync.pending.length > 0) {
        toast.info(
          `Ainda em processamento: ${sync.pending.join(', ')}. Atualize de novo em instantes.`,
        )
      } else {
        toast.success(
          `Dados atualizados. Custo estimado: R$ ${sync.estimatedCost.toFixed(2).replace('.', ',')}.`,
        )
      }
    },
    onError: () => toast.error('Não foi possível atualizar os dados do processo.'),
  })
}

/** Liga, troca ou desliga o monitoramento de um processo já cadastrado.
 *
 * Trocar a frequência é cancelar e recriar: a API não expõe atualização de
 * monitoramento, e criar por cima deixaria dois monitores cobrando pelo mesmo
 * processo. O cancelamento vem primeiro justamente por isso — se ele falhar, a
 * criação nem é tentada.
 */
export function useSetProcessMonitoring(legalProcessId: string) {
  const invalidate = useInvalidateLegalProcesses()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      cnj,
      court,
      currentMonitoringId,
      frequencia,
    }: {
      cnj: string
      court: string | null
      currentMonitoringId: string | null
      /** `null` desliga o monitoramento. */
      frequencia: MonitoringFrequency | null
    }) => {
      if (currentMonitoringId) await deleteProcessMonitoring(currentMonitoringId)
      if (!frequencia) return null

      return createProcessMonitoring({ legalProcessId, cnj, frequencia, tribunal: court })
    },
    onSuccess: (result, { frequencia }) => {
      queryClient.invalidateQueries({ queryKey: legalProcessKeys.detail(legalProcessId) })
      invalidate()

      if (!frequencia) {
        toast.success('Monitoramento cancelado.')
        return
      }
      const label = MONITORING_FREQUENCY_LABELS[frequencia].toLowerCase()
      if (result && isPendingMonitoring(result)) {
        toast.info(`Monitoramento ${label}: ${result.message}`)
      } else {
        toast.success(`Monitoramento ${label} ativado.`)
      }
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useUpdateLegalProcess(legalProcessId: string, crmItemId: string) {
  const invalidate = useInvalidateLegalProcesses()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: Partial<LegalProcessInput>) =>
      updateLegalProcess(legalProcessId, crmItemId, input, user?.id ?? null),
    onSuccess: () => {
      invalidate()
      toast.success('Processo atualizado!')
    },
    onError: () => toast.error('Erro ao atualizar processo.'),
  })
}

export function useDeleteLegalProcess() {
  const invalidate = useInvalidateLegalProcesses()

  return useMutation({
    mutationFn: (id: string) => deleteLegalProcess(id),
    onSuccess: () => {
      invalidate()
      toast.success('Processo removido.')
    },
    onError: () => toast.error('Erro ao remover processo.'),
  })
}

export function useAddLegalProcessMovement(legalProcessId: string) {
  const invalidate = useInvalidateLegalProcesses()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ description, movementDate }: { description: string; movementDate: string }) =>
      addLegalProcessMovement(legalProcessId, description, movementDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: legalProcessKeys.detail(legalProcessId) })
      invalidate()
      toast.success('Movimentação adicionada!')
    },
    onError: () => toast.error('Erro ao adicionar movimentação.'),
  })
}
