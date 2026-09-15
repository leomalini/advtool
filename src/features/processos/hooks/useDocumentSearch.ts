'use client'

import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { toLookupResult } from '@/lib/buscaprocessos/mapCapa'
import type { BpProcessoCapa } from '@/lib/buscaprocessos/types'
import type { LegalProcessInput } from '@/schemas/legalProcess.schema'
import { linkPublicationsToProcess } from '@/features/publicacoes/services/publications.service'
import { useAuth } from '@/hooks/useAuth'
import { createLegalProcess } from '../services/legalProcesses.service'
import { syncProcessoFromApi } from '../services/syncProcesso.service'
import {
  searchProcessosByDocumento,
  type DocumentSearchArgs,
  type DocumentSearchOutcome,
} from '../services/documentSearch.service'
import { useInvalidateLegalProcesses } from './useLegalProcessMutations'

/** Consulta os processos de um CPF/CNPJ.
 *
 * Mutation, e não query: a consulta é pesada e não pode disparar sozinha ao
 * montar a tela, nem ser refeita por um refetch de foco de janela. Ela
 * acontece quando alguém clica, e só. */
export function useDocumentSearch() {
  return useMutation<DocumentSearchOutcome, Error, DocumentSearchArgs>({
    mutationFn: (args) => searchProcessosByDocumento(args),
    onError: (error) => toast.error(error.message),
  })
}

/** Um processo vindo da busca, já decidido pelo usuário. */
export interface ImportCandidate {
  processo: BpProcessoCapa
}

export interface ImportProcessosVars {
  candidates: ImportCandidate[]
  /** Todos entram vinculados a este cliente e nesta etapa, com este prazo. */
  clientId: string
  columnId: string
  nextDeadline: string
  onProgress?: (done: number, total: number) => void
}

export interface ImportProcessosResult {
  imported: string[]
  failed: { cnj: string; message: string }[]
}

/**
 * Cadastra em lote os processos escolhidos na busca por documento.
 *
 * ── Por que não reusa `useCreateLegalProcess` ──
 * Aquele hook é de UM processo: emite toast de sucesso e de erro por chamada,
 * o que num lote de doze vira doze avisos empilhados, e aborta no primeiro
 * erro. Aqui cada item é independente — um processo que falha não pode
 * impedir os outros onze de entrar.
 *
 * ── Consultas por processo ──
 * Movimentações, documentos públicos e resumo por IA são buscados. A capa NÃO
 * é consultada de novo: a busca por documento já a trouxe e ela foi gravada no
 * insert — é o que `assumeFresh` marca. Quando a fonte vier sem capa, o bloco
 * é buscado normalmente.
 */
export function useImportProcessosFromSearch() {
  const invalidate = useInvalidateLegalProcesses()
  const { user } = useAuth()

  return useMutation<ImportProcessosResult, Error, ImportProcessosVars>({
    mutationFn: async ({ candidates, clientId, columnId, nextDeadline, onProgress }) => {
      const result: ImportProcessosResult = { imported: [], failed: [] }

      for (const [index, { processo }] of candidates.entries()) {
        const lookup = toLookupResult(processo)
        const cnj = lookup.cnj_number

        try {
          if (!cnj) throw new Error('Processo sem número CNJ na resposta da API.')

          const input: LegalProcessInput = {
            // Sem título, todos os cards do lote sairiam com o mesmo rótulo (o
            // nome do cliente), e a lista ficaria ilegível.
            title: lookup.procedural_class ?? cnj,
            client_id: clientId,
            column_id: columnId,
            tags: [],
            next_deadline: nextDeadline,
            cnj_number: cnj,
            court: lookup.court,
            court_division: lookup.court_division,
            plaintiff: lookup.plaintiff,
            defendant: lookup.defendant,
            procedural_class: lookup.procedural_class,
            subject: lookup.subject,
            case_value: lookup.case_value,
            filing_date: lookup.filing_date,
            // `status` fica de fora de propósito: a busca por documento não
            // devolve `capa.situacao`, e o `ativo` que ela traz não serve de
            // substituto — há processos com "Arquivado Definitivamente" como
            // último ato vindo com `ativo: true`. Deixar o DEFAULT do banco
            // ('ativo') é honesto; adivinhar seria gravar um dado errado.
            parties: lookup.parties,
          }

          const created = await createLegalProcess(input, user!.id)

          // A capa veio junto da busca e já foi gravada acima. Sem isto,
          // sincronizar consultaria a API de novo pelo mesmo dado.
          const capaFromSearch = (processo.fontes ?? []).some((fonte) => fonte.capa)
          await syncProcessoFromApi({
            legalProcessId: created.id,
            cnj,
            assumeFresh: capaFromSearch ? ['capa'] : undefined,
          })

          // Publicações que chegaram antes do processo existir ficam órfãs.
          try {
            await linkPublicationsToProcess(cnj, created.id)
          } catch {
            // Vínculo é conveniência, não parte do cadastro.
          }

          result.imported.push(cnj)
        } catch (err) {
          result.failed.push({
            cnj: cnj || '(sem CNJ)',
            message: err instanceof Error ? err.message : 'Falha inesperada.',
          })
        }

        onProgress?.(index + 1, candidates.length)
      }

      return result
    },
    onSuccess: ({ imported, failed }) => {
      invalidate()

      if (imported.length > 0) {
        toast.success(
          imported.length === 1
            ? 'Processo importado!'
            : `${imported.length} processos importados!`,
        )
      }
      if (failed.length > 0) {
        toast.warning(
          `Não foi possível importar ${failed.length}: ${failed.map((f) => f.cnj).join(', ')}`,
        )
      }
    },
    onError: () => toast.error('Erro ao importar os processos.'),
  })
}
