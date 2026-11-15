# Paginação das listagens

Status: decisões fechadas em 2026-11-13. Fase 1 (peças compartilhadas e
Movimentações) em `feat/paginacao-base`; fase 2 (Publicações) em
`feat/paginacao-publicacoes`; fase 3 (Contratos, Documentos, Financeiro) em
`feat/paginacao-fatiadas`; fase 4 (Clientes e Pessoas, migration 91) em
`feat/paginacao-clientes`; fase 5 (Processos, migration 92) em
`feat/paginacao-processos`. Migrations 91 e 92 a aplicar.

**Regra do projeto: toda listagem tem paginação.** Uma tela nova que mostra uma
lista usa o componente `Pagination` e o hook de parâmetros descritos abaixo.
Ficam de fora os formatos em que número de página não faz sentido: quadros
kanban (Tarefas, CRM), calendário (Agenda) e listas agrupadas por dia
(Audiências).

## Decisões

| # | Tema | Decisão |
|---|------|---------|
| 1 | Telas | Processos, Movimentações, Publicações, Clientes, Pessoas, Contratos, Documentos, Financeiro (lançamentos) |
| 2 | Onde paginar | **No servidor:** Processos, Clientes/Pessoas, Publicações e Movimentações (que já pagina). **No navegador** (a lista continua carregando inteira e só a exibição é fatiada): Contratos, Documentos e Financeiro, porque situação, selo de assinatura, totais e gráfico são calculados sobre a lista toda |
| 3 | Tamanho da página | Seletor 25 / 50 / 100. Padrão 50, lembrado por tela no navegador |
| 4 | URL | Página, tamanho (só quando ≠ 50), filtros e ordem. **A busca por texto fica fora**, como no Financeiro: ela pode ser o nome de um cliente, e URLs acabam em logs |
| 5 | Nomes na URL | Em português, como o Financeiro (`periodo`, `de`, `ate`…): `pagina` (começa em 1), `por_pagina`, mais os filtros de cada tela |
| 6 | Seleção em massa (Processos) | Mantém entre páginas. O checkbox do cabeçalho seleciona a página, e um aviso oferece "Selecionar todos os N do filtro" |

## Comportamento comum (critérios de aceite de toda tela)

- [ ] O rodapé tem, à esquerda, "51–100 de 213 processos" (mais "· 3 selecionados" onde há seleção); à direita, "Por página [50 ▾]" e `‹ 1 … 4 5 6 … 12 ›`.
- [ ] O rodapé aparece mesmo com uma página só (contagem e seletor), e os botões de página somem quando não há para onde ir.
- [ ] Mudar filtro, busca, ordem ou tamanho volta para a página 1. Uma página que passou do total (na URL, ou depois de excluir) é corrigida para a última.
- [ ] Ao trocar de página, a lista volta ao topo. Nas telas paginadas no servidor, a página anterior fica visível com opacidade reduzida até a nova chegar (`keepPreviousData`), sem piscar, e a próxima página é pré-carregada.
- [ ] Voltar do detalhe devolve a mesma página, tamanho, filtros e ordem. Um link colado abre a mesma visão.
- [ ] Os parâmetros que já existem continuam funcionando (`create`, `clientId`, `cnj` em Processos; todos os do Financeiro).
- [ ] A URL muda com `history.replaceState`: paginar não empilha histórico.
- [ ] Valor inválido na URL (`pagina=abc`, `por_pagina=7`) cai no padrão, sem erro.
- [ ] `tsc`, lint e build limpos; cada tela conferida no navegador.

## Peças compartilhadas (fase 1)

- `src/components/shared/Pagination.tsx`: contagem, seletor de tamanho e
  páginas com reticências. Reaproveita `pagesAround` de Movimentações.
- `src/hooks/useListPagination.ts`: lê `pagina`/`por_pagina` da URL ao montar,
  lembra o tamanho por tela no `localStorage` (com try/catch), volta para a
  página 1 quando a chave de filtros muda (ajuste durante o render, como
  Movimentações já fazia) e, com `clampToTotal(total)` chamado depois da
  consulta, corrige a página que passou do total.
- `src/hooks/useSearchParamsMirror.ts`: escreve na URL só as chaves que a tela
  controla, com `history.replaceState`, sem apagar as outras (`?create=1`).
  Também guarda a última query de cada listagem na sessão do navegador, e
  `useListHref('/publicacoes')` devolve o endereço da lista como a pessoa a
  deixou: é o que o link "voltar para a lista" de um detalhe usa. O voltar do
  navegador não basta, porque anterior/próxima no detalhe empilham histórico.
- Nas telas paginadas no servidor, o serviço trata o `PGRST103` (página além
  do fim) devolvendo a página vazia com o total certo, e o rodapé pré-carrega a
  página em que o cursor parou.
- `src/lib/pagination.ts`: tamanhos permitidos, padrão, `pageRange(page, size)`
  para o `.range()` e `slicePage(rows, page, size)` para as telas fatiadas no
  navegador.
