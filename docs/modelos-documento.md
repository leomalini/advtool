# Modelos de documento

Contratos, procurações e petições do escritório em .docx, com campos entre
chaves. O sistema troca os campos pelos dados do cliente e do processo e
devolve o .docx com a formatação do original: fonte, margens, timbre e estilos
ficam intactos.

Há dois jeitos de gerar, e os dois usam o mesmo motor:

| Pela tela | Pelo Assistente |
|---|---|
| Botão **Gerar documento** no cliente, no processo e em Documentos → Modelos | Pedido em linguagem natural em /ia |
| O que falta no cadastro se completa ali mesmo | O modelo pergunta o que faltar |
| Monta o .docx no navegador, sem IA | Monta no servidor e deixa o arquivo na conversa |
| "Redigir com IA" só nos campos de texto: 1 pedido por documento | Várias consultas por pedido |
| Prévia do documento ao lado do formulário | O arquivo fica na conversa para baixar |

## Os tipos de campo

| Tipo | Quem preenche | Exemplo |
|---|---|---|
| **Cadastro** | o sistema, a partir do banco | `{cliente_nome}`, `{processo_cnj}`, `{advogados}` |
| **Manual** | quem gera, digitando na tela | `{valor_honorarios}`, `{percentual_exito}` |
| **Opções** | quem gera, escolhendo entre opções criadas no modelo | `{forma_pagamento}`, `{pedidos}` |
| **IA** | a IA redige, e quem gera revisa | `{fatos}`, `{fundamentos}` |

Os campos de cadastro são os do catálogo (`src/features/documentos/templates/catalog.ts`,
também listado na aba Modelos). Qualquer outro nome é manual, opções ou IA,
conforme a definição do modelo (`document_templates.field_settings`, migration
66). Sem definição, o tipo é inferido pelo nome (`fieldSettings.ts`), e o padrão
é **manual**: na dúvida, é melhor pedir o valor a quem gera do que deixar a IA
escrever um número de honorários. Campo de opções nunca é inferido, porque as
opções só existem se alguém as criou.

- **Opções:**
  - Cada opção tem um rótulo, que aparece na hora de escolher, e um texto, que
    vai para o documento. Sem texto, vai o próprio rótulo. Assim, uma escolha
    curta ("Parcelado") pode inserir uma cláusula inteira.
  - Com "permitir mais de uma", as escolhidas entram na ordem do modelo, em
    lista ("A, B e C") ou uma por parágrafo.
  - Nada escolhido sai como `[FALTA: campo]`.
  - O modelo não pode ser salvo com um campo de opções sem nenhuma opção.
  - Os ids das opções não mudam ao editar, e é por eles que a escolha é
    guardada.

- **Por extenso:** `{x_extenso}` é o campo manual `{x}` escrito por extenso:
  "R$ 5.000,00" vira "cinco mil reais", 30 vira "trinta por cento" e uma data vira
  "24 de setembro de 2026". Campo com versão por extenso é sempre manual.
- **Maiúsculas e negrito:** vêm do Word. A formatação aplicada ao campo vale
  para o valor.
- **Campo sem valor:** sai `[FALTA: campo]` no documento. É um buraco visível
  que aparece na revisão, em vez de uma frase que some sem ninguém notar. A
  tela avisa antes de baixar.
- **Parágrafos:** num texto longo (manual ou da IA), linha em branco separa
  parágrafos. Cada parágrafo vira um `<w:p>` com as propriedades do parágrafo
  do modelo; quebra de linha manual, num parágrafo justificado, esticaria a
  linha.

## Dados que o cadastro precisa ter

- **Cliente do processo:** vem do dono do card mestre (`wf-processos`) ou, sem
  dono, da única parte vinculada a um cliente. `{parte_contraria}` e
  `{cliente_tipo_parte}` exigem o cliente vinculado a uma parte — sem isso não
  dá para saber de que lado ele está.
- **Advogados:** escolhidos ao gerar, um ou vários. O primeiro é o de
  `{advogado_nome}`. A UF vem de `profiles.oab_state`.
