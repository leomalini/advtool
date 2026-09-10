import { ETIQUETAS } from '@/data/mock'
import type { CrmTag } from '@/schemas/crmItem.schema'

/**
 * Aparência de uma etiqueta na tela.
 *
 * `ETIQUETAS` só conhece as oito de fábrica, e desde que o formulário passou a
 * permitir criar etiqueta na hora, indexá-lo direto devolve `undefined` — o
 * que quebrava a renderização em `et.color`. Toda leitura de etiqueta passa a
 * vir por aqui.
 */
export interface TagAppearance {
  label: string
  /** Classe de fundo do chip. */
  color: string
  /** Classe da cor do texto. */
  textColor: string
}

/** Paleta das etiquetas criadas pelo usuário. Mesmas famílias de cor das de
 * fábrica, para que uma etiqueta nova não destoe do resto da tela. */
const CUSTOM_PALETTE: readonly Omit<TagAppearance, 'label'>[] = [
  {
    color: 'bg-[#eef0fe] dark:bg-[rgba(107,138,253,.12)]',
    textColor: 'text-[#3a4fd0] dark:text-[#93b1ff]',
  },
  {
    color: 'bg-[#eafaf2] dark:bg-[rgba(62,207,142,.12)]',
    textColor: 'text-[#0c8a5d] dark:text-[#7fe0b4]',
  },
  {
    color: 'bg-[#f2edfd] dark:bg-[rgba(176,124,240,.12)]',
    textColor: 'text-[#7048c8] dark:text-[#c9a4f5]',
  },
  {
    color: 'bg-[#fcf3e3] dark:bg-[rgba(245,181,68,.12)]',
    textColor: 'text-[#b0730f] dark:text-[#f5cf8a]',
  },
  {
    color: 'bg-[#e3f2fb] dark:bg-[rgba(56,189,248,.12)]',
    textColor: 'text-[#1a7fb8] dark:text-[#7fd0f5]',
  },
]

/** Índice estável a partir do texto: a mesma etiqueta recebe sempre a mesma
 * cor, em qualquer tela e entre sessões — uma cor sorteada mudaria a cada
 * render e faria a etiqueta parecer outra. */
function paletteIndex(tag: string): number {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) % 100000
  return hash % CUSTOM_PALETTE.length
}

export function tagAppearance(tag: CrmTag): TagAppearance {
  const builtin = ETIQUETAS[tag as keyof typeof ETIQUETAS]
  if (builtin) {
    return { label: builtin.label, color: builtin.color, textColor: builtin.textColor }
  }
  // Etiqueta criada pelo usuário: o próprio texto é o rótulo.
  return { label: tag, ...CUSTOM_PALETTE[paletteIndex(tag)] }
}

/** Só o rótulo — para os lugares que não pintam o chip. */
export function tagLabel(tag: CrmTag): string {
  return tagAppearance(tag).label
}

/** Normaliza o que a pessoa digitou ao criar uma etiqueta. Devolve null quando
 * não sobrou nada de aproveitável. */
export function normalizeTagInput(raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, ' ').slice(0, 40)
  return value.length > 0 ? value : null
}

/** Duas etiquetas são a mesma se diferem só por caixa ou acento — senão
 * "Urgente" e "urgente" viram duas etiquetas distintas na mesma lista. */
export function sameTag(a: CrmTag, b: CrmTag): boolean {
  return foldTag(a) === foldTag(b)
}

function foldTag(tag: CrmTag): string {
  return tag
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}
