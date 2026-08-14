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

export function formatCEP(value: string): string {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{5})(\d{3})$/, '$1-$2')
}
