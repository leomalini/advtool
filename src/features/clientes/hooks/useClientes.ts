'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getClients,
  getPeople,
  getClientById,
  getClientsPendencies,
  getClientComments,
} from '../services/clientes.service'

export const clientKeys = {
  all: ['clients'] as const,
  /** Sob a raiz `clients` de propósito: invalidar `all` (o que toda mutação de
   * cadastro faz) atualiza também a lista de Pessoas. */
  people: ['clients', 'people'] as const,
  detail: (id: string) => ['clients', id] as const,
  comments: (id: string) => ['clients', 'comments', id] as const,
  /** Fora da raiz: quem muda o estado de cliente invalida esta também. */
  pendencies: ['client-pendencies'] as const,
}

export function useClientes() {
  return useQuery({
    queryKey: clientKeys.all,
    queryFn: getClients,
  })
}

/** Toda pessoa, cliente ou não (migration 78). */
export function usePessoas() {
  return useQuery({
    queryKey: clientKeys.people,
    queryFn: getPeople,
  })
}

/** Qual das duas telas de lista: Clientes ou Pessoas. */
export type CadastroListScope = 'clients' | 'people'

/** A lista de uma das duas telas, com a chave de cada uma — a mesma de
 * `useClientes`/`usePessoas`, então os caches são compartilhados. Um hook só,
 * e não os dois com `enabled`, para a tela não carregar a lista que não mostra. */
export function useCadastroList(scope: CadastroListScope) {
  return useQuery({
    queryKey: scope === 'people' ? clientKeys.people : clientKeys.all,
    queryFn: scope === 'people' ? getPeople : getClients,
  })
}

export function useCliente(id: string) {
  return useQuery({
    queryKey: clientKeys.detail(id),
    queryFn: () => getClientById(id),
    enabled: !!id,
  })
}

export function useClientComments(clientId: string) {
  return useQuery({
    queryKey: clientKeys.comments(clientId),
    queryFn: () => getClientComments(clientId),
    enabled: !!clientId,
  })
}

export function useClientesPendencies() {
  return useQuery({
    queryKey: clientKeys.pendencies,
    queryFn: getClientsPendencies,
  })
}
