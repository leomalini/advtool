/**
 * Engole o clique que o navegador dispara logo depois de soltar o mouse.
 *
 * Arrastar e soltar sobre o mesmo elemento fecha o ciclo mousedown/mouseup
 * nele, e o clique abriria o detalhe do item (ou o "Novo" da célula) por cima
 * do que acabou de ser feito. Chamar dentro do mouseup — o dnd-kit chama
 * `onDragEnd` ali —, e o clique vem em seguida, na mesma tarefa, antes do
 * timeout que retira o ouvinte.
 */
export function suppressNextClick() {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
}
