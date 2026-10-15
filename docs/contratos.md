# Contratos

> **Status:** plano e decisões aprovados em 2026-10-14 (todas as
> recomendações, todos os extras da v1). **Fase 1** na branch
> `feat/contratos-base` (migration 69 aplicada no remoto em 2026-10-14).
> **Fase 2** na branch `feat/contratos-partes`, empilhada na 1 (migration 70
> aplicada no remoto em 2026-10-15). Ver "Como ficou" de cada fase.

Pedido: um módulo **Contratos** para anexar contratos e criar modelos de
contrato, como em Documentos, integrado ao Assistente: anexar documentos e, com
os dados deles, gerar um contrato. A CNH foi só um exemplo. Um contrato pode
nascer de **vários documentos**, de **várias partes** e do **objeto** (imóvel,
veículo).

## Decisões

| Tema | Escolha |
|---|---|
| Estrutura | **Registro próprio** (`contracts`) com partes, status, valor e vigência. Os arquivos continuam em `documents`, ligados ao contrato |
| Tipos | **Honorários** (escritório × cliente), **do cliente com terceiros** e **do próprio escritório** |
| Pessoa que não é cliente | Gravada como **parte daquele contrato**. Se for o cliente, o Assistente oferece cadastrá-la, com confirmação |
| Fonte dos números | **O registro alimenta tudo:** valor, parcelas, êxito e vigência são campos do contrato. O modelo os usa como `{contrato_*}` e o Financeiro sai deles |
| Dados do objeto (matrícula, CRLV…) | **Preenchem os campos manuais do modelo**, cada valor com o documento de origem. Quem gera revisa antes |
| Documentos lidos | **Guardados como anexos do contrato**, ligados à parte que alimentaram. Dá para desmarcar arquivo por arquivo antes de salvar |
| Documentos que discordam | **Mostrar os valores com a origem, e a pessoa escolhe.** Nada é decidido sozinho |
| Modelos | **Só em Contratos → Modelos** (categoria `contrato`). Documentos → Modelos fica com petições, procurações e outros |
| Financeiro | **Oferecido ao assinar:** prévia das parcelas e do êxito para conferir e confirmar. Nada nasce sozinho |
| Avisos de vencimento | **Agenda e notificação** |
| v1 inclui | Status e vigência, Financeiro, versão assinada e importação de contrato pronto |
| Permissões | Recurso novo `contratos` no RBAC, com a mesma matriz de `documentos`. O perfil `finance` vê |

## Como está hoje

| Peça | Onde | O que importa |
|---|---|---|
| Modelos | `document_templates` (migrations 62 e 66) | Já tem `category = 'contrato'` e `field_settings` (manual, opções, IA) |
| Motor | `src/features/documentos/templates/` | Catálogo, classificação dos campos, valores, extenso e preenchimento do .docx. Roda na tela e no servidor |
| Dados do cliente | `templates/resolveFields.ts` → `clientValues` | Os campos `{cliente_*}` só saem do banco, por `cliente_id` |
| Qualificação | `features/clientes/utils/qualificacao.ts` → `buildQualificacao(client)` | Recebe um `ClientWithRelations`. Uma parte que não é cliente não tem esse formato |
| Arquivos | `documents` (migrations 23 e 63) | Categoria `contrato` existe. Todo arquivo precisa de dono (`chk_documents_has_parent`). Anexo de lançamento é exclusivo e segue o Financeiro (`lancamentos/`) — é o precedente para o contrato |
| Tela de geração | `components/GenerateDocumentDialog.tsx` | Prévia, campos manuais, opções e "Redigir com IA" |
| Assistente | `features/ia/tools/templates.ts` | `gerar_documento_de_modelo` aceita modelo cadastrado ou .docx anexado |
| Anexos do chat | `features/ia/files/constants.ts` | PDF e imagem vão no original; Word, Excel e texto como texto extraído. **5 anexos por mensagem** (`AI_FILES_PER_MESSAGE`), 25 MB cada |
| Leitura de anexo antigo | `tools/read/files.ts` → `ler_arquivo` | Um arquivo por chamada, e o conteúdo só vale no turno atual. Com `MAX_STEPS = 8` no chat, ler oito documentos um a um não cabe num turno |
| Ações do Assistente | `tools/actions.ts` + `hooks/useExecuteAction.ts` | Sem `execute`: a tela confirma e chama o service do módulo. **Não existe ação para cadastrar cliente** |
| CNPJ | `app/api/cnpj/route.ts` | Consulta a BrasilAPI: razão social, fantasia, contato e endereço |
| Financeiro | `financial_entries` | Lançamento um a um, **sem parcelamento**. `settlement_kind = 'conditional'` ("Condição especial") serve para o êxito. `amount` é obrigatório e aceita 0 |
| Avisos | `notifications` (migration 47) | Gravados na hora do fato, por webhook. **Não há job agendado** no sistema |
| RBAC | `role_permissions` (migration 34) | `resource` não tem CHECK: recurso novo é só `insert` + o tipo `Resource` |

