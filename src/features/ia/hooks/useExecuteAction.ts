'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { createTask } from '@/features/tarefas/services/tasks.service'
import { useInvalidateTaskSurfaces } from '@/features/tarefas/hooks/useTaskMutations'
import { createEvent } from '@/features/agenda/services/events.service'
import { useInvalidateEventSurfaces } from '@/features/agenda/hooks/useEventMutations'
import {
  addClientComment,
  createClientRecord,
  findClientByDocument,
  getClientById,
  updateClientRecord,
} from '@/features/clientes/services/clientes.service'
import { getOfficeSettings } from '@/features/configuracoes/services/officeSettings.service'
import { contractKeys } from '@/features/contratos/hooks/useContracts'
import {
  createContractParties,
  linkDocumentToParty,
  type NewContractParty,
} from '@/features/contratos/services/contractParties.service'
import { createContract, uploadContractFile } from '@/features/contratos/services/contracts.service'
import { personFromClient, personFromOffice } from '@/features/contratos/utils/partyData'
import {
  clientCompletionPatch,
  clientInputFromPerson,
  fillBlanks,
  personFromToolData,
} from '@/features/contratos/utils/partyToolInput'
import {
  createCompanyClientSchema,
  createIndividualClientSchema,
} from '@/schemas/cliente.schema'
import type { PartyPersonData } from '@/types/contract.types'
import { clientKeys } from '@/features/clientes/hooks/useClientes'
import { addLegalProcessMovement } from '@/features/processos/services/legalProcesses.service'
import { useInvalidateLegalProcesses } from '@/features/processos/hooks/useLegalProcessMutations'
import { legalProcessKeys } from '@/features/processos/hooks/useLegalProcesses'
import { uploadDocument } from '@/features/documentos/services/documents.service'
import { documentKeys } from '@/features/documentos/hooks/useDocuments'
import { createTemplate } from '@/features/documentos/services/templates.service'
import { templateKeys } from '@/features/documentos/hooks/useDocumentTemplates'
import { TemplateSyntaxError } from '@/features/documentos/templates/errors'
import { TEMPLATE_SCOPE_HREFS, templateScopeOf } from '@/types/documentTemplate.types'
import { downloadAiFileAsFile } from '../services/aiFiles.service'
import type { ActionInput, ActionOutput } from '../tools/actions'
import {
  completeTask,
  createHearingAction,
  createPaymentLinkAction,
  handlePublication,
  linkPublication,
  reassignTask,
  registerFinancialEntry,
  rescheduleEvent,
  sendToSignature,
} from '../actions/screenActions'
import { useInvalidateHearingSurfaces } from '@/features/audiencias/hooks/useHearings'
import { signatureKeys } from '@/features/assinaturas/hooks/useSignatures'
import { useInvalidateFinancialSurfaces } from '@/features/financeiro/hooks/useFinancialEntryMutations'
import { useInvalidatePaymentSurfaces } from '@/features/financeiro/hooks/usePaymentChargeMutations'
import { useInvalidatePublications } from '@/features/publicacoes/hooks/usePublications'
import { useInvalidateContractSurfaces } from '@/features/contratos/hooks/useContractMutations'

export type PendingAction =
  | { tool: 'criar_tarefa'; input: ActionInput<'criar_tarefa'> }
  | { tool: 'criar_evento'; input: ActionInput<'criar_evento'> }
  | { tool: 'comentar_cliente'; input: ActionInput<'comentar_cliente'> }
  | { tool: 'registrar_movimentacao'; input: ActionInput<'registrar_movimentacao'> }
  | { tool: 'salvar_em_documentos'; input: ActionInput<'salvar_em_documentos'> }
  | { tool: 'cadastrar_modelo'; input: ActionInput<'cadastrar_modelo'> }
  | { tool: 'cadastrar_cliente'; input: ActionInput<'cadastrar_cliente'> }
  | { tool: 'completar_cliente'; input: ActionInput<'completar_cliente'> }
  | { tool: 'registrar_contrato'; input: ActionInput<'registrar_contrato'> }
  | { tool: 'concluir_tarefa'; input: ActionInput<'concluir_tarefa'> }
  | { tool: 'reatribuir_tarefa'; input: ActionInput<'reatribuir_tarefa'> }
  | { tool: 'remarcar_evento'; input: ActionInput<'remarcar_evento'> }
  | { tool: 'criar_audiencia'; input: ActionInput<'criar_audiencia'> }
  | { tool: 'registrar_lancamento'; input: ActionInput<'registrar_lancamento'> }
  | { tool: 'vincular_publicacao'; input: ActionInput<'vincular_publicacao'> }
  | { tool: 'tratar_publicacao'; input: ActionInput<'tratar_publicacao'> }
  | { tool: 'enviar_para_assinatura'; input: ActionInput<'enviar_para_assinatura'> }
  | { tool: 'gerar_link_pagamento'; input: ActionInput<'gerar_link_pagamento'> }

