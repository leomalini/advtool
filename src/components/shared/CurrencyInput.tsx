'use client'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface CurrencyInputProps {
  /** Valor em reais. `undefined`/NaN renderiza vazio. */
  value: number | undefined
  onChange: (value: number | undefined) => void
  placeholder?: string
  className?: string
  id?: string
}

/**
 * Campo monetário em pt-BR.
 *
 * `<input type="number">` aceita qualquer precisão enquanto se digita (dá para
 * escrever 500,0000001), e só reclama no submit — tarde demais. Aqui a entrada
 * é tratada como centavos: cada dígito empurra o número para a esquerda, então
 * é impossível digitar mais de duas casas decimais, e o texto já aparece
 * formatado ("1.234,56") em vez de exigir que o usuário acerte a pontuação.
 */
export function CurrencyInput({
  value,
  onChange,
  placeholder = '0,00',
  className,
  id,
}: CurrencyInputProps) {
  const display =
    value === undefined || Number.isNaN(value)
      ? ''
      : value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  function handleChange(raw: string) {
    const digits = raw.replace(/\D/g, '')
    if (digits === '') {
      onChange(undefined)
      return
    }
    // Limite defensivo: acima disso o Number perde precisão inteira.
    const cents = Number(digits.slice(0, 15))
    onChange(cents / 100)
  }

  return (
    <Input
      id={id}
      // text, não number: o teclado numérico vem do inputMode, e o valor
      // exibido é formatado — que type="number" não aceitaria.
      type="text"
      inputMode="numeric"
      value={display}
      onChange={(e) => handleChange(e.target.value)}
      placeholder={placeholder}
      className={cn('text-right tabular-nums', className)}
    />
  )
}