### O que falta para "documentos → contrato"

- Quem não é cliente sai como `[FALTA: cliente_nome]`.
- Contrato tem várias partes. O modelo só conhece "o cliente" e a parte
  contrária do processo.
- Os dados de uma pessoa vêm espalhados: nome e CPF da CNH, endereço do
  comprovante, estado civil da certidão. Nenhum documento sozinho fecha a
  qualificação.
- Dados do objeto (matrícula, CRLV) não têm para onde ir além de campo manual
  digitado.

## Leitor de documentos

Uma peça só, usada pela tela ("Ler documentos") e pelo Assistente
(`ler_documentos`).

- **Um pedido à IA para todos os arquivos:** até 10 por leitura e 50 MB no
  total. O Gemini aceita 100 MB por pedido. PDF e imagem vão no original;
  Word como texto. Aceita anexos de mensagens anteriores e documentos já
  cadastrados, então os arquivos podem chegar em várias mensagens.
- **A IA lê, o código junta.** A saída estruturada (zod) traz, por documento:
  - o tipo, de uma lista conhecida (abaixo) ou `outro`;
  - de quem é (pessoa física ou jurídica) ou o que descreve (imóvel, veículo,
    outro);
  - os dados lidos, com a página;
  - o que estava ilegível ou cortado.
- **A junção e os conflitos são código, não IA:**
  - Agrupa a mesma pessoa pelo CPF/CNPJ normalizado. Sem documento, pelo nome,
    marcado como "conferir".
  - Valor diferente para o mesmo dado vira **conflito**, com as origens
    (ex.: nome na CNH × nome na certidão). Nada é escolhido sozinho.
  - CPF/CNPJ já cadastrado aponta o cliente existente, para completar em vez
    de duplicar.
- **CNPJ lido** pode ser completado pela consulta que já existe
  (`/api/cnpj`). A consulta é mais uma origem e também entra na regra de
  conflitos.
- **Campos manuais do modelo:** o leitor recebe os campos do modelo (nome,
  rótulo, formato) e sugere valores com origem
  (`{imovel_matricula}` ← "matricula.pdf, p. 1"). A tela marca cada um como
  "lido de…" até ser revisado.
- **Sugestões de papel:** proprietário na matrícula → Locador ou Vendedor.
  Certidão de casamento traz o cônjuge: em contrato de imóvel, sugerir
  incluí-lo como parte anuente.
- **Tipos conhecidos (v1):**
  - Pessoa física: RG, CNH, CPF, certidão de nascimento ou casamento,
    comprovante de residência.
  - Pessoa jurídica: contrato social e alterações, cartão CNPJ, ata ou
    procuração de representação.
  - Objeto: matrícula, carnê de IPTU, CRLV ou CRV, nota fiscal.
  - Outros: contrato anterior, procuração.
- **Chat:** `AI_FILES_PER_MESSAGE` sobe de 5 para 10, com teto de 50 MB por
  mensagem. Custo conhecido: no turno em que o arquivo é anexado, ele vai ao
  modelo do chat e ao leitor. Depois, só o resultado estruturado fica na
  conversa.

## Modelo de dados

O desenho completo. Cada fase traz a sua migration: a 69 (fase 1) criou
`contracts` sem `template_values`, o histórico de status e
`documents.contract_id` + `contract_file_role`. O resto entra quando a fase que
o usa chegar.

### `contracts`

