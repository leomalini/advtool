'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { documentKeys } from '@/features/documentos/hooks/useDocuments'
import { useAuth } from '@/hooks/useAuth'
import type { ContractInput, UpdateContractInput } from '@/schemas/contract.schema'
import {
  CONTRACT_STATUS_LABELS,
  type ContractFileRole,
  type ContractStatus,
} from '@/types/contract.types'
import {
  changeContractStatus,
  createContract,
  deleteContract,
  updateContract,
  uploadContractFile,
} from '../services/contracts.service'
import { contractKeys } from './useContracts'

/** Toda superfície que mostra contrato — mesma forma dos demais invalidadores. */
export function useInvalidateContractSurfaces() {
  const queryClient = useQueryClient()

  return () => {
    // Prefixo — alcança detalhe e histórico.
    queryClient.invalidateQueries({ queryKey: contractKeys.all })
    // Os arquivos do contrato aparecem em /documentos e saem com ele.
    queryClient.invalidateQueries({ queryKey: documentKeys.all })
  }
}

/** Arquivo escolhido no formulário, para subir depois de o contrato existir. */
export interface PendingContractFile {
  file: File
  role: ContractFileRole
}

/** Sobe os arquivos um a um; um que falha não derruba os outros. Devolve
 * quantos falharam. Mesmo desenho de attachFilesToFinancialEntry. */
async function uploadAll(contractId: string, files: PendingContractFile[], userId: string) {
  const results = await Promise.allSettled(
    files.map(({ file, role }) => uploadContractFile(contractId, role, file, userId))
  )
  return results.filter((result) => result.status === 'rejected').length
}

function reportFiles(total: number, failed: number) {
  if (total === 0) return
  if (failed === 0) {
    toast.success(total === 1 ? 'Arquivo anexado!' : `${total} arquivos anexados!`)
  } else {
    toast.error(
      failed === total
        ? 'O contrato foi salvo, mas os arquivos não foram anexados.'
        : `O contrato foi salvo, mas ${failed} de ${total} arquivos não foram anexados.`
    )
  }
}

export function useCreateContract() {
  const invalidate = useInvalidateContractSurfaces()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ files = [], ...input }: ContractInput & { files?: PendingContractFile[] }) => {
      if (!user) throw new Error('Sessão expirada. Entre de novo.')
      const contract = await createContract(input, user.id)
      const failed = await uploadAll(contract.id, files, user.id)
      return { contract, total: files.length, failed }
    },
    onSuccess: ({ total, failed }) => {
      invalidate()
      toast.success('Contrato registrado!')
      reportFiles(total, failed)
    },
    onError: () => toast.error('Erro ao registrar o contrato.'),
  })
}

export function useUpdateContract() {
  const invalidate = useInvalidateContractSurfaces()

  return useMutation({
    mutationFn: (input: UpdateContractInput) => updateContract(input),
    onSuccess: () => {
      invalidate()
      toast.success('Contrato atualizado!')
    },
    onError: () => toast.error('Erro ao atualizar o contrato.'),
  })
}

export function useChangeContractStatus() {
  const invalidate = useInvalidateContractSurfaces()
  const { user } = useAuth()

  return useMutation({
    // `signedFile`: a versão assinada, enviada junto ao marcar como assinado.
    mutationFn: async ({
      id,
      status,
      signedAt,
      signedFile,
    }: {
      id: string
      status: ContractStatus
      signedAt?: string | null
      signedFile?: File | null
    }) => {
      await changeContractStatus(id, status, signedAt)
      if (!signedFile) return { status, fileFailed: false }
      if (!user) throw new Error('Sessão expirada. Entre de novo.')
      try {
        await uploadContractFile(id, 'assinado', signedFile, user.id)
        return { status, fileFailed: false }
      } catch {
        // O status já mudou; o arquivo pode ser anexado de novo pelo detalhe.
        return { status, fileFailed: true }
      }
    },
    onSuccess: ({ status, fileFailed }) => {
      invalidate()
      toast.success(`Contrato: ${CONTRACT_STATUS_LABELS[status].toLowerCase()}.`)
      if (fileFailed) toast.error('O status mudou, mas a versão assinada não foi anexada.')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Erro ao mudar o status.'),
  })
}

export function useUploadContractFiles() {
  const invalidate = useInvalidateContractSurfaces()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({
      contractId,
      files,
    }: {
      contractId: string
      files: PendingContractFile[]
    }) => {
      if (!user) throw new Error('Sessão expirada. Entre de novo.')
      const failed = await uploadAll(contractId, files, user.id)
      if (failed === files.length) throw new Error('Nenhum arquivo foi enviado.')
      return { total: files.length, failed }
    },
    onSuccess: ({ total, failed }) => {
      invalidate()
      if (failed === 0) {
        toast.success(total === 1 ? 'Arquivo anexado!' : `${total} arquivos anexados!`)
      } else {
        toast.error(`${failed} de ${total} arquivos não foram anexados.`)
      }
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Erro ao anexar arquivos.'),
  })
}

export function useDeleteContract() {
  const invalidate = useInvalidateContractSurfaces()

  return useMutation({
    mutationFn: (id: string) => deleteContract(id),
    onSuccess: () => {
      invalidate()
      toast.success('Contrato excluído.')
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir o contrato.'),
  })
}
