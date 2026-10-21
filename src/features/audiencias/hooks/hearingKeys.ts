/**
 * Chaves de Audiências num arquivo sem imports: a Agenda precisa invalidá-las
 * (arrastar um compromisso muda a pauta), e importar o módulo de hooks inteiro
 * de lá criaria uma volta entre os dois.
 */
export const hearingKeys = {
  all: ['hearings'] as const,
  agenda: (from: string, to: string, includeCancelled: boolean) =>
    ['hearings', 'agenda', from, to, includeCancelled] as const,
  withoutDate: () => ['hearings', 'without-date'] as const,
  detail: (id: string) => ['hearings', 'detail', id] as const,
  forProcess: (legalProcessId: string) => ['hearings', 'process', legalProcessId] as const,
  attention: () => ['hearings', 'attention'] as const,
}

/** Fora de `hearingKeys.all`: invalidar as audiências não precisa reler os
 * tipos, que só mudam em Configurações. */
export const hearingKindKeys = {
  all: ['hearing-kinds'] as const,
}