| Coluna | Observação |
|---|---|
| `kind` | `honorarios` · `cliente_terceiros` · `escritorio` |
| `title` | "Honorários — Maria Silva" |
| `status` | `rascunho` → `aguardando_assinatura` → `vigente` → `encerrado` / `rescindido`. **Vencido** não é guardado: é `vigente` com `end_date` no passado, calculado como o "Atrasado" do Financeiro |
| `client_id`, `legal_process_id`, `crm_item_id` | Opcionais. Obrigatório ter cliente quando `kind = 'honorarios'` |
| `template_id` | Modelo usado, se houver |
| `template_values` | jsonb com os campos manuais, de opções e de IA, e a origem de cada valor. Permite gerar nova versão da minuta sem redigitar |
| `responsible_id` | Quem recebe os avisos |
| `total_amount`, `installments`, `first_due_date`, `success_fee_percent` | Números de honorários e de despesa. Alimentam os campos `{contrato_*}` e a prévia do Financeiro |
| `start_date`, `end_date`, `notice_days` (padrão 30), `auto_renew`, `adjustment_index` | Vigência, aviso e reajuste |
| `signed_at` | Preenchido ao marcar como assinado |
| `notes`, `created_by`, `created_at`, `updated_at` | — |

### `contract_parties`

Uma linha por parte. Guarda uma **cópia** da qualificação no momento do
contrato: o documento já saiu com aqueles dados, e o registro precisa contar a
mesma história mesmo que o cadastro mude depois.

| Coluna | Observação |
|---|---|
| `role_key`, `role_label` | `locatario` / "Locatário". Vêm do modelo (ver abaixo) ou são digitados |
| `source` | `cliente` · `escritorio` · `documentos` · `manual` |
| `client_id` | Quando a parte é um cliente cadastrado |
| `person_type`, `name`, `document`, `rg`, `rg_issuer`, `birth_date`, `nationality`, `marital_status`, `profession`, `address` (jsonb), `email`, `phone`, `representative` | Mesmos campos da qualificação do cliente |
| `field_sources` | jsonb, dado → documento de origem (`{"marital_status": "<document_id>"}`). Vários documentos alimentam a mesma parte |
| `position` | Ordem no contrato |

### Vínculos novos

- `documents`:
  - `contract_id`: exclusivo, como o anexo de lançamento. Herda cliente e
    processo do contrato para aparecer em Documentos e na ficha. Segue a
    permissão `contratos` na RLS e no Storage (pasta `contratos/<id>/`), como
    a migration 63 fez com `lancamentos/`.
  - `contract_file_role`: `minuta` · `assinado` · `anexo`.
  - `contract_party_id`: de quem é o documento, quando é de uma parte.
  - `source_kind`: o tipo lido (`cnh`, `matricula`…), para a lista mostrar
    "CNH — João Silva" sem depender do nome do arquivo.
- `financial_entries.contract_id` — os lançamentos gerados pelo contrato.
- `events.contract_id` — o compromisso de vencimento abre o contrato.
- `document_templates.parties jsonb` — os papéis que o modelo declara (ver
  "Campos do modelo").
- `role_permissions`: linhas de `contratos` para os quatro perfis.

## Campos do modelo

### Grupo novo do catálogo: `contrato`

`{contrato_valor}`, `{contrato_valor_extenso}`, `{contrato_parcelas}`
("10 parcelas mensais de R$ 500,00"), `{contrato_parcela_valor}`,
`{contrato_primeiro_vencimento}`, `{contrato_exito_percentual}`,
`{contrato_exito_percentual_extenso}`, `{contrato_inicio}`, `{contrato_fim}`,
`{contrato_prazo}` ("12 meses"), `{contrato_reajuste}`.

Saem do registro, nunca da IA. Modelos de contrato que já usam
`{valor_honorarios}` como campo manual continuam funcionando. A tela sugere
trocar pelo campo do catálogo, como já faz com erro de digitação
(`suggestCatalogField`).

### Partes

O modelo declara os papéis em `document_templates.parties`
(`[{ "key": "locatario", "label": "Locatário" }]`), com atalhos para os comuns:
Contratante, Contratado, Locador, Locatário, Comprador, Vendedor, Fiador,
Cônjuge anuente, Testemunha. Cada papel ganha os mesmos sufixos do cliente:

`{locatario_nome}`, `{locatario_qualificacao}`, `{locatario_documento}`,
`{locatario_rg}`, `{locatario_estado_civil}`, `{locatario_profissao}`,
`{locatario_nacionalidade}`, `{locatario_nascimento}`, `{locatario_endereco}`,
`{locatario_cidade}`, `{locatario_uf}`, `{locatario_cep}`, `{locatario_email}`,
`{locatario_telefone}`, `{locatario_representante}`.

Na geração, cada parte é preenchida por uma de quatro fontes:

| Fonte | Dados |
|---|---|
| Cliente | O cadastro, pelo mesmo caminho de `{cliente_*}` |
| Escritório | `office_settings` + advogados escolhidos. É o "Contratado" dos honorários |
| Documentos | O que o leitor juntou de um ou mais documentos, depois de revisado |
| Manual | Digitados |

Fontes se completam: um cliente cadastrado sem endereço recebe o do
comprovante, e a diferença aparece como conflito quando os dois têm valor.
`{cliente_*}` continua valendo: é o cliente do contrato. `buildQualificacao`
passa a receber um formato mínimo de pessoa, para servir ao cliente e à parte.

### Objeto

Sem grupo fixo na v1. Matrícula, CRLV e afins preenchem os **campos manuais**
do modelo (`{imovel_matricula}`, `{veiculo_placa}`), sugeridos pelo leitor com
a origem. Se os mesmos campos se repetirem em vários modelos, vira grupo do
catálogo depois.

## Telas

- **`/contratos`** (menu Gestão), com duas abas:
  - **Contratos:** lista com filtros por status, tipo, cliente e "vencendo em
    30 dias", e indicadores (vigentes, aguardando assinatura, vencendo).
  - **Modelos:** a mesma tela de Documentos → Modelos, filtrada em
    `contrato`, com o editor de papéis.
- **Novo contrato**, em passos:
  1. Tipo e modelo (ou "sem modelo", para só registrar).
  2. **Documentos e partes:**
     - Sobe vários documentos de uma vez. O leitor diz o tipo de cada um, de
       quem é e o que leu.
     - A tela propõe as partes e a parte de cada documento; a pessoa ajusta
       arrastando ou escolhendo.
     - Conflitos aparecem lado a lado, com a origem, para escolher.
     - CPF já cadastrado mostra o cliente existente.
     - Cada documento tem "guardar no contrato" (marcado por padrão).
  3. Valores e vigência.
  4. Campos do modelo e prévia: a tela de geração atual. Os valores lidos de
     documentos vêm marcados "lido de…" até serem revisados.
  5. Salva como **rascunho**, com a minuta e os documentos marcados anexados.
- **Importar contrato pronto:** sobe PDF ou Word (e, se quiser, os documentos
  das partes), o leitor preenche partes, valor e vigência, a pessoa confere e
  escolhe o status. O arquivo entra como `assinado` ou `minuta`.
- **Detalhe do contrato:** partes (com a origem de cada dado), números,
  arquivos por papel (minuta, assinado, anexos por parte), lançamentos ligados
  e histórico de status. "Gerar nova versão" refaz a minuta a partir de
  `template_values`.
- **Marcar como assinado:** pede o PDF assinado (opcional) e, em honorários e
  contratos do escritório, abre a **prévia dos lançamentos**.
- **Cliente e processo:** aba Contratos com "Novo contrato" já preenchido. O
  "Gerar documento" dessas telas deixa de listar modelos de contrato, que
  passam pelo fluxo acima.

## Financeiro