/** Invalida só quando gravou: uma recusa não mudou nada na tela. */
function afterOk(output: ActionOutput, invalidate: () => void): ActionOutput {
  if (output.ok) invalidate()
  return output
}

/**
 * Executa uma ação proposta pela IA depois que o usuário confirmou.
 *
 * Chama os MESMOS services das telas — nada de insert próprio — para que a
 * RLS, o feed de atividades, a recorrência e as demais regras valham igual.
 * A invalidação de cache também é a de cada módulo, por isso os helpers
 * `useInvalidate*Surfaces` em vez de uma lista de keys aqui.
 */
export function useExecuteAction() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const invalidateTasks = useInvalidateTaskSurfaces()
  const invalidateEvents = useInvalidateEventSurfaces()
  const invalidateProcesses = useInvalidateLegalProcesses()
  const invalidateHearings = useInvalidateHearingSurfaces()
  const invalidateFinancial = useInvalidateFinancialSurfaces()
  const invalidatePayments = useInvalidatePaymentSurfaces()
  const invalidatePublications = useInvalidatePublications()
  const invalidateContracts = useInvalidateContractSurfaces()

  return useMutation({
    mutationFn: async (action: PendingAction): Promise<ActionOutput> => {
      const userId = user!.id

      switch (action.tool) {
        case 'criar_tarefa': {
          const { input } = action
          const task = await createTask(
            {
              title: input.titulo,
              description: input.descricao,
              priority: input.prioridade,
              due_date: input.vencimento ?? null,
              due_time: input.hora ?? null,
              assigned_to: input.responsavel_id ?? null,
              client_id: input.cliente_id ?? null,
              legal_process_id: input.processo_id ?? null,
            },
            userId,
          )
          invalidateTasks()
          return { ok: true, id: task.id, link: '/tarefas' }
        }

        case 'criar_evento': {
          const { input } = action
          const event = await createEvent(
            {
              title: input.titulo,
              type: input.tipo,
              client_id: input.cliente_id ?? '',
              legal_process_id: input.processo_id ?? null,
              crm_item_id: null,
              assignee_ids: input.responsaveis_ids,
              start_date: input.data,
              start_time: input.hora,
              fatal_deadline_date: input.prazo_fatal,
              show_in_agenda: true,
              all_day: !input.hora,
              inform_end: Boolean(input.data_fim),
              end_date: input.data_fim,
              end_time: input.hora_fim,
              location: input.local,
              description: input.descricao,
              is_important: input.importante ?? false,
              is_urgent: input.urgente ?? false,
              is_future: false,
              is_retroactive: false,
            },
            userId,
          )
          invalidateEvents()
          return { ok: true, id: event.id, link: '/agenda' }
        }

        case 'comentar_cliente': {
          const { input } = action
          const comment = await addClientComment(
            input.cliente_id,
            input.comentario,
            userId,
            input.cliente_nome,
          )
          queryClient.invalidateQueries({ queryKey: clientKeys.comments(input.cliente_id) })
          return { ok: true, id: comment.id, link: `/clientes/${input.cliente_id}` }
        }

        case 'registrar_movimentacao': {
          const { input } = action
          const movement = await addLegalProcessMovement(
            input.processo_id,
            input.descricao,
            input.data,
          )
          queryClient.invalidateQueries({ queryKey: legalProcessKeys.detail(input.processo_id) })
          invalidateProcesses()
          return { ok: true, id: movement.id, link: `/processos/${input.processo_id}` }
        }

        case 'salvar_em_documentos': {
          const { input } = action
          // `documents` exige ao menos um vínculo (chk_documents_has_parent);
          // falhar aqui dá uma mensagem melhor que a violação do CHECK.
          if (!input.cliente_id && !input.processo_id) {
            throw new Error('Informe o cliente ou o processo.')
          }
          const file = await downloadAiFileAsFile(input.arquivo_id)
          const document = await uploadDocument(
            {
              category: input.categoria,
              client_id: input.cliente_id ?? null,
              legal_process_id: input.processo_id ?? null,
              crm_item_id: null,
              event_id: null,
            },
            file,
            userId,
          )
          queryClient.invalidateQueries({ queryKey: documentKeys.all })
          return {
            ok: true,
            id: document.id,
            link: input.processo_id ? `/processos/${input.processo_id}` : `/clientes/${input.cliente_id}`,
          }
        }

        case 'cadastrar_modelo': {
          const { input } = action
          const file = await downloadAiFileAsFile(input.arquivo_id)
          if (!/\.docx$/i.test(file.name)) {
            return { ok: false, motivo: 'o arquivo não é um .docx — só Word serve de modelo' }
          }
          try {
            const template = await createTemplate(
              {
                name: input.nome,
                description: input.descricao ?? '',
                category: input.categoria,
                // Sem definição: cada campo recebe o padrão pelo nome, e o
                // usuário ajusta na tela do modelo — inclusive os papéis de
                // parte, que são declarados lá, não deduzidos.
                fieldSettings: {},
                parties: [],
                file,
              },
              userId,
            )
            queryClient.invalidateQueries({ queryKey: templateKeys.all })
            // Modelo de contrato mora em Contratos → Modelos.
            return {
              ok: true,
              id: template.id,
              link: TEMPLATE_SCOPE_HREFS[templateScopeOf(input.categoria)],
            }
          } catch (error) {
            // Campo mal formado no .docx: o motivo vai para o card e para o
            // modelo, que pode explicar ao usuário o que corrigir.
            if (error instanceof TemplateSyntaxError) return { ok: false, motivo: error.message }
            throw error
          }
        }

        case 'cadastrar_cliente': {
          const person = personFromToolData(action.input.dados)
          // A mesma conferência do formulário de cliente, antes de tentar: o
          // índice único do banco recusaria, com uma mensagem pior.
          if (person.document) {
            const existing = await findClientByDocument(person.document)
            if (existing) {
              const name = existing.type === 'company' ? existing.company_name : existing.name
              return {
                ok: false,
                motivo:
                  `já existe o cliente ${name ?? ''} com este CPF/CNPJ (id ${existing.id}) — ` +
                  'use completar_cliente',
              }
            }
          }
          const clientInput = clientInputFromPerson(person)
          if (!clientInput) {
            return { ok: false, motivo: 'sem nome e CPF/CNPJ válido não dá para cadastrar' }
          }
          const parsed = (
            clientInput.type === 'company'
              ? createCompanyClientSchema
              : createIndividualClientSchema
          ).safeParse(clientInput)
          if (!parsed.success) {
            return { ok: false, motivo: parsed.error.issues[0]?.message ?? 'dados inválidos' }
          }
          const client = await createClientRecord(parsed.data, userId)
          queryClient.invalidateQueries({ queryKey: clientKeys.all })
          return { ok: true, id: client.id, link: `/clientes/${client.id}` }
        }

        case 'completar_cliente': {
          const { input } = action
          const client = await getClientById(input.cliente_id)
          const { patch, fields } = clientCompletionPatch(client, personFromToolData(input.dados))
          if (fields.length === 0) {
            return { ok: false, motivo: 'nada a completar — o cadastro já tem esses dados' }
          }
          await updateClientRecord(client.id, patch)
          queryClient.invalidateQueries({ queryKey: clientKeys.detail(client.id) })
          queryClient.invalidateQueries({ queryKey: clientKeys.all })
          return { ok: true, id: client.id, link: `/clientes/${client.id}` }
        }

        case 'registrar_contrato':
          return registerContract(action.input, userId, () => {
            queryClient.invalidateQueries({ queryKey: contractKeys.all })
            queryClient.invalidateQueries({ queryKey: documentKeys.all })
          })

        // Fase 4c: o service da tela grava (ver `actions/screenActions.ts`);
        // aqui só a invalidação de cada módulo, para a tela por trás atualizar.
        case 'concluir_tarefa':
          return afterOk(await completeTask(action.input, userId), invalidateTasks)

        case 'reatribuir_tarefa':
          return afterOk(await reassignTask(action.input, userId), invalidateTasks)

        case 'remarcar_evento':
          return afterOk(await rescheduleEvent(action.input, userId), () => {
            invalidateEvents()
            invalidateHearings()
          })

        case 'criar_audiencia': {
          // Falha só na data ainda deixa a ficha criada: invalida dos dois jeitos.
          const output = await createHearingAction(action.input, userId)
          invalidateHearings()
          invalidateEvents()
          return output
        }

        case 'registrar_lancamento':
          return afterOk(await registerFinancialEntry(action.input, userId), invalidateFinancial)

        case 'vincular_publicacao':
          return afterOk(await linkPublication(action.input), () => {
            invalidatePublications()
            invalidateProcesses()
          })

        case 'tratar_publicacao':
          return afterOk(await handlePublication(action.input), invalidatePublications)

        case 'enviar_para_assinatura': {
          // Criado e parado num passo também aparece na tela: invalida sempre.
          const output = await sendToSignature(action.input)
          queryClient.invalidateQueries({ queryKey: signatureKeys.all })
          invalidateContracts()
          return output
        }

        case 'gerar_link_pagamento': {
          const output = await createPaymentLinkAction(action.input)
          invalidatePayments()
          return output
        }
      }
    },
  })
}

