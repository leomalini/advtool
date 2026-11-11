# Importação de processos pela OAB — plano

> Aprovado em 2026-11-10. **Fase 1 implementada** na branch `feat/importacao-oab`
> e verificada por simulação, sem chamada paga e sem escrita no banco. Fases 2 e 3
> pendentes.

## Objetivo

Um script de terminal que busca na BuscaProcessos todos os processos das OABs
dos advogados do escritório e os cadastra na base, do mesmo jeito que o
cadastro manual faria: processo, card no quadro de Processos, partes, cliente
automático, movimentações e publicações.

## O que já existe

- `searchProcessosByOab()` em `src/lib/buscaprocessos/client.ts` chama
  `GET /v1/advogados/processos` e nunca foi usada.
- `syncProcessoFromBp()` (`src/lib/buscaprocessos/sync.ts`) recebe o client
  Supabase por parâmetro e grava capa, partes, movimentações e publicações.
- `linkOfficeClientsOnProcess()` (`src/lib/clientes/officeClients.ts`) cadastra
  o cliente pelo CPF/CNPJ da parte representada pela OAB do escritório.
- `createLegalProcess()` usa o client do browser e não serve para o script: o
  script precisa de um equivalente no servidor (os mesmos inserts).

## O que a documentação da API diz da busca por OAB

