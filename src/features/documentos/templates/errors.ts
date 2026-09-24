/**
 * Modelo com campo mal formado (`{cliente_nome` sem fechar, etc.).
 *
 * Fora de `docx.ts` para quem só precisa reconhecer o erro — o Assistente, ao
 * cadastrar um modelo — não carregar o `docxtemplater` junto.
 */
export class TemplateSyntaxError extends Error {
  constructor(readonly details: string[]) {
    super(`O modelo tem campos mal formados: ${details.join('; ')}`)
  }
}
