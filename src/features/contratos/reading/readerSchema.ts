import { z } from 'zod'
import { SOURCE_KINDS } from '@/types/contract.types'

/**
 * O que a IA devolve ao ler os documentos de um contrato.
 *
 * Tudo texto, com "" para o que não consta: sem nulos, opcionais nem uniões —
 * o formato que os dois provedores (Gemini e Claude) seguem sem tropeçar na
 * saída estruturada. Datas e números voltam como estão no documento; quem
 * normaliza é o código (`mergeReading.ts`), não o modelo.
 */

const text = (description: string) => z.string().describe(description)

export const readerPersonSchema = z.object({
  tipo_pessoa: z.enum(['fisica', 'juridica']),
  nome: text('Nome completo ou razão social, como escrito no documento'),
  cpf_cnpj: text('CPF ou CNPJ, só se constar; "" se não'),
  rg: text('Número do RG (ou da identidade na CNH); "" se não constar'),
  rg_orgao: text('Órgão emissor e UF do RG, ex.: SSP/ES; "" se não constar'),
  sexo: text('"masculino", "feminino" ou "" se o documento não indicar'),
  nascimento: text('Data de nascimento em AAAA-MM-DD; "" se não constar'),
  nacionalidade: text('Nacionalidade no gênero da pessoa, ex.: brasileira; "" se não constar'),
  estado_civil: text(
    'solteiro, casado, divorciado, viuvo, uniao_estavel ou separado; "" se o documento não ' +
      'comprovar',
  ),
  profissao: text('Profissão; "" se não constar'),
  logradouro: text('Rua/avenida do endereço; "" se não constar'),
  numero: text('Número do endereço'),
  complemento: text('Complemento do endereço'),
  bairro: text('Bairro'),
  cidade: text('Cidade'),
  uf: text('UF com duas letras'),
  cep: text('CEP'),
  email: text('E-mail; "" se não constar'),
  telefone: text('Telefone; "" se não constar'),
  representante: text('Pessoa jurídica: quem a representa, como no documento; "" se não constar'),
  papel_sugerido: text(
    'A chave do papel desta pessoa no contrato, da lista dada no pedido; "" se não der para ' +
      'saber',
  ),
})

export const readerDocumentSchema = z.object({
  indice: z.number().int().describe('O número do documento, como no cabeçalho "Documento N"'),
  tipo: z.enum(SOURCE_KINDS as [string, ...string[]]),
  resumo: text('Uma linha: o que é e de quem, ex.: "CNH de Maria da Silva"'),
  pessoas: z
    .array(readerPersonSchema)
    .describe('Pessoas que o documento identifica, com o que ele traz de cada uma'),
  campos_do_modelo: z
    .array(
      z.object({
        campo: text('Nome do campo do modelo, da lista dada no pedido'),
        valor: text('O valor como está no documento'),
        pagina: text('Página onde está, se houver; "" se não'),
      }),
    )
    .describe('Valores para os campos do modelo que este documento comprova'),
  ilegivel: z.array(z.string()).describe('O que estava ilegível, cortado ou rasurado'),
})

/** Só na importação de um contrato pronto. */
export const readerContractSchema = z.object({
  titulo: text('Título curto: tipo de contrato e parte principal, ex.: "Locação — Rua X, 10"'),
  tipo: text(
    'honorarios (escritório de advocacia com cliente), cliente_terceiros (entre outras ' +
      'pessoas) ou escritorio (o escritório com fornecedor); "" se não der para saber',
  ),
  valor_total: text('Valor total em reais, só o número com ponto decimal, ex.: 5000.00; ""'),
  parcelas: text('Número de parcelas; ""'),
  primeiro_vencimento: text('Primeiro vencimento em AAAA-MM-DD; ""'),
  exito_percentual: text('Percentual de êxito, só o número, ex.: 20; ""'),
  inicio: text('Início da vigência em AAAA-MM-DD; ""'),
  fim: text('Fim da vigência em AAAA-MM-DD; ""'),
  reajuste: text('Índice de reajuste, ex.: IPCA; ""'),
  assinado_em: text('Data da assinatura em AAAA-MM-DD, se o documento for a via assinada; ""'),
})

export function readerOutputSchema(importing: boolean) {
  const base = z.object({ documentos: z.array(readerDocumentSchema) })
  return importing ? base.extend({ contrato: readerContractSchema }) : base
}

export type ReaderPerson = z.infer<typeof readerPersonSchema>
export type ReaderDocument = z.infer<typeof readerDocumentSchema>
export type ReaderContract = z.infer<typeof readerContractSchema>
export interface ReaderOutput {
  documentos: ReaderDocument[]
  contrato?: ReaderContract
}
