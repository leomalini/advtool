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

Processo novo do mesmo cliente entra sozinho no link que ele já tem — não há
nada a reenviar. É a razão de o token ser por cliente.

## As três camadas de acesso

1. **O token.** 32 bytes aleatórios em base64url. O banco guarda só o SHA-256
   (`client_portal_links.token_hash`), então um dump não devolve link nenhum
   utilizável. Um link ativo por cliente, garantido por índice único parcial.
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

## Operação

Tela do cliente → aba **Cadastro** → seção **Link de acompanhamento**.
Gerar, copiar, reemitir e revogar. A URL completa aparece **uma vez só**, na
emissão: o banco tem o hash, e nem a rota consegue remontá-la. Perdeu a
mensagem, emite outra — o que invalida a anterior.

`client_portal_access_log` registra toda tentativa, inclusive (principalmente)
as recusadas. Sequência de `document_mismatch` no mesmo link é alguém tentando
adivinhar um CPF. O rate limit são 10 recusas por origem a cada 15 minutos,
contadas **no banco** — em serverless, um contador em memória reinicia sozinho
e não limita nada.

## Arquivos

| Camada | Arquivo |
|---|---|
| Schema | `supabase/migrations/20260101000057_client_portal.sql` |
| Token | `src/lib/clientPortal/token.ts` |
| Cookie de sessão | `src/lib/clientPortal/session.ts` |
| Validação + log | `src/lib/clientPortal/access.ts` |
| Payload | `src/lib/clientPortal/data.ts` |
| Rotas públicas | `src/app/api/portal/[token]/{route.ts,verificar/route.ts}` |
| Rota do escritório | `src/app/api/clientes/[id]/portal-link/route.ts` |
| Página | `src/app/acompanhar/[token]/page.tsx` + `src/features/portal/` |
| Emissão na UI | `src/features/clientes/components/PortalLinkSection.tsx` |

`APP_PUBLIC_URL` define a base do link copiado; sem ela, cai no `origin` da
requisição, que atrás de proxy pode ser o endereço interno do container.

## Fora de escopo (decisão explícita desta v1)

Documentos, financeiro, próxima audiência e qualquer canal de contato na
página. Entram quando houver demanda real — cada um aumenta a superfície de
dado sensível numa rota anônima, que é o oposto do que esta v1 otimiza.
