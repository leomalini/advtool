export function formatCPF(value: string): string {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function formatCNPJ(value: string): string {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

/**
 * Formata um documento cuja natureza não se sabe de antemão.
 *
 * As partes vindas do tribunal trazem CPF ou CNPJ no mesmo campo, sem dizer
 * qual — a contagem de dígitos é o que separa os dois. Fora dos dois tamanhos
 * conhecidos, devolve o valor original em vez de mascarar errado.
 */
export function formatDocument(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 11) return formatCPF(digits)
  if (digits.length === 14) return formatCNPJ(digits)
  return value
}

/**
 * Máscara progressiva para um campo que aceita CPF ou CNPJ.
 *
 * Diferente de `formatDocument`, serve para uso a cada tecla: descarta tudo
 * que não é dígito, corta em 14 (o maior dos dois) e escolhe a máscara pela
 * contagem — até 11 dígitos ainda pode virar CPF, acima disso só CNPJ.
 */
export function maskDocument(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  return digits.length <= 11 ? formatCPF(digits) : formatCNPJ(digits)
}

export function formatPhone(value: string): string {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{4})$/, '$1-$2')
}

/**
 * Telefone brasileiro em E.164 (`+5511987654321`) — o formato que a API da
 * InfinitePay pede e que o `wa.me` usa sem o `+`.
 *
 * Aceita qualquer máscara, com ou sem o 55. Devolve null para o que não tem
 * forma de telefone brasileiro: DDD com dois dígitos de 1 a 9, seguido de
 * celular (9 dígitos começando com 9) ou fixo (8 dígitos começando de 2 a 5).
 * Contar dígitos não basta — `1 (212) 555-0100` tem 11 e viraria um celular de
 * São José dos Campos. Melhor não pré-preencher que mandar um número errado: a
 * InfinitePay recusaria o link inteiro.
 */
export function toBrazilianE164(value: string): string | null {
  const trimmed = value.trim()
  // DDI explícito que não é o do Brasil: número estrangeiro.
  if (trimmed.startsWith('+') && !trimmed.replace(/[\s().-]/g, '').startsWith('+55')) return null

  let digits = trimmed.replace(/\D/g, '')
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2)
  }
  return /^[1-9]{2}(9\d{8}|[2-5]\d{7})$/.test(digits) ? `+55${digits}` : null
}

export function formatCEP(value: string): string {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{5})(\d{3})$/, '$1-$2')
}