Lida em 2026-11-10 (docs.buscaprocessos.app.br, `openapi.json` e "Créditos e
preços"). Parte do schema de resposta não foi lida; a fase 2 confere contra um
payload real.

- **Cobrança:** cada chamada com `page=1` é uma consulta nova e pode cobrar; as
  páginas seguintes saem sem cobrança. O valor não está publicado; vem em
  `meta.creditsCharged`.
- **Paginação:** por página, seguindo `data.links.next.href` até vir nulo.
  `limit` aceita 50 ou 100.
- **Cobertura:** "só avance depois que `data.cobertura.completa` for true". A
  resposta pode vir parcial (200 com o que já foi indexado) ou em 202
  (resultado em `GET /v1/requests/{requestId}`, que não cobra de novo).
- **Classificação:** filtro `status` = `RECENTE` ou `HISTORICO`. A doc avisa que
  isso não é o mesmo que ativo/arquivado confirmado pelo tribunal.
- **Itens:** resumo (`numeroCnj`, `poloAtivo`, `poloPassivo`, `classe`,
  `orgaoJulgador`, `statusProcessual`, `ativo`, `fontes[]`…), sem CPF/CNPJ das
  partes. Por isso cada processo precisa da capa.
- **Limite:** 2 requisições/s por chave, rajada de 10; em 429, respeitar
  `Retry-After`.

O tipo `BpOabSearchData` em `types.ts` está incompleto em relação à doc
(faltam `ativo`, `fontes`, `cobertura`, `pagination`, `links`). Corrigir pelo
payload real, não pela doc.

## Decisões

1. **De onde vêm as OABs:** dos perfis (`profiles.oab_number`/`oab_state`),
   lidas por `loadOfficeOabs()`. O segundo advogado será cadastrado como
   usuário, com OAB no perfil, **antes** da importação, para que o cliente
   automático reconheça a inscrição dele.
2. **Escopo:** importa só os `RECENTE`. Os `HISTORICO` ficam prontos para
   depois: `listar --status HISTORICO` e `importar --status HISTORICO`.
   *Mudou na implementação:* cada recorte é uma listagem própria, filtrada pela
   API. Assim, a classificação de cada processo não depende de adivinhar qual
   campo do item diz "recente". Por isso os históricos custam uma segunda
   página 1 por OAB. O `listar` dos recentes já mostra quantos históricos a API
   informa (`advogado.quantidadeHistoricos`), quando ela informa.
3. **Dados por processo:** capa + movimentações, **R$ 0,24 por processo**.
   Documentos públicos (R$ 0,25) ficam para o primeiro "Atualizar" do processo:
   `useSyncProcesso` já os busca quando o bloco não tem carimbo.
4. **Monitoramento:** não liga. Os importados ficam como "Não monitorado". Dá
   para ligar processo a processo na tela de detalhes.
5. **Publicações antigas:** as que a importação inserir entram com `read_at` e
   `handled_at` preenchidos (já tratadas) e ficam fora da triagem da IA. As que
   já existiam não são tocadas.
6. **Cliente automático:** mesma regra de hoje (só com CPF/CNPJ), mas **sem
   aviso no sino** durante a importação. O relatório do script lista quem foi
   criado ou convertido.

## Padrões assumidos (pode vetar)

- **Etapa:** `proc-1` (Cadastro), no workflow `wf-processos`.
- **Responsável** (`crm_items.assigned_to`) e `created_by`: o advogado cuja OAB
  trouxe o processo. Se o processo aparecer nas duas OABs, fica com o primeiro
  advogado da listagem.
- **Prazo** (`next_deadline`) e **área** (`legal_area`): vazios. A coluna aceita
  nulo; só o formulário exige o prazo.
- **Título do card:** classe processual da capa, ou a classe da listagem, ou o
  CNJ. É a mesma regra da importação em lote pela busca por documento
  (`useImportProcessosFromSearch`). No formulário o título é digitado.
- **CNJ:** gravado com máscara (`formatCnjNumber`), como o formulário grava.
- **Feed de atividades:** uma entrada `legal_process_created` por processo,
  como no cadastro manual.
- **Resumo do Claude:** não é gerado em lote. Sai pelo fluxo normal quando
  chegar movimentação nova.
- **Duplicados:** CNJ já cadastrado (comparado só pelos dígitos) é pulado.
- **Capa antes do insert:** o processo só é criado com a capa na mão. Se ela
  falhar ou ficar em 202 por mais de 2 minutos, nada é gravado e a próxima
  rodada tenta de novo. Se as partes ou o card falharem, o processo é apagado
  (as partes vão junto, por cascade).
- **Completar:** processo com capa carimbada e movimentações sem carimbo é
  importação interrompida, e a próxima rodada busca só as movimentações. Um
  processo cadastrado à mão sem consulta nenhuma não tem nenhum dos dois
  carimbos e não é tocado.
- **Partes:** as que têm CPF/CNPJ já cadastrado em Clientes/Pessoas são
  vinculadas na hora, menos as que o escritório representa. Essas ficam para o
  cliente automático, que só olha parte sem vínculo; se fossem vinculadas
  antes, a pessoa não viraria cliente e o processo ficaria sem cliente.

## Comandos

```bash
pnpm import:oab listar                      # lista os RECENTE e estima custo; não cadastra
pnpm import:oab importar --limite 1         # importa 1, para conferir na tela
pnpm import:oab importar                    # importa todos os RECENTE
pnpm import:oab listar --status HISTORICO   # depois, se quiser os históricos (cobra a página 1)
pnpm import:oab importar --status HISTORICO
pnpm import:oab importar --cnj 0001234-56.2024.8.08.0001,0007654-32.2023.8.08.0024
pnpm import:oab listar --oab ES:35520       # só uma das OABs
```

- **`listar`** lê as OABs dos perfis ativos (uma inscrição repetida conta uma
  vez) e consulta a API: uma cobrança por OAB, só na página 1. Grava
  `.import-oab/listagem-AAAA-MM-DD.json` e `.csv` e imprime, por OAB: quantos
  recentes, quantos históricos, quantos já estão na base e o custo estimado da
  importação.
- **`importar`** usa a última listagem do recorte, sem pagar a lista de novo.
  Filtra por `--oab`, `--cnj` e `--limite`, mostra quantos processos e quanto
  vai custar, e só segue depois de você digitar `SIM` (ou com `--sim`). Roda um
  processo por vez, com 1 s de pausa. Em 429 na capa, espera 20 s e tenta de
  novo, até 3 vezes. Em 401/403 (chave recusada ou sem crédito), para. Grava
  `.import-oab/importacao-<status>-<data-hora>.json` depois de cada processo,
  então um Ctrl+C não perde o que já foi feito.
- A listagem fica em `.import-oab/listagem-<status>-<data-hora>.json` e `.csv`
  (separador `;`, abre direto no Excel), e as páginas como vieram ficam em
  `bruto-<status>-<OAB>-<data-hora>.json`.
- `.import-oab/` entra no `.gitignore`: tem nomes de partes.

## Fases

### Fase 1 — código (sem chamada paga) ✅

| Arquivo | Mudança |
|---|---|
| `src/lib/buscaprocessos/oabListing.ts` (novo) | Percorre as páginas por `links.next`, trata 202 e cobertura parcial, soma `creditsCharged`. Nunca repete a página 1. |
| `src/lib/buscaprocessos/awaitPending.ts` (novo) | Espera o resultado de um 202 em `/v1/requests/{id}` (não cobra de novo), por até 2 minutos. |
| `src/lib/processos/importFromOab.ts` (novo) | Equivalente server-side de `createLegalProcess` (processo, partes, card, histórico da etapa, atividade com `metadata.origin = 'oab_import'`), depois `syncProcessoFromBp`, cliente automático sem aviso e vínculo das publicações órfãs. |
| `src/lib/buscaprocessos/client.ts` | Parâmetro `status` na busca por OAB. |
| `src/lib/buscaprocessos/types.ts` | `BpOabSearchData` completado pela documentação, ainda não conferido contra uma resposta real. |
| `src/lib/buscaprocessos/sync.ts`, `src/lib/publicacoes/ingest.ts` | Opção `markPublicationsHandled`: publicação nova entra com `read_at` e `handled_at`. |
| `src/lib/clientes/officeClients.ts` | Opção `notify` (padrão: avisa, como hoje) e `isActive` no advogado. |
| `src/features/ia/batch/arrival.ts` | `enqueueUntriagedPublications` ignora publicação com `handled_at` preenchido. |
| `scripts/import-oab-processes.ts` | O script. Roda com `tsx` (nova devDependency) e importa `@/lib` sem duplicar código. |
| `package.json`, `.gitignore` | Comando `import:oab` e a pasta `.import-oab/`. |

O núcleo fica em `src/lib`, não no script: uma tela de importação no app pode
reaproveitá-lo depois.

Verificação feita: `tsc`, `lint` (nenhum aviso novo) e `build`. Também uma
simulação com `fetch` interceptado. A BuscaProcessos respondeu dados falsos
(202 com nova espera, 2 páginas, CNJ repetido, cobertura parcial, capa 404). O
Supabase leu do banco real, mas nenhuma escrita saiu da máquina; as escritas
foram registradas e conferidas uma a uma. Cobertos: cadastro com cliente pelo
CPF, cadastro sem CPF, falha isolada, processo já existente pulado, desfazer
quando o card falha, `--cnj`, `--limite`, confirmação recusada e argumentos
inválidos. Não coberto: o caminho de completar (a base não tem processo nesse
estado) e o 429.

### Fase 2 — validação com a API real (precisa do seu OK, tem custo)

1. Chave válida da BuscaProcessos no `.env` local (a atual respondeu 401 até no
   saldo, que é gratuito).
2. `pnpm import:oab listar --oab ES:35520`. Cobra a página 1 (o valor aparece
   aqui). Conferir o `bruto-*.json` contra `BpOabSearchData`: onde vêm `links`,
   `cobertura` e `advogado`, e se `numeroCnj` vem com máscara. Conferir também
   se o `creditsCharged` sobrevive ao 202: a releitura em `/v1/requests` pode
   não repetir o `meta` da cobrança.
3. `importar --limite 1` e conferir na tela: processo, partes, cliente,
   movimentações e publicações já tratadas.

### Fase 3 — importação completa

Depois que o segundo advogado estiver cadastrado com OAB: `listar` (as duas
OABs), revisar o CSV e rodar `importar`.

## Pendências fora do código

- Cadastrar o segundo advogado como usuário, com OAB no perfil.
- O perfil "Leonardo" (inativo) tem a mesma OAB ES 35520 da Carla. Não atrapalha:
  a inscrição é deduplicada e o perfil ativo tem precedência
  (`loadOfficeOabs`).

## Fora do escopo

- Tela de importação no app.
- Monitoramento em lote.
- Documentos públicos e resumo por IA em lote.