- A regra "toda listagem tem paginação" entra em `docs/DESIGN-SYSTEM.md`.

## Por tela

### Movimentações (fase 1)
Já pagina no servidor, fixo em 50, com a página só em memória. Ganha o seletor
de tamanho, a página e o tamanho na URL, e os filtros que já tem na URL. O
`PAGE_SIZE` fixo sai do serviço.

### Publicações (fase 2), no servidor, sem migration
`getPublications` ganha `.range()` + `count: 'exact'`; a ordem já desempata
por `sequence_number` (a ser confirmado único por dia na hora; senão, desempate
por `id`). Filtros na URL: `nao_lidas` (o padrão é ligado, então a URL só marca
quando está desligado), `sem_processo`. A fila de anterior/próxima do detalhe
(`getPublicationQueue`) não muda.

### Contratos, Documentos, Financeiro (fase 3), fatiados no navegador
A carga e o cálculo continuam como estão. Só a lista exibida passa por
`slicePage`. Cartões, totais e gráfico continuam somando o filtro inteiro, não a
página. No Financeiro, `pagina`/`por_pagina` são mesclados (`mergeSearchParams`)
na query que o próprio `serializeFinancialUrl` já escreve inteira — um segundo
espelho brigaria com ele. Em Contratos (`situacao`, `tipo`) e Documentos
(`categoria`, `formato`, `vinculo`, `origem`, `assinatura`, `cliente`,
`processo`, `enviado_por`, `de`, `ate`), os filtros saem do `useState` para a
URL; os validadores comuns ficam em `src/lib/urlParams.ts`. O detalhe do
contrato volta para a lista por `useListHref`.

Nessas telas a lista rola junto com a página, então a troca de página só
traz o começo da lista de volta quando ele saiu da vista por cima — quem troca
de página com a lista inteira à vista não perde os cartões do topo num salto.

### Clientes e Pessoas (fase 4), no servidor, migration 91
Uma tela só (`ClientesContent` com `scope`). Em vez da view prevista, uma
função `search_clients(p_search) returns setof clients` (`security invoker`):
a busca olha os contatos, e o PostgREST não faz OR entre a tabela e um
recurso embutido; uma função que devolve o tipo da tabela continua aceitando
os embeds (`contacts`, `addresses`), então a linha e o modal de edição
recebem o mesmo cadastro de antes. A busca cobre nome, razão social, nome
fantasia, e-mail, telefone, documento (como gravado e só com dígitos) e o
valor de qualquer contato, com `strpos` (sem curinga). Tipo, área, ordem
(`created_at`, desempate por `id`) e página são encadeados sobre ela.
Filtros na URL: `area`, `tipo` (só em Pessoas). O selo de pendência continua
vindo de `useClientesPendencies`. `useCadastroList` (combobox) não muda. Os
detalhes de cliente e de pessoa voltam para a lista por `useListHref`.

### Processos (fase 5), no servidor, migration 92
View `legal_process_list` (`security_invoker = true`) com uma linha por
processo e o card mestre (wf-processos; sem ele, o mais antigo, igual a
`pickMasterCrmItem`) achatado: etapa, área, responsável, prazo, atualização,
cliente e nome do responsável. A busca é a função
`search_legal_processes(p_search)`, que devolve linhas da view (mesmos
campos que `filterLegalProcesses` olhava, mais o CNJ só com dígitos), e o
resto é encadeado sobre ela: área, responsável, etapa, faixa de prazo
(`next_deadline` é date, inclusivo), monitoramento (`monitoring_frequency`
nulo = pela OAB), ordem e página. Ordenando por Prazo ou Atual., o processo
sem o dado (ou sem card) vai para o fim nas duas direções; sem ordem
escolhida, o atualizado mais recentemente primeiro. Desempate por `id`.

Filtros na URL: `area`, `responsavel`, `etapa`, `prazo_de`, `prazo_ate`,
`monitoramento`, `ordem` (`prazo`, `-prazo`, `atualizacao`, `-atualizacao`).
`create`, `clientId` e `cnj` continuam funcionando, e abrir/fechar o
formulário não apaga mais os filtros.

Seleção: o cabeçalho marca ou desmarca a página; o marcado em outras
páginas fica. Com a página inteira marcada aparece "Selecionar todos os N
processos do filtro", que busca os pares `crm_item_id`/`id` em lotes de 1000.
Um filtro ou ordem novos remontam a tabela e a seleção recomeça — nenhuma
ação em massa cai em processo fora da tela. `useLegalProcesses()` (agenda,
contratos, financeiro, webhooks, combobox) não muda.

Nas duas views, os nomes exatos das colunas saem de uma leitura das
migrations na hora de escrever o SQL, não deste documento.

## Entrega

Branch `release/paginacao`, criada a partir da `main` com `--no-track`. Cada
fase é uma branch empilhada com seu PR para a release, e só a release vai para
a `main` (um deploy). As migrations (fases 4 e 5) pegam os próximos números
livres; o `db push` é rodado pelo usuário antes de testar a fase.
