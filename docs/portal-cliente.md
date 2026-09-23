# Portal do cliente — link de acompanhamento

O cliente abre um link e vê os próprios processos. Sem cadastro, sem senha,
sem módulos. Uma rota, somente leitura:

```
/acompanhar/<token>
```

## O que é, e o que deliberadamente não é

| É | Não é |
|---|---|
| Uma página, alimentada por Route Handlers | Uma plataforma com login e navegação |
| Somente leitura | Canal de mensagens, upload ou assinatura |
| Token por **cliente** | Token por processo |
| Processos + andamento publicado | Documentos, financeiro, audiências, partes |
| Chat com IA sobre o que a página mostra | Canal com o escritório |

Processo novo do mesmo cliente entra sozinho no link que ele já tem — não há
nada a reenviar. É a razão de o token ser por cliente.

## As três camadas de acesso

1. **O token.** 32 bytes aleatórios em base64url. A validação do acesso consulta
   o SHA-256 (`client_portal_links.token_hash`) — o cliente entrando no portal
   nunca decifra nada. Um link ativo por cliente, garantido por índice único
   parcial.

   O token também fica guardado **cifrado** (`token_sealed`, AES-GCM,
   migration 58), para o escritório poder reexibir o link sem emitir outro. A
   chave sai do ambiente do servidor (`secret.ts`) e não está em coluna
   nenhuma: um vazamento apenas do banco — dump, backup, réplica — continua não
   entregando link utilizável. Ver `vault.ts` para o que se perde e o que não.
2. **O documento.** O cliente confirma o próprio CPF/CNPJ
   (`POST /api/portal/<token>/verificar`) e ganha um cookie assinado, httpOnly,
   válido por 30 dias. É o que separa "quem recebeu o link encaminhado" de
   "quem é o cliente". Sem CPF/CNPJ no cadastro, a emissão é recusada com 409 —
   um link sem segundo fator seria acesso para quem quer que receba a mensagem.
3. **O payload.** Montado campo a campo em `lib/clientPortal/data.ts`, nunca
   com `select('*')`. Coluna nova em `legal_processes` não vira publicação
   acidental na próxima migration.

Revogar é imediato e vale inclusive para quem já tinha a página aberta: o
cookie só prova o documento, e o `revoked_at` é conferido a cada requisição.

## Por que não há policy de RLS para `anon`

Seria o caminho óbvio — abrir `select` em `clients`, `legal_processes` e
`legal_process_movements` para `anon` com um predicado sobre o token. Não foi
feito: a chave `anon` está no bundle do browser por definição, e um furo no
predicado entregaria a base inteira a qualquer um. A leitura passa pela
service_role dentro de `/api/portal/*`, depois de o token ser validado. A
superfície pública é **uma rota**, não o PostgREST.

## A lista, quando há muitos processos

A página carrega em **dois níveis**, e é isso que a mantém utilizável para quem
tem vinte processos em vez de um:

- `GET /api/portal/<token>` devolve só o RESUMO de cada processo — dados de
  identificação, quantas movimentações visíveis existem e a data da última.
  Nenhum texto de movimentação trafega aqui. `description` é o campo pesado, e
  mandar o de todos os processos era a diferença entre alguns KB e vários MB
  numa conexão de celular, que é de onde o link é aberto.
- `GET /api/portal/<token>/processos/<id>` devolve a timeline de um processo,
  buscada quando o cliente abre o card. O React Query guarda: reabrir não volta
  ao servidor.

⚠️ O id do processo vem da URL, então a rota da timeline **reconfere no banco**
que aquele processo é do cliente do token. Sem isso, um link legítimo leria
qualquer processo do escritório trocando o id na barra de endereços. Processo
de outro cliente responde 404, igual a inexistente — distinguir os dois só
serviria para mapear o acervo.

Na tela, os cards nascem **fechados**, um aberto por vez. O card fechado já
responde à pergunta que traz o cliente ao link — "andou alguma coisa?" — com a
data da última movimentação e a contagem; abrir é para ler o quê. Processo
único abre sozinho, e a partir de cinco aparece uma busca por número ou
assunto. Dentro do card, a timeline mostra 8 atos com "ver as outras N".

## O que o cliente vê da timeline

`legal_process_movements.hidden_from_client` decide, ato a ato.

- **Movimentação** nasce visível. Já é pública no site do tribunal, e um portal
  que começa vazio só funciona se alguém marcar item por item toda semana —
  o que não acontece.
- **Publicação/intimação** nasce oculta (trigger `hide_publicacao_from_client`,
  só no INSERT). É dirigida ao advogado, carrega prazo e assusta fora de
  contexto.

A partir daí, quem decide é o escritório: cada ato na timeline de
`/processos/[id]` tem o botão **Visível ao cliente / Oculto do cliente**. O
trigger não roda no UPDATE, de propósito — senão o clique se desfaria.

O texto do tribunal aparece **como é**, sem paráfrase: o cliente eventualmente
compara com o site do tribunal, e uma reescrita que divirja vira desconfiança.
O escritório controla o que aparece, não a redação.

## Assistente de dúvidas (IA)

O botão **Tirar dúvidas**, fixo no canto da página, abre um chat em que o
cliente pergunta sobre o andamento. Ele aparece depois do documento
confirmado, com pelo menos um processo na lista, sempre que o provedor de IA
do Assistente estiver configurado. `PORTAL_ASSISTANT_ENABLED=false` desliga só
o do portal.

