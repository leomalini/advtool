'use client'

import { useQuery } from '@tanstack/react-query'
import { useDebounce } from '@/hooks/useDebounce'
import { findClientByDocument } from '../services/clientes.service'

/**
 * "Este CPF/CNPJ já é de alguém?" — enquanto a pessoa digita.
 *
 * O aviso precede a constraint do banco (migration 59) porque chegar até o
 * submit para então ser recusado significa perder o formulário inteiro
 * preenchido. Aqui o usuário descobre a tempo de abrir o cadastro que já
 * existe.
 *
 * `excludeId` é o cadastro sendo editado: ele não é duplicata de si mesmo.
 */
export function useClientDocumentMatch(document: string | null | undefined, excludeId?: string) {
  // 400ms: a consulta só dispara com 11 ou 14 dígitos, mas o campo passa por
  // esses tamanhos enquanto a máscara é aplicada — sem o atraso, colar um CPF
  // dispara uma consulta por caractere.
  const debounced = useDebounce(document ?? '', 400)
  const digits = debounced.replace(/\D/g, '')
  const isComplete = digits.length === 11 || digits.length === 14

  return useQuery({
    queryKey: ['clients', 'by-document', digits, excludeId ?? null],
    queryFn: () => findClientByDocument(digits, excludeId),
    enabled: isComplete,
    // Um cadastro criado noutra aba tem de aparecer aqui; o custo é uma
    // consulta por documento completo digitado.
    staleTime: 0,
    retry: false,
  })
}