/**
 * Cria o contrato, as partes e os arquivos — os mesmos services da tela. Os
 * arquivos da conversa são copiados para o contrato: a conversa é pessoal, o
 * contrato é do escritório.
 */
async function registerContract(
  input: ActionInput<'registrar_contrato'>,
  userId: string,
  invalidate: () => void,
): Promise<ActionOutput> {
  const clientId =
    input.cliente_id ?? input.partes.find((party) => party.cliente_id)?.cliente_id ?? null
  if (input.tipo === 'honorarios' && !clientId) {
    return { ok: false, motivo: 'contrato de honorários precisa do cliente' }
  }

  const office = input.partes.some((party) => party.escritorio) ? await getOfficeSettings() : null
  const parties: NewContractParty[] = []
  for (const party of input.partes) {
    const read = party.dados ? personFromToolData(party.dados) : null
    let person: PartyPersonData
    let source: NewContractParty['source']
    if (party.cliente_id) {
      const client = await getClientById(party.cliente_id)
      person = read ? fillBlanks(personFromClient(client), read) : personFromClient(client)
      source = 'cliente'
    } else if (party.escritorio) {
      if (!office) return { ok: false, motivo: 'dados do escritório não cadastrados' }
      person = personFromOffice(office)
      source = 'escritorio'
    } else if (read) {
      person = read
      source = 'documentos'
    } else {
      return { ok: false, motivo: `a parte ${party.nome} veio sem dados` }
    }
    parties.push({
      role_key: party.papel,
      role_label: party.papel_rotulo,
      source,
      client_id: party.cliente_id ?? null,
      person,
    })
  }

  const contract = await createContract(
    {
      kind: input.tipo,
      title: input.titulo,
      status: input.status ?? 'rascunho',
      client_id: clientId ?? '',
      legal_process_id: input.processo_id ?? '',
      responsible_id: userId,
      template_id: input.modelo_id ?? '',
      total_amount: input.valor_total ?? null,
      installments: input.parcelas ?? null,
      first_due_date: input.primeiro_vencimento ?? '',
      success_fee_percent: input.exito_percentual ?? null,
      start_date: input.inicio ?? '',
      end_date: input.fim ?? '',
      notice_days: 30,
      auto_renew: false,
      adjustment_index: input.reajuste ?? '',
      signed_at: '',
      notes: '',
    },
    userId,
  )

  // Daqui em diante o contrato existe: uma falha não o desfaz, vira aviso —
  // o resto se completa na tela.
  const problems: string[] = []
  const created = [...(await createContractParties(contract.id, parties))].sort(
    (a, b) => a.position - b.position,
  )
  if (input.minuta_arquivo_id) {
    try {
      const file = await downloadAiFileAsFile(input.minuta_arquivo_id)
      await uploadContractFile(contract.id, 'minuta', file, userId)
    } catch {
      problems.push('a minuta não foi anexada')
    }
  }
  for (const attachment of input.anexos ?? []) {
    try {
      const file = await downloadAiFileAsFile(attachment.arquivo_id)
      const document = await uploadContractFile(contract.id, 'anexo', file, userId)
      const owner = attachment.parte !== undefined ? created[attachment.parte] : undefined
      await linkDocumentToParty(document.id, {
        partyId: owner?.id ?? null,
        sourceKind: attachment.tipo ?? null,
      })
    } catch {
      problems.push('um dos anexos não foi copiado')
    }
  }

  invalidate()
  if (problems.length > 0) {
    return {
      ok: false,
      motivo: `contrato registrado (/contratos/${contract.id}), mas ${problems.join(' e ')}`,
    }
  }
  return { ok: true, id: contract.id, link: `/contratos/${contract.id}` }
}