- **Honorários:** N receitas `honorario` com vencimento, mais o êxito como
  "Condição especial" (`conditional`) com a condição escrita ("30% do proveito
  econômico").
- **Do escritório:** despesas, na mesma prévia.
- **Do cliente com terceiros:** nada. O dinheiro não é do escritório.
- Os lançamentos recebem `contract_id`. Editar o contrato depois **não**
  reescreve lançamentos: a tela avisa que valores divergem e deixa a correção
  com quem tem `financeiro:update`.
- Quem não tem `financeiro:create` vê o aviso "peça a quem cuida do
  Financeiro", em vez da prévia.

## Avisos de vencimento

- **Agenda:** um compromisso "Vence o contrato X" em `end_date − notice_days`,
  para o responsável. É refeito quando as datas mudam e sai quando o contrato
  é encerrado ou rescindido.
- **Notificação:** o primeiro job agendado do sistema. Função SQL diária via
  `pg_cron` que grava `notifications` (`kind = 'contrato_vencendo'`,
  `resource = 'contratos'`), uma por contrato e data. Habilitar a extensão
  entra na migration e precisa de ok antes de aplicar.

## Assistente

### Tools

| Tool | Tipo | O que faz |
|---|---|---|
| `ler_documentos` | leitura | O leitor de documentos: anexos desta conversa (de qualquer mensagem) e documentos cadastrados, até 10. Devolve documentos, pessoas, conflitos e sugestões. Opcionalmente recebe o modelo, para sugerir os campos manuais |
| `listar_contratos` | leitura | Filtro por cliente, processo, status, tipo, "vencendo até" |
| `ver_contrato` | leitura | Partes, números, arquivos e lançamentos |
| `listar_modelos` | leitura (existente) | Passa a descrever os papéis e os campos `{contrato_*}` |
| `gerar_contrato` | gera arquivo | Modelo cadastrado ou .docx anexado; as partes (`cliente_id`, `escritorio` ou dados vindos de `ler_documentos`, com a origem); os números do contrato; os campos manuais, de opções e de IA. O arquivo fica na conversa |
| `cadastrar_cliente` | ação confirmada | Cria o cliente com os dados lidos. Antes procura o CPF (`findClientByDocument`); se existir, propõe completar |
| `completar_cliente` | ação confirmada | Preenche só o que está em branco no cadastro |
| `registrar_contrato` | ação confirmada | Cria o contrato e as partes, e anexa o arquivo gerado (ou importado) e os documentos que o usuário quiser guardar |

### Exemplo: locação

1. O usuário anexa os RGs do locador e do locatário, o comprovante de
   residência do locatário e a matrícula, e pede "contrato de locação,
   R$ 2.000 por mês, 30 meses".
2. `ler_documentos` devolve as duas pessoas, o endereço do comprovante já
   juntado ao locatário, os dados do imóvel e a sugestão "proprietário na
   matrícula → Locador".
3. O Assistente mostra o que leu de cada documento e os conflitos, e pergunta
   o que faltar (estado civil, profissão) ou o que estiver ambíguo (quem é
   quem, se a matrícula não disser).
4. `gerar_contrato` devolve o .docx, com a lista do que ficou `[FALTA]`.
5. `registrar_contrato` (confirmado) cria o rascunho com a minuta e os
   documentos marcados.

### Prompt

Seção nova "Contratos":
- Dado de documento só vai para uma parte depois de mostrado ao usuário, com a
  origem.
- Conflito entre documentos: apresentar os valores e perguntar, nunca
  escolher.
- Parte ambígua (dois RGs, nenhum papel óbvio): perguntar.
- Buscar o CPF antes de cadastrar cliente.
- Números do contrato: só os que o usuário disse.
- Nunca marcar contrato como assinado.

### Privacidade e cota

- Os documentos vão inteiros para o provedor, e agora são vários por contrato
  (RG, certidão, comprovante). No plano gratuito do Gemini o conteúdo pode ser
  usado pelo Google. Antes de usar documento real: chave paga ou
  `AI_ASSISTANT_PROVIDER=anthropic`.
- Cota gratuita: 20 pedidos por dia por modelo, dividida com o portal. O
  leitor gasta 1 pedido por leitura, qualquer que seja o número de arquivos.

## Fases

Cada fase é um PR. Se ficarem empilhados, mergear um por vez trocando a base
para `main` antes do merge, ou abrir um PR só do topo da pilha.

1. **Base:** migration 69, RBAC, `/contratos` (lista, detalhe, anexos por
   papel, status e vigência), aba Modelos com o filtro, item no menu. Sem IA.
2. **Partes, números e leitor:** papéis no modelo, grupo `contrato` no
   catálogo, leitor de documentos, "Novo contrato" em passos e "Importar
   contrato pronto".
3. **Assistente:** tools da tabela acima, limite de anexos e prompt.
4. **Financeiro e avisos:** prévia dos lançamentos ao assinar, compromisso na
   Agenda e notificação diária com `pg_cron`.

Verificação de cada fase: `tsc --noEmit`, `pnpm lint`, build e conferência no
navegador. O projeto não usa testes automatizados. O leitor precisa de
documentos de exemplo sem dado real para conferir contra o modelo; com a cota
gratuita, poucas leituras por dia.

## Como ficou a fase 1

Branch `feat/contratos-base`, a partir da `main` (`ad8480b`). tsc, lint (0
erros) e build ok.

### Banco — migration 69 (aplicada em 2026-10-14)

- `contracts` com tipo, status, vínculos (cliente, processo, modelo,
  responsável), números e vigência. RLS por `apply_rbac_policies` com o
  recurso novo `contratos` (mesma matriz de `documentos`; `finance` só vê).
- `contract_status_changes`: o histórico, gravado por trigger
  (`security definer`), para valer em qualquer caminho que mude o status — a
  tela hoje, o Assistente na fase 3. Ninguém grava nele direto.
- `documents.contract_id` (`on delete cascade`, exclusivo como o anexo de
  lançamento) e `contract_file_role` (`minuta` · `assinado` · `anexo`, existe
  se e só se há contrato). RLS de `documents` e do bucket com um terceiro
  regime: pasta `contratos/` segue `contratos:view/update/delete`. Anexar é
  `contratos:update`, como no lançamento.
- Cliente obrigatório em honorários fica só no zod: com CHECK, excluir um
  cliente que tem contrato falharia (a FK é `set null`, como nas outras
  tabelas).

⚠️ **Ordem do deploy:** o `DOCUMENT_SELECT` agora embute `contract:contracts`.
Sem a migration aplicada, /documentos e todas as abas de documentos quebram
(relação inexistente). Em outra base, aplicar a 69 antes de subir o código.

**Aplicação (2026-10-14):** só a 69 estava pendente (`db push --linked
--dry-run`); aplicada sem erro e conferida com `pnpm db:verify`. Leitura com
a service role, sem gravar nada: os três selects do app (`CONTRACT_SELECT`,
histórico com `changer`, `DOCUMENT_SELECT` com o embed do contrato) respondem;
os 7 documentos existentes seguem lá, nenhum com `contract_id`; 12 linhas de
`contratos` em `role_permissions`, na matriz prevista. O trigger do histórico
e as policies novas só rodam de verdade com a primeira gravação pela tela.

### Telas

- **/contratos** (menu Gestão, entre Documentos e Financeiro), abas
  Contratos e Modelos.
  - Indicadores clicáveis que filtram a lista: **Em vigor** (vigente +
    vencendo — o número não pode esconder o que está para vencer),
    Aguardando assinatura, Vencendo, Vencidos.
  - Busca por nome, cliente ou CNJ; filtros de situação e tipo. No celular
    as linhas viram cartões empilhados.
- **Novo contrato:** diálogo com tipo, nome, status inicial (quem registra um
  contrato já assinado escolhe "Vigente" e a data da assinatura), vínculos,
  responsável (padrão: quem cadastra), valores, vigência e arquivos com papel.
  Depois de salvar, abre o detalhe.
- **/contratos/[id]:** cabeçalho com a situação, faixa (valor, parcelas,
  vigência, responsável), arquivos agrupados por papel, detalhes e histórico.
  - **Status:** o próximo passo do ciclo é o botão principal (Enviar para
    assinatura → Marcar como assinado → Encerrar); o menu ao lado leva a
    qualquer outro. "Marcar como assinado" pede a data e, opcionalmente, o
    PDF assinado — é onde a fase 4 vai pôr a prévia do Financeiro. Encerrar e
    rescindir pedem confirmação.
  - **Editar** não mexe no status: ele só muda pelos botões, que gravam o
    histórico.
  - **Gerar minuta:** a tela de geração de sempre, com os modelos de contrato,
    e "Baixar e salvar no contrato" (vira `minuta` e guarda o modelo usado em
    `template_id`).
- **Modelos:** `TemplatesContent` ganhou `scope`. Em Contratos só aparecem os
  de categoria `contrato` (sem seletor de categoria ao cadastrar); em
  Documentos, os demais. O "Gerar" de Contratos → Modelos só baixa: guardar a
  minuta fora de um contrato criaria um contrato sem registro.
- O "Gerar documento" do cliente e do processo deixou de oferecer modelos de
  contrato (decisão "modelos só em Contratos").
- **/documentos** lista os arquivos de contrato com cliente e processo
  herdados do contrato e a marca "Contrato: …". Na aba Documentos da ficha
  do cliente e do processo eles **não** aparecem (o vínculo é exclusivo): a
  aba Contratos dessas telas entra na fase 2.

### Fora do plano, mas necessário

- `document_templates` continua governado por `documentos:*` — a matriz é a
  mesma, e separar exigiria RLS por categoria também no bucket (`modelos/`).
- Assistente: só textos e links. O link de `cadastrar_modelo` leva a
  Contratos → Modelos quando a categoria é contrato, e o prompt diz que minuta
  de contrato se gera pelo contrato.

### Verificação

Telas conferidas numa página temporária sob `/acompanhar` (já apagada), com
os componentes reais, sessão falsa e cache pré-carregado: lista e filtros,
validações (nome, cliente em honorários, número inválido, fim antes do
início), o payload do insert, do update (sem `status`) e da assinatura,
"Gerar minuta" só com modelos de contrato, aba Modelos e celular (375 px, sem
rolagem lateral). Telas logadas ainda não foram usadas contra o banco real.

## Como ficou a fase 2

Branch `feat/contratos-partes`, a partir da fase 1 (`672bdbc`). tsc, lint (0
erros) e build ok.

### Decisões tomadas antes de começar (2026-10-14)

- **Montar no contrato**, não num assistente em passos: "Novo contrato" cria o
  rascunho (agora com o modelo) e abre a página dele, que mostra os passos no
  topo — Modelo, Partes, Valores e vigência, Minuta. O motivo técnico: a IA só
  lê arquivo que está no Storage (a Vercel recusa corpo acima de 4,5 MB), então
  o contrato precisa existir antes da leitura; e fechar no meio não perde nada.
- **Parte lida de documento pode virar cliente na tela**, conferindo antes:
  "Cadastrar como cliente" abre o formulário de cliente já preenchido.
- **Teste contra o Gemini real: até 3 pedidos com documentos fictícios** — ver
  "Verificação": não foi possível.

### Banco — migration 70 (aplicada em 2026-10-15)

Só a 70 estava pendente (`db push --linked --dry-run`); aplicada sem erro e
conferida com `pnpm db:verify`. Leitura com a service role, sem gravar nada:
`contract_parties`, `contracts.template_values`, `documents.contract_party_id` e
`source_kind` e `document_templates.parties` respondem aos selects do app; o
modelo que já existia ficou com `parties = []`; os 7 documentos seguem lá.


- `contract_parties`: uma cópia da qualificação por parte, com o papel, a
  origem (`cliente`, `escritorio`, `documentos`, `manual`), o `client_id`
  quando há, e `field_sources` (dado → documento). RLS: ver com
  `contratos:view`; criar, editar e apagar com `contratos:update`.
- `contracts.template_values`: o que foi preenchido na última minuta.
- `documents.contract_party_id` (`set null`) e `source_kind`.
- `document_templates.parties`: os papéis do modelo.

### Motor de modelos

- Grupo `contrato` no catálogo (`{contrato_valor}`… `{contrato_reajuste}`),
  lido do registro por `resolveTemplateFields(… contractId)`. Fora de um
  contrato, sai em branco com aviso. `{contrato_prazo}` diz "12 meses" quando
  início e fim fecham meses inteiros, senão em dias.
- Campos de parte (`templates/partyFields.ts`): papel declarado + sufixo do
  cliente. `classifyTemplateFields(fields, settings, roles)` separa `party`;
  sem os papéis, tudo segue como antes. Duas partes no mesmo papel entram
  juntas (nomes com "e"; qualificações separadas por ponto e vírgula).
- `buildQualificacao` virou `buildPersonQualificacao` por baixo: serve ao
  cliente (mesmo texto de antes) e à parte.
- Editor de papéis no cadastro do modelo (só em Contratos): sugere os prefixos
  achados no arquivo; papel que o arquivo não usa não é salvo.

### Página do contrato

- **Partes:** adicionar do cadastro, o escritório, lendo documentos ou
  digitando; editar (editar um dado tira dele a marca "lido de…"), tirar,
  "Atualizar do cadastro" e "Cadastrar como cliente". Aviso quando um papel do
  modelo está sem parte.
- **Arquivos** mostram o tipo lido e de quem é ("CNH · Maria Silva").
- **Gerar minuta / Gerar nova versão:** a tela de geração preenche os campos
  das partes e do contrato, reabre com o que foi preenchido da última vez e,
  ao salvar no contrato, guarda isso em `template_values`. Valor sugerido pelo
  leitor aparece "lido de … — confira" até a minuta ser gerada.

### Leitor de documentos

- `POST /api/contratos/ler-documentos` (`contratos:update`): até 10 documentos
  do próprio contrato, 50 MB; 1 pedido ao provedor com saída estruturada
  (`reading/readerSchema.ts` — tudo texto, "" quando não consta).
- A junção é código (`reading/mergeReading.ts`): pessoa por CPF/CNPJ e, sem
  ele, pelo nome sem acento; valores diferentes viram opções; cliente já
  cadastrado é apontado; PJ com CNPJ é completada pela BrasilAPI
  (`lib/brasilapi/cnpj.ts`, que a rota `/api/cnpj` passou a usar).
- Tela "Ler documentos": escolhe anexos do contrato ainda não lidos e/ou sobe
  novos, lê, e mostra para conferir — papel de cada pessoa, cadastro existente
  ("usar o cadastro e completar o que faltar" ou "só o lido"), conflitos,
  documentos a guardar e valores para os campos do modelo. Só "Adicionar
  partes" grava.
- A leitura dos arquivos para a IA virou `ia/files/documentParts.ts`,
  compartilhada com o "Redigir com IA".
- Erro 402 do provedor (créditos esgotados) tem mensagem própria
  (`isProviderCreditError`).

### Importar contrato pronto

Botão em /contratos. Escolhe o tipo, o contrato (via assinada ou minuta) e,
se quiser, documentos das partes. Cria o rascunho, sobe, lê no modo
`importar` (partes do preâmbulo + valores, vigência e data da assinatura) e
mostra para conferir os dados do contrato e as partes. Cancelar apaga o
rascunho e os arquivos; por isso o diálogo não fecha por Esc nem pelo X.

### Cliente e processo

Aba **Contratos** nas duas páginas (para quem tem `contratos:view`), com
"Novo contrato" já ligado. No cliente, entram também os contratos em que ele
é **parte**.

### Verificação

- **IA real: não testada.** O pedido de teste (documentos fictícios) voltou
  402 — "prepayment credits are depleted": a conta do Gemini passou ao
  pré-pago e está sem saldo. Nenhum pedido foi gasto. Enquanto isso, o /ia
  também deve falhar.
- **Junção:** rodada no Node com uma resposta simulada para CNH, conta de luz,
  certidão de casamento e matrícula fictícias — a mesma pessoa saiu uma só
  (com e sem acento, CPF com e sem máscara), "casada" virou `casado` com a
  qualificação no feminino, campo desconhecido foi ignorado. A resposta
  simulada passa no schema real.
- **Telas** numa página temporária sob `/acompanhar` (apagada): passos, partes,
  arquivos, editor de papéis, geração com campos de parte, aba do cliente,
  importação (Esc e X bloqueados) e a conferência da leitura — com o payload
  gravado conferido (parte com `field_sources`, CNH ligada como `cnh`,
  documento desmarcado apagado).

## Em aberto (decidir na fase)

- **Valor do êxito no lançamento:** R$ 0 com a condição escrita ou um valor
  estimado (por exemplo, o percentual sobre o valor da causa). Estimativa
  infla o "A receber"; zero o esconde.
- **Testemunhas da equipe:** o contrato pede CPF da testemunha. Conferir se o
  perfil tem esse dado antes de oferecer "membro do escritório" como fonte.
- **`pg_cron`:** confirmar que está disponível no projeto antes da fase 4.
- **Numeração** dos contratos (ex.: 2026/001): só se o escritório usar.
- **Lista de tipos do leitor:** começa com a da seção acima e cresce com o
  uso.

## Fora de escopo

- Grupos fixos de objeto no catálogo (`{imovel_*}`, `{veiculo_*}`): só se os
  campos se repetirem entre modelos.
- Assinatura eletrônica (ZapSign, Clicksign, D4Sign): serviço pago. A v1
  aceita o PDF assinado por fora.
- Contrato no portal do cliente: o portal hoje não trata de contratos.
- Análise de risco de cláusulas pela IA: esbarra na regra de não dar parecer.
- Comparar versões da minuta.
