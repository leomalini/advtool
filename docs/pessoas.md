# Pessoas

> **Status:** plano **aprovado em 2026-10-21**, com as recomendações dos dois
> pontos em aberto. **Fase 1** na branch `feat/pessoas-base`, criada da `main`
> em b14291f (PR #46) — migration 78 **ainda não aplicada**. Pelo último
> registro, a 77 (audiências) também não foi aplicada no remoto: o `db push`
> leva as duas juntas. **Fase 2** na branch `feat/pessoas-modulo`, empilhada
> na 1, e **fase 3** na `feat/pessoas-partes`, empilhada na 2 — as duas sem
> migration. Ver "Como ficou" de cada fase.

Pedido: um módulo **Pessoas**, com os mesmos campos de Clientes e **sem
pendências**. Todo cliente é uma pessoa; nem toda pessoa é cliente. Uma pessoa
pode **virar cliente**.

O problema que isso resolve: hoje o único cadastro de gente é `clients`. Quem
não é cliente — parte contrária, testemunha, fiador, locador, cônjuge anuente —
ou fica como texto solto (partes do processo, partes do contrato) ou é
cadastrado **como cliente**, e aí aparece na lista de Clientes, nas Pendências
e nos seletores de dono de processo e de lançamento. O "Vincular ou cadastrar"
das partes do processo faz exatamente isso com qualquer parte.

## Decisões

| Tema | Escolha |
|---|---|
| Modelo | **Um cadastro só.** A tabela `clients` passa a guardar todas as pessoas; ser cliente é um estado do registro (`client_since`) |
| Nome da tabela | **Continua `clients`.** Renomear para `people` mexe em ~40 pontos do código e exige migration e deploy no mesmo instante — e as 15 colunas `client_id` continuariam com o nome antigo de qualquer jeito |
| Campos | **Os mesmos**, no mesmo `ClienteForm`. Áreas jurídicas e responsável continuam lá, opcionais como já são |
| Conversão | **"Tornar cliente"**, um clique com confirmação: grava `client_since = now()`. Nada é copiado e nenhum vínculo muda — processos, partes, arquivos e notas que já apontam para a pessoa continuam apontando |
| Volta (cliente → pessoa) | **"Mover para Pessoas"**, só para quem não é dono de nada (processo ou caso, contrato, lançamento, link de acompanhamento ativo). Trava no trigger. Serve à limpeza das partes contrárias cadastradas como cliente |
| Pendências | Só para clientes. A pessoa não tem aba nem selo; ao virar cliente, as pendências dela aparecem na hora |
| Lista de Pessoas | **Todas**, clientes inclusive (com selo "Cliente"), e filtro Todas · Clientes · Só pessoas |
| Ficha | Uma por estado: pessoa que é cliente abre em `/clientes/[id]`. Cada rota redireciona para a outra quando o registro não é dela, então link antigo não quebra |
| Permissões | Reaproveita `clientes:*`. É a mesma tabela, e um recurso `pessoas` exigiria policy por linha. "Tornar cliente" exige `clientes:create` — o perfil `finance` tem `update` sem `create`, e converter é criar um cliente |
| Seletores de dono | Processo, caso, lançamento, contrato (campo cliente), portal, gerar documento e agenda listam **só clientes**, como hoje |
| Partes | Partes do processo e do contrato ligam a **qualquer pessoa**. É onde o módulo rende |

## Como está hoje

| Peça | Onde | O que importa |
|---|---|---|
| Cadastro | `clients` (migrations 03, 08, 30, 53, 59) | PF/PJ, qualificação, `tags`, `legal_areas`, `assigned_to`. CPF/CNPJ únicos pelas colunas geradas `cpf_digits`/`cnpj_digits` (59) |
| Filhas | `client_contacts` (08), `client_addresses` (54), `client_comments` (31) | `on delete cascade` — vêm junto na conversão, de graça |
| FKs para `clients` | 15 tabelas vivas | **Dono:** `crm_items`, `financial_entries`, `contracts`, `client_portal_links`, `client_portal_chat_messages`. **Referência:** `legal_process_parties` (29), `contract_parties` (70), `documents`, `events`, `tasks`, `document_process_searches`, `client_portal_access_log`. **Filhas:** as três acima |
| Pendências | `getClientsPendencies` (`clientes.service.ts`) | Lê **todos** os registros — badge da Sidebar, `/pendencias`, `PendenciesCard` do dashboard e a aba da ficha |
| Lista e seletores | `getClients` → `useClientes` → `ClienteCombobox` | O combobox está em 10 telas (processo, caso, contrato, parte de contrato, evento, lançamento, filtro do Financeiro, gerar documento, importar contrato) |
| Partes do processo | `ProcessoDetailPage` → `handleLinkParty`; `linkPartyToClient` | Procura pelo documento; não achando, **cadastra como cliente**. Vincular adota o cadastro como dono do processo se ele ainda não tiver um (`adoptClientOnProcess`) |
| Importação de processo | `resolvePartyClients` | Liga partes a cadastros pelo documento. Só liga — não adota dono |
| Partes do contrato | `contract_parties` (70), `AddPartyDialog`, `matchClients` (`reading/enrichReading.ts`) | Cópia da qualificação; `client_id` serve ao "Atualizar do cadastro". A leitura de documentos aponta "já é cliente" |
| Assistente | `tools/read/clients.ts`, `tools/actions.ts` | `buscar_clientes` lista a tabela inteira; `cadastrar_cliente` cria cliente |
| Portal | `POST /api/clientes/[id]/portal-link` | Gera link para qualquer registro da tabela |
| Atividades | `activities` | `entity_type = 'client'`; `type` é texto livre. Nada no app lê a tabela hoje |

### Por que uma tabela, e não `people` + `clients`

1. **"Todo cliente é uma pessoa"** vira literal: é o mesmo registro.
2. **A unicidade de CPF/CNPJ (migration 59) só vale dentro de uma tabela.** Com
   duas, o mesmo CPF poderia existir como pessoa e como cliente — exatamente a
   duplicata que a 59 foi escrita para impedir, com metade dos vínculos de cada
   lado.
3. **Converter é mudar um campo.** Com duas tabelas seria copiar o cadastro,
   contatos, endereços e notas, e remapear cada FK que apontava para a pessoa.
4. Um supertipo `people` com `clients` como extensão 1:1 quebraria os ~25
   embeds `client:clients(type, name, company_name, trade_name)` espalhados
   pelos serviços: nome e documento sairiam de `clients`.

## Modelo de dados — migration 78 `clients_people.sql`

```sql
-- Bloco único e condicional: o backfill só pode rodar na criação da coluna.
-- Numa segunda execução, já com pessoas cadastradas, `where client_since is
-- null` transformaria todas elas em clientes.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients'
      and column_name = 'client_since'
  ) then
    alter table public.clients add column client_since timestamptz;
    -- Todo registro de hoje é cliente; a data mais honesta é a do cadastro.
    update public.clients set client_since = created_at;
  end if;
end $$;

alter table public.clients alter column client_since set default now();

alter table public.clients
  add column if not exists is_client boolean
    generated always as (client_since is not null) stored;
```

- **`client_since`** responde "desde quando" (serve a um futuro "clientes novos
  no mês"). **`is_client`** é o que os leitores filtram (`.eq('is_client',
  true)`): explícito, e gerado, então não diverge.
- **Default `now()` é a peça central.** Todo caminho que hoje insere em
  `clients` — formulário, "Vincular ou cadastrar", Assistente, leitura de
  contratos — continua criando **cliente** sem mudar uma linha. Quem quer
  pessoa passa `client_since: null` de propósito, por `createPersonRecord`. O
  comportamento novo entra ponto a ponto, e esquecer dá um erro visível (a
  pessoa aparece em Clientes), não um silencioso.
- Sem índice: a tabela tem centenas de linhas e o filtro é booleano.

**Trigger `guard_client_since`** (before update em `clients`):

- `null → data` sem `can('clientes', 'create')` → recusa (`42501`). A RLS de
  update é `clientes:update` e não distingue a coluna. Sem `auth.uid()`
  (service_role, SQL editor) não confere, como o trigger da 76.
- `data → null` → recusa (`PT409`) quando o registro é dono de algo: linha em
  `crm_items`, `contracts` ou `financial_entries`, ou link do portal **não
  revogado** (o revogado fica pelo histórico de acessos e não dá acesso a
  nada). A mensagem lista o que impede. A permissão é a da RLS
  (`clientes:update`): mover não apaga nada.

**Ordem de deploy:** a migration **antes** do código. O código novo filtra por
`is_client`, que precisa existir; o código atual ignora as colunas novas, e o
default mantém todo insert como cliente.

## Telas

### `/pessoas` — lista

- Mesmo layout de `/clientes`: `ClientesContent` ganha `scope: 'clients' |
  'people'` em vez de ser duplicado. Busca, áreas e etiquetas valem igual.
- Filtro **Todas · Clientes · Só pessoas** e selo "Cliente" na linha.
- **Nova pessoa** abre o `ClienteForm` com título e toast de pessoa.
- Menu da linha: Abrir · Editar · **Tornar cliente** · Excluir. Linha de
  cliente abre `/clientes/[id]`.

### `/pessoas/[id]` — ficha

- Abas: **Cadastro · Notas · Arquivos**, e na fase 3 **Processos** e
  **Contratos** (onde a pessoa é parte). Sem Pendências, Portal, Financeiro,
  Casos e Agenda.
- Cabeçalho e `CadastroTab` saem do `ClienteDetailPage` (864 linhas) para
  componentes compartilhados; a ficha de pessoa compõe os mesmos pedaços.
- **Tornar cliente** no cabeçalho (só com `clientes:create`). A confirmação diz
  o que muda: "passa a aparecer em Clientes, nos seletores e nas Pendências;
  nada do cadastro muda". Depois, toast e navegação para `/clientes/[id]`.

### Clientes

- **Aviso de documento** (`DuplicateDocumentWarning`): no cadastro de cliente,
  CPF que já é de uma **pessoa** troca "Abrir o cadastro existente" por
  **Tornar cliente** — converte e abre a ficha, descartando o formulário. Hoje a
  constraint da 59 recusaria o salvamento, e este é o caminho de conversão
  mais comum. No cadastro de pessoa, CPF de cliente avisa "já é cliente".
- `/clientes/[id]` de quem não é cliente redireciona para `/pessoas/[id]`
  (no `page.tsx`, que já é server component — ler o guia de `redirect` em
  `node_modules/next/dist/docs/` antes).

### Navegação

- **Pessoas** em Gestão, logo abaixo de Clientes, recurso `clientes`, ícone
  `Contact`. Título `/pessoas` no mapa do `Header`.

## Integrações

### Partes do processo (fase 3)

- "Vincular ou cadastrar" já procura na tabela inteira — acha pessoa e cliente
  pelo documento. Não achando, o formulário abre com o interruptor **"Cliente do
  escritório"**: ligado quando o processo ainda não tem cliente (o caso que o
  `adoptClientOnProcess` atende hoje), desligado quando já tem — aí a parte
  quase sempre é a outra.
- `adoptClientOnProcess` só adota quem `is_client`. Ligar a parte contrária
  não pode torná-la dona do processo.
- O cartão da parte diz "Pessoa cadastrada" ou "Cliente" e linka a ficha certa.
- A importação não muda e passa a render: a parte contrária cadastrada uma vez
  é ligada sozinha em todo processo importado depois. A aba **Processos** da
  ficha de pessoa lista esses vínculos (polo e papel).

### Partes do contrato (fase 3)

- `AddPartyDialog`, origem "Do cadastro": o combobox lista **pessoas**
  (`scope="people"`). O rótulo "Cliente" vira "Cadastro"; o valor `'cliente'`
  de `contract_parties.source` fica, sem migration.
- `matchClients` devolve também `is_client`; a leitura diz "Cliente" ou "Pessoa
  cadastrada". Conferir na fase 3 o que a tela de leitura oferece para quem não
  tem cadastro — fiador e testemunha deveriam nascer pessoa.
- A aba **Contratos** da ficha de pessoa lista os contratos em que ela é parte.

### Leitores que passam a filtrar `is_client` (fase 1)

| Leitor | Por quê |
|---|---|
| `getClients` (lista e todos os seletores) | Seletor de dono não pode oferecer parte contrária |
| `getClientsPendencies` | O pedido: pessoa não tem pendência |
| `buscar_clientes` (Assistente) | Senão o Assistente chama a parte contrária de cliente |
| `POST /api/clientes/[id]/portal-link` | Só cliente tem acompanhamento — recusa com 409 |
| `adoptClientOnProcess` | Ver acima |

Os embeds `client:clients(...)` **não** filtram: mostram o registro ligado,
seja ele quem for. `findClientByDocument`, `findClientsByDocuments` e
`matchClients` também não — procurar em todo mundo é o que evita a duplicata;
eles passam a devolver `is_client` para a tela decidir o que oferecer.

### React Query

As chaves de pessoas ficam sob a raiz de `clientKeys` (`['clients']`), para
que a conversão invalide as duas listas e os seletores de uma vez. As
pendências **não** estão sob essa raiz (`['client-pendencies']`): a conversão
invalida as duas chaves.

## Fases

Branches empilhadas, como em Audiências.

**Fase 1 — Fundação** (`feat/pessoas-base`). Nada muda na tela.

- Migration 78 com o trigger.
- `client_since`/`is_client` nos tipos; `createPersonRecord` e
  `convertToClient` no serviço (`convertToClient` com `.is('client_since',
  null)`, para não reescrever a data de quem já é cliente).
- Os cinco leitores da tabela acima.
- Pronto quando: `tsc`, lint e build limpos; com a migration aplicada,
  `/clientes` e `/pendencias` mostram as mesmas contagens de antes.

### Como ficou — fase 1

- **Migration 78** `20260101000078_clients_people.sql`: `client_since` com
  backfill dentro de um `do $$` que só roda se a coluna não existir (a
  migration pode rodar de novo sem transformar pessoas em clientes), default
  `now()`, `is_client` gerada e o trigger `guard_client_since` (`before update
  of client_since`, `security definer`).
- **Tipos:** `client_since` e `is_client` em `ClientBase`; `is_client` em
  `ClientDocumentMatch`; `isClient` em `ReadPerson.clientMatch`; atividades
  `person_created` e `person_converted`.
- **Serviço** (`clientes.service.ts`): `createClientRecord` e o novo
  `createPersonRecord` passam por um `insertRecord` comum — só o segundo manda
  `client_since: null`. `convertToClient(id, userId)` grava a data com
  `.is('client_since', null)`; sem linha alterada, confere se já era cliente
  (devolve calado) ou se não existe (erro). A mensagem de documento duplicado
  diz "cadastro", não "cliente". Ainda sem hook nem tela — fase 2.
- **Leitores que filtram `is_client`:** `getClients`, `getClientsPendencies`,
  `buscar_clientes`; a rota do portal recusa com 409; `adoptClientOnProcess`
  consulta o cadastro depois de achar o item sem dono, e não adota pessoa.
- **Buscas por documento** devolvem `is_client` e continuam procurando em
  todos.
- **Achado ao implementar:** a importação de contrato
  (`ImportContractDialog`) usava o primeiro cadastro casado pelo documento
  como **cliente do contrato** — com pessoas, seria o fiador. Agora só um
  cadastro com `isClient`. Na mesma linha, a revisão da leitura diz "Já é
  cliente" ou "Já cadastrado", e `ler_documentos` do Assistente devolve
  `e_cliente`; `detalhar_cliente` devolve `situacao`.
- Nada muda na tela enquanto não houver pessoa cadastrada: todo registro de
  hoje vira cliente no backfill.
- **Aplicar a migration antes do deploy** — o código filtra por `is_client`.

**Fase 2 — Módulo** (`feat/pessoas-modulo`).

- `/pessoas`, `/pessoas/[id]` (Cadastro, Notas, Arquivos), Sidebar e Header.
- Tornar cliente na ficha, na lista e no aviso de documento; redirecionamentos.
- "Mover para Pessoas", se o ponto 1 for aprovado.
- Tipos de atividade `person_created` e `person_converted` (texto livre, sem
  migration).
- Pronto quando: pessoa criada não aparece em Clientes, nos seletores nem nas
  Pendências; convertida, aparece nos três, e a ficha muda de rota.

### Como ficou — fase 2

Branch `feat/pessoas-modulo`, empilhada na `feat/pessoas-base`. Sem migration.

- **Lista:** `ClientesContent` ganhou `scope: 'clients' | 'people'`, servido por
  `useCadastroList(scope)` — uma chave por tela (`['clients']` e
  `['clients', 'people']`), sem carregar a lista que não aparece. Em Pessoas:
  filtro Todas · Clientes · Só pessoas, selo "Cliente" (token `info`, o mesmo do
  "Já é cliente" da leitura de contratos), "Nova Pessoa" e o atalho "Tornar
  cliente" na linha. Linha de cliente abre `/clientes/[id]`.
- **Ficha de pessoa** (`PessoaDetailPage`): Cadastro · Notas · Arquivos.
  "Notas" é só a thread de `client_comments` — tarefas ficaram de fora com a
  agenda, por serem de cliente. Cabeçalho e aba Cadastro saíram do
  `ClienteDetailPage` para `CadastroHeader`, `CadastroTab` e `CopyableValue`,
  usados pelas duas fichas. "Cliente desde" passou a ler `client_since` (antes
  era `created_at`, que para convertido é a data errada); pessoa mostra
  "Cadastrado em".
- **Rotas:** `redirectToRecordKind` (`src/lib/cadastro/recordKindRoute.ts`) no
  `page.tsx` das duas fichas, depois do `requirePermission`: cliente em
  `/pessoas/[id]` vai para `/clientes/[id]` e vice-versa, no servidor. Erro de
  leitura ou registro invisível seguem para a página.
- **Tornar cliente** (`ConvertToClientDialog`): na ficha (navega para a de
  cliente), na linha da lista (fica na lista) e no aviso de documento do
  formulário de cliente (navega e descarta o formulário). Sem
  `clientes:create`, o botão não aparece; o trigger recusa de qualquer jeito.
- **Mover para Pessoas** (`MoveToPeopleDialog`): no menu "⋯" da ficha de
  cliente, com `clientes:update`. **Mudou em relação ao plano:** o botão não
  fica desabilitado de antemão. A regra mora só no trigger, e a recusa dele —
  que já lista o que impede — aparece dentro do diálogo. Conferir antes seria
  uma segunda cópia da regra, e sob a RLS de quem pede ainda erraria (um
  lançamento invisível ao perfil não entraria na conta).
- **Formulário:** `ClienteForm` ganhou `kind` — título, botão de salvar e o
  rótulo "Tipo de Pessoa". `useUpdateCliente(id, kind)` e
  `useDeleteCliente(kind)` escolhem o texto do toast; `useCreatePessoa`,
  `useConvertToClient` e `useConvertToPerson` são novos. A conversão invalida
  `['clients']` e `['client-pendencies']`.
- **Aviso de documento:** no formulário de cliente, CPF de pessoa oferece
  "Tornar cliente"; no de pessoa, CPF de cliente avisa "é do cliente…". O link
  "Abrir o cadastro existente" vai para a ficha do estado do registro.
- Atividade nova `client_moved_to_person`. Sidebar e paleta do Header ganharam
  **Pessoas** (ícone `Contact`, recurso `clientes`).
- **Conferido** numa página temporária sob `/acompanhar` (componentes reais,
  Supabase simulado em memória, apagada antes do commit): lista e filtros;
  conversão pela linha (grava só `client_since`, a lista recarrega); ficha de
  pessoa; recusa do "Mover para Pessoas" para cliente dono (mensagem no
  diálogo, nada gravado) e sucesso para cliente sem vínculo (`client_since:
  null` e navegação); avisos de documento nos dois formulários; "Nova Pessoa"
  grava `client_since: null`. **Não conferido contra o banco real** — a
  migration 78 não está aplicada.
- **Observado:** o formulário exige CPF (ou CNPJ), herdado do cadastro de
  cliente. Para testemunha e parte contrária, que muitas vezes chegam sem
  documento, isso pode atrapalhar — resolvido na fase 3 (documento opcional
  para pessoa).

**Fase 3 — Partes** (`feat/pessoas-partes`).

- Processo: interruptor no cadastro pela parte, cartão da parte, aba Processos.
- Contrato: combobox de pessoas, `matchClients`, aba Contratos.
- Pronto quando: ligar a parte contrária cria pessoa e o processo não ganha
  dono; o mesmo CPF num processo importado depois chega já ligado.

### Como ficou — fase 3

Branch `feat/pessoas-partes`, empilhada na `feat/pessoas-modulo`. Sem migration.

- **Documento opcional para pessoa** (decidido aqui, como a fase 2 deixou
  anotado): `createIndividualPersonSchema`/`createCompanyPersonSchema` aceitam
  CPF/CNPJ vazio — testemunha e parte contrária chegam muitas vezes sem
  documento, e o cadastro pela parte travaria nelas. Para cliente continua
  obrigatório. O formulário troca o schema pelo `kind` (o RHF relê as opções a
  cada render) e tira o asterisco do campo. Pessoa sem documento que vira
  cliente ganha a pendência "CPF"/"CNPJ" na hora.
- **"Cadastrar como"** no `ClienteForm` (`onKindChange`): "Cliente do
  escritório / Só pessoa", só nos cadastros feitos a partir de uma parte.
- **Partes do processo:**
  - "Vincular ou cadastrar" abre o formulário já escolhido — processo **sem**
    cliente: cliente (o caso que o `adoptClientOnProcess` atende); **com**
    cliente: pessoa.
  - `adoptClientOnProcess` devolve `adopted | kept_owner | not_client`, e o
    `PartyLinkResult` ganhou `linkedToPerson`: ligar pessoa a processo sem
    cliente avisa "Parte vinculada a uma pessoa cadastrada. O processo continua
    sem cliente." (antes diria "o cliente continua o mesmo", que era falso).
  - O cartão da parte diz "Cliente", "Pessoa cadastrada" ou "Cadastro" (sem
    vínculo) e leva à ficha certa. O embed das partes traz `is_client`.
  - A importação não mudou: `resolvePartyClients` já procurava em toda a
    tabela, e a parte contrária cadastrada uma vez chega ligada.
- **Aba Processos da ficha de pessoa** (`PartyProcessesTab`,
  `getProcessesByPartyPerson`): uma linha por participação — CNJ, papel,
  tribunal, cliente do processo e polo. Chave sob `legalProcessKeys`, então o
  vínculo de parte já a invalida.
- **Partes do contrato:**
  - "Adicionar parte → Do cadastro de pessoas": `ClienteCombobox` ganhou
    `scope="people"` (lista todos, marca quem é cliente, "Cadastrar nova
    pessoa"). O valor `'cliente'` de `contract_parties.source` ficou — o rótulo
    já era "Cadastro".
  - "Cadastrar" na parte sem cadastro (antes "Cadastrar como cliente") nasce
    **pessoa**, com a escolha no formulário — fiador, locador e testemunha não
    são clientes.
  - O link da parte diz "cliente cadastrado" ou "pessoa cadastrada";
    `getContractParties` embute `client:clients(is_client)`.
  - A tela de leitura de documentos **não cadastra ninguém** — só usa o
    cadastro que acha (fase 1 já diz "Já é cliente"/"Já cadastrado"). Quem
    cadastra a partir da leitura é o Assistente (`cadastrar_cliente`), que fica
    para a etapa do Assistente.
- **Aba Contratos da ficha de pessoa:** a mesma `EntityContractsTab` — ela já
  incluía os contratos em que o cadastro é parte —, com `allowCreate={false}`:
  um contrato novo nasceria com a pessoa como cliente.
- **Achado ao implementar:** `getProcessClientId` (geração de documento a
  partir do processo), sem dono no processo, usava a única parte vinculada
  como `{cliente_*}`. Com pessoas, seria a parte contrária. Agora só conta
  parte ligada a cliente (`clients!inner(is_client)`).
- **Conferido** na página temporária sob `/acompanhar` (banco simulado em
  memória, apagada antes do commit): cartões das três partes; cadastro pela
  parte num processo com cliente (abre como pessoa, grava `client_since:
  null`, liga a parte, não mexe no card) e sem cliente (abre como cliente;
  como pessoa aceita CPF vazio e avisa que o processo segue sem cliente; como
  cliente exige CPF e adota o processo); abas Processos e Contratos da ficha
  de pessoa; partes do contrato (rótulos, "Cadastrar" do fiador como pessoa
  sem CPF, "Do cadastro de pessoas" listando todos). **Não conferido contra o
  banco real** — a migration 78 não está aplicada.

Verificação como nos módulos anteriores: sem testes automatizados; `tsc`,
lint, build e conferência no navegador.

## Pontos que estavam em aberto

Resolvidos em 2026-10-21, com as recomendações:

1. **Cliente → pessoa ("Mover para Pessoas") — permitido, com trava.** Como o
   "Vincular ou cadastrar" cadastra qualquer parte como cliente, a base
   provavelmente já tem parte contrária em Clientes e nas Pendências. Sem a
   volta, a limpeza seria excluir e recadastrar, e excluir solta os vínculos
   (`on delete set null`). Na tela (fase 2), o botão fica desabilitado com o
   motivo quando há vínculo de dono.
2. **A lista de Pessoas mostra todas**, com selo e filtro — é a forma de
   "todo cliente é uma pessoa" aparecer na tela.

## Fora de escopo

- Renomear `clients` → `people`. Limpeza separada, se um dia valer.
- **Negociação com pessoa**: card de `wf-negociacao` ligado a uma pessoa, que
  vira cliente ao fechar. É o próximo passo natural da conversão.
- Testemunhas das audiências como pessoas (`docs/audiencias.md` já lista
  "Testemunhas como cadastro próprio") — Pessoas é a base para isso.
- Assistente: `buscar_pessoas`, `cadastrar_pessoa`, `tornar_cliente`. Depende
  do crédito do Gemini.
- Modelos de documento para pessoa (notificação à parte contrária) e agenda ou
  tarefas ligadas a pessoa.
