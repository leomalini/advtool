/**
 * Uma inscrição na OAB como chave de comparação: 'UF:NÚMERO', sem zeros à
 * esquerda.
 *
 * A mesma inscrição chega em três grafias: a capa da BuscaProcessos manda
 * `{ numero: '0009591', uf: 'ES' }`, o diário manda '9591/ES' e o perfil guarda
 * o que a pessoa digitou ('9.591'). Comparar qualquer uma delas sem normalizar
 * faz o advogado do escritório passar despercebido no próprio processo.
 *
 * É também o formato gravado em `legal_process_parties.lawyer_oabs`
 * (migration 88) — mudar aqui exige reescrever a coluna.
 */
export function oabKey(
  state: string | null | undefined,
  number: string | number | null | undefined,
): string | null {
  const uf = (state ?? '').trim().toUpperCase()
  const digits = String(number ?? '').replace(/\D/g, '').replace(/^0+/, '')
  if (uf.length !== 2 || !/^[A-Z]{2}$/.test(uf) || !digits) return null
  return `${uf}:${digits}`
}

/**
 * A inscrição escrita por extenso, como o diário a publica.
 *
 * Aceita '123456/SP', '123456-SP', 'SP 123456', 'OAB/SP 123456' e
 * 'OAB/SP nº 123.456'. Suplementar ('123456-A/SP') perde a letra: a OAB do
 * perfil não tem onde guardá-la, e a comparação precisa casar as duas.
 */
export function parseOabText(value: string | null | undefined): string | null {
  const text = (value ?? '').toUpperCase()

  const numberFirst = text.match(/(\d[\d.]*)\s*-?\s*[A-Z]?\s*[/-]\s*([A-Z]{2})\b/)
  if (numberFirst) return oabKey(numberFirst[2], numberFirst[1])

  const stateFirst = text.match(/\b([A-Z]{2})\s*(?:N[º°O.]*\s*)?(\d[\d.]*)/)
  if (stateFirst) return oabKey(stateFirst[1], stateFirst[2])

  return null
}