**O sigilo está no dado, não no prompt.** O modelo recebe exatamente o que a
página mostra: a lista de `getPortalProcesses` no prompt e a timeline de
`getPortalProcessTimeline` pela tool `ver_andamento`, as duas presas ao cliente
do token. Publicação oculta, `ai_summary` da BuscaProcessos, partes, valor da
causa, financeiro, tarefas e anotações do escritório nunca chegam a ele.
Instrução se contorna com insistência; dado que não foi enviado não vaza.
Esconder um ato de `/processos/[id]` o esconde também da IA, sem passo a mais.

**As instruções cuidam do comportamento** (`features/portal/assistant/prompt.ts`):

- explica o andamento em linguagem simples, citando data e título do ato;
- não dá orientação jurídica, não prevê resultado nem tempo, não calcula nem
  confirma prazo;
- não trata de honorários, documentos, contratos ou estratégia, e não fala de
  outros processos;
- não repassa recado nem inventa telefone, e-mail ou nome do escritório;
- diante de algo urgente (citação, oficial de justiça, bloqueio, audiência
  próxima), manda falar com o escritório;
- ato que não aparece na página nunca vira "não aconteceu" — a página é um
  recorte, e a IA diz isso.

**Limite e registro** (`client_portal_chat_messages`, migration 64):

- 10 perguntas por hora e 30 por dia, por link, contadas no banco. A contagem
  falha **fechada**: sem conseguir contar, o modelo não é chamado.
- A pergunta é gravada antes de chamar o modelo (turno que falha também
  conta); a resposta, ao terminar, junto com as consultas que o modelo fez —
  que é o que ele viu ao responder.
- O navegador manda só o texto da pergunta. O histórico que volta ao modelo
  (as últimas 10 mensagens) é lido do banco, então ninguém forja uma "resposta
  anterior da IA" nem infla o pedido.
- O escritório lê com `clientes:view` — por enquanto direto no Supabase, ainda
  não há tela. Ninguém edita nem apaga por sessão: é o que dá valor ao registro
  numa reclamação.
- O chat avisa o cliente, antes da primeira pergunta, que a conversa fica
  registrada e que ninguém a acompanha em tempo real.

**Provedor.** O mesmo do Assistente da equipe (`AI_ASSISTANT_PROVIDER`), com a
mesma chave e a mesma cota — por isso o limite por link. ⚠️ No plano gratuito do
Gemini, o Google usa o conteúdo enviado, e a cota é de 20 requisições **por dia**
por modelo (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, medido em
2026-09 no `gemini-3.8-flash`), somando equipe e portal. Cada pergunta gasta
umas duas requisições (consultar o andamento → responder). Para clientes, só no
plano pago. Cota do provedor esgotada chega ao cliente como "o assistente
atingiu o limite de uso por agora", não como erro genérico.

Recarregar a página começa outra conversa.

## Operação

Tela do cliente → botão **Link do cliente**, no cabeçalho, ao lado de *Editar
cadastro*. Fica no cabeçalho e não dentro de uma aba porque reenviar o link é
tarefa de rotina da secretaria: uma seção no fim da aba Cadastro obrigava a
lembrar onde ela estava antes de poder usá-la. O ponto ao lado do rótulo diz,
sem abrir nada, se aquele cliente já tem link ativo.

No diálogo: copiar, abrir como o cliente vê, gerar novo e revogar, mais a data
do último acesso e a contagem. A URL fica disponível sempre — gerar novo é uma
decisão, não uma consequência de ter perdido a mensagem, e por isso pede
confirmação: invalida o link que o cliente já tem.

`client_portal_access_log` registra toda tentativa, inclusive (principalmente)
as recusadas. Sequência de `document_mismatch` no mesmo link é alguém tentando
adivinhar um CPF. O rate limit são 10 recusas por origem a cada 15 minutos,
contadas **no banco** — em serverless, um contador em memória reinicia sozinho
e não limita nada.

## Arquivos

| Camada | Arquivo |
|---|---|
| Schema | `supabase/migrations/20260101000057_client_portal.sql` + `..._58_client_portal_link_recoverable.sql` |
| Segredo e derivação de chaves | `src/lib/clientPortal/secret.ts` |
| Token cifrado (reexibição) | `src/lib/clientPortal/vault.ts` |
| Token | `src/lib/clientPortal/token.ts` |
| Cookie de sessão | `src/lib/clientPortal/session.ts` |
| Validação + log | `src/lib/clientPortal/access.ts` |
| Payload | `src/lib/clientPortal/data.ts` |
| Rotas públicas | `src/app/api/portal/[token]/{route.ts,verificar/route.ts,processos/[processId]/route.ts}` |
| Rota do escritório | `src/app/api/clientes/[id]/portal-link/route.ts` |
| Página | `src/app/acompanhar/[token]/page.tsx` + `src/features/portal/` |
| Emissão na UI | `src/features/clientes/components/PortalLinkDialog.tsx` |
| Assistente — instruções, tool, modelo | `src/features/portal/assistant/{prompt.ts,tools.ts,model.ts}` |
| Assistente — limite e registro | `src/lib/clientPortal/chat.ts` + `supabase/migrations/20260101000064_client_portal_chat.sql` |
| Assistente — rota e chat | `src/app/api/portal/[token]/assistente/route.ts` + `src/features/portal/components/PortalAssistant.tsx` |

`APP_PUBLIC_URL` define a base do link copiado; sem ela, cai no `origin` da
requisição, que atrás de proxy pode ser o endereço interno do container.

## Fora de escopo (decisão explícita desta v1)

Documentos, financeiro, próxima audiência e qualquer canal de contato na
página. Entram quando houver demanda real — cada um aumenta a superfície de
dado sensível numa rota anônima, que é o oposto do que esta v1 otimiza.

O assistente de dúvidas não abre nenhum desses: ele lê o mesmo recorte da
página e não leva mensagem ao escritório.