- **Escritório:** Configurações → Geral (`office_settings`, uma linha só).
  Alimenta `{escritorio_*}` e `{local_e_data}`, e guarda o papel timbrado.
- **Comarca:** a BuscaProcessos não informa. Precisa ser digitada no processo
  ou completada na tela de geração.

## Prévia

A tela de geração mostra, ao lado do formulário, o documento como vai sair:
- **Mesmo preenchimento do download:** o .docx é preenchido no navegador com
  os valores atuais e desenhado página a página pela biblioteca `docx-preview`.
  A prévia é remontada 400 ms depois da última alteração.
- **Revisão:** os `[FALTA: …]` e `[PREENCHER: …]` aparecem destacados. A página
  é reduzida para caber na largura do painel; no celular, formulário e prévia
  se revezam.
- **É uma aproximação:** a biblioteca só quebra página onde o documento manda
  quebrar, então a paginação final é a do Word.
- **Segurança:**
  - O HTML embutido num .docx (`altChunk`) não é desenhado; a biblioteca o
    poria num `iframe` da mesma origem.
  - Links que não sejam `http(s)`/`mailto` perdem o endereço.
  - Os estilos da biblioteca ficam fora de `@layer`, por isso as poucas
    sobreposições no painel usam `!`.

## IA

- **Redigir com IA** (`POST /api/documentos/modelos/redigir`): faz 1 pedido ao
  provedor, com saída estruturada (um texto por campo). A IA recebe a instrução
  de cada campo, os nomes das partes, os dados e o andamento recente do
  processo, as anotações de quem gera e os documentos que ele marcar. **Não
  recebe CPF, RG nem endereço**: o sistema preenche esses campos depois. No
  plano gratuito do Gemini o conteúdo enviado pode ser usado pelo Google.
  Dado que não sai, não vaza.
- **Assistente:**
  - `listar_modelos` descreve os tipos de campo de cada modelo, com as opções
    dos campos de opções.
  - `gerar_documento_de_modelo` aceita um modelo cadastrado ou um .docx
    anexado na conversa, como modelo avulso. As opções são escolhidas pelo
    rótulo (`escolhas`); rótulo que não existe vira aviso.
  - `cadastrar_modelo` é uma ação com confirmação que guarda o anexo como
    modelo.
  - `gerar_docx` escreve um Word livre (Markdown → OOXML) dentro do papel
    timbrado.

## Arquivos

| Parte | Onde |
|---|---|
| Catálogo, tipos de campo, extenso, valores | `src/features/documentos/templates/{catalog,fieldSettings,spellOut,values}.ts` |
| Leitura e preenchimento do .docx | `src/features/documentos/templates/docx.ts` (carregado sob demanda na tela) |
| Dados do banco | `src/features/documentos/templates/resolveFields.ts` |
| Tela de geração | `src/features/documentos/components/GenerateDocumentDialog.tsx` |
| Prévia | `src/features/documentos/components/DocumentPreview.tsx` |
| Definição do modelo | `src/features/documentos/components/{TemplateFormDialog,TemplateChoiceEditor}.tsx` |
| Redação com IA | `src/app/api/documentos/modelos/redigir/route.ts`, `templates/{drafting,draftingContext}.ts` |
| Assistente | `src/features/ia/tools/{templates,docx}.ts`, `src/features/ia/docx/markdownToDocx.ts` |
| Escritório | `src/features/configuracoes/components/OfficeSettingsCard.tsx` |

## Fora de escopo (por ora)

- PDF gerado direto do modelo. Na Vercel não há LibreOffice, e um serviço de
  conversão seria pago. Por enquanto o PDF sai pelo "Salvar como PDF" do Word.
- Transformar uma petição pronta em modelo com ajuda da IA.
- Paginação exata na prévia (ela depende do motor de layout do Word).
- Vários clientes no mesmo documento (litisconsórcio).
- Gravar no cadastro o que foi completado na tela de geração.
