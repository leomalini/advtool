# Integração D4Sign — assinatura eletrônica em Contratos e Documentos

> **Status:** plano e decisões técnicas aprovados em 2026-10-21. Em 2026-10-22
> o plano da conta foi corrigido para o Advanced e o WhatsApp entrou na v1. A
> Fase 1 (fundação) começou antes do spike, a pedido: a migration fica escrita
> e só é aplicada depois dele. O spike no sandbox (Fase 0) depende da conta de
> teste — ver "Antes do spike".
> **Referência:** https://docapi.d4sign.com.br (lida em 2026-10-21), a central
> de ajuda (ajuda.d4sign.com.br) e a página de planos.

Pedido: integrar a D4Sign aos documentos e contratos, usando os recursos dela —
inclusive o armazenamento de arquivos, se possível.

## Decisões (2026-10-21)

| # | Tema | Escolha | Consequência |
|---|---|---|---|
| 1 | Conta | Conta existente, **com API, plano Advanced** (anual): 20 envios e 20 WhatsApp por mês, 200 créditos de D4Sign AI | Limite padrão de 10 chamadas por hora e **cota de 20 envios por mês**; os recursos extras dependem do plano (ver a seção seguinte). Corrigido em 2026-10-22 — antes constava Basic |
| 2 | Onde | **Contratos e Documentos** | Contratos primeiro; procuração e declaração na fase seguinte |
| 3 | Armazenamento | **Via legal + pastas por cliente** | O Supabase continua dono dos arquivos. Na D4Sign, cada envio cai na pasta do cliente, e o PDF assinado volta para o app |
| 4 | Recursos da v1 | **Autenticação forte, certificado ICP-Brasil, assinatura no portal (Embed) e WhatsApp por signatário**. O WhatsApp entrou em 2026-10-22, quando o plano se revelou Advanced | Cada recurso liga em Configurações, conforme o plano permitir |
| 5 | Ao finalizar | **O contrato vira vigente sozinho** | O servidor confere na API, salva o PDF assinado, grava a data real e avisa o responsável. Lançar parcelas continua manual |
| 6 | Portal | **Só o que falta assinar** | Seção "Para assinar" com o Embed; depois de assinado, sai da lista. Reabre o "não é assinatura" de `portal-cliente.md` |
| 7 | Spike | **No sandbox** | Conta de teste separada; nenhuma chamada na conta real antes do spike |

## O plano Advanced × os recursos escolhidos

A página de planos (2026-10) descreve o Basic como "o essencial", o Advanced
como "autenticações extras" e põe a API Premium (e o Embed) no Professional. Os
sites da D4Sign se contradizem nos nomes e preços. Confirmadas, só as cotas do
contrato do escritório.

| Recurso | O que a D4Sign indica | No Advanced |
|---|---|---|
| Envio, signatários, webhook, download | API em todos os planos | Sim |
| Envios | Cota do plano | **20 por mês** |
| WhatsApp | Link de assinatura pelo WhatsApp | **20 por mês** |
| Limite de chamadas | 10 por hora; mais, só com a API Premium (sob consulta) | 10 por hora |
| Autenticação forte (Pix, documento + selfie, vídeo-selfie, D4Sign Score) | "Autenticações extras" é o mote do Advanced | Provavelmente sim — confirmar quais e o custo por uso |
| Certificado ICP-Brasil | Existe na API (`certificadoicpbr`); a página de planos não diz o plano | Confirmar |
| Embed | Listado junto da API Premium (Professional); ativado pelo suporte | Provavelmente não — confirmar |
| D4Sign AI (200 créditos) | Recurso do painel | Fora: a API não tem chamada para ela, e o app tem o próprio assistente |

**Como o código lida com isso:** a API não informa o plano, então cada recurso
extra é uma chave em Configurações → Assinatura, ligada por quem administra. As
opções extras só aparecem no envio quando estão ligadas. A Fase 4 (portal)
depende da resposta do comercial.

### A cota de 20 envios por mês

Contratos e Documentos dividem a mesma cota, e o que se envia pelo painel da
D4Sign também gasta dela.

- O saldo (`GET /account/balance`: `credit`, `sent`) aparece em Configurações e
  no diálogo de envio ("restam 7 de 20"). Consultar gasta uma chamada, então o
  último valor fica guardado em `office_settings` e se atualiza quando alguém
  pede e depois de cada envio.
- O que `credit` e `sent` contam (o mês ou o ano, já que o pagamento é anual)
  aparece no primeiro "Testar conexão" com a conta real — só leitura, não gasta
  envio.
- O diálogo avisa antes de gastar. Cota esgotada
  (`"This account has no more limits to send documents"`) vira mensagem
  própria, sem nova tentativa automática.
- O spike roda no sandbox e não gasta a cota real.

## A API, em uma página

### Acesso

- Produção `https://secure.d4sign.com.br/api/v1` (validade jurídica);
  sandbox `https://sandbox.d4sign.com.br/api/v1` (sem validade). As contas são
  separadas: cadastro do sandbox em `https://sandbox.d4sign.com.br/criar.html`,
  e a API dele é liberada pelo suporte.
- Autenticação: `tokenAPI` e `cryptKey` **na query string** de toda chamada.
  As chaves ficam no menu "Dev API" da conta.
- **Limite padrão: 10 requisições por hora.** O erro diz "Esta chave da API já
  atingiu o tempo limite para este método" — sugere limite por endpoint, não
  total. Ampliar é com o comercial (API Premium).
- Erros: 400 com `message`; 401 `"Chave de API inválida."`; 500
  `"Server error."`. Cota de envios esgotada:
  `"This account has no more limits to send documents"`.

### Fases do documento

`1` Processando · `2` Aguardando signatários · `3` Aguardando assinaturas ·
`4` Finalizado · `5` Arquivado · `6` Cancelado · `7` Editando.

### Chamadas que vamos usar

| Para quê | Chamada | Observação |
|---|---|---|
| Escolher o cofre | `GET /safes` | `uuid-safe`, `name-safe` |
| Saldo | `GET /account/balance` | `credit`, `sent`, `used_balance` ("372/999") |
| Pastas por cliente | `GET /folders/{cofre}/find`, `POST /folders/{cofre}/create` (`folder_name`, `uuid_folder` para subpasta), `POST /folders/{cofre}/rename` | |
| Subir o documento | `POST /documents/{cofre}/upload` (form-data `file`, `uuid_folder`) ou `uploadbinary` (base64, `mime_type`, `name`) | PDF, DOC, DOCX, JPG, PNG, BMP. Acima de 20 MB (até 500 MB): `uploadbigfile`. Devolve `{uuid}` |
| Webhook | `POST /webhooks/v2/` (`type`: `cofre` ou `documento`, `uuid`, `url`) | **Por cofre**: registrado uma vez, não gasta chamada por envio |
| Signatários | `POST /documents/{uuid}/createlist` (`signers[]`) | Ver "Signatários" |
| Enviar | `POST /documents/{uuid}/sendtosigner` | `skip_email` (0/1), `workflow` (1 = segue a ordem), `message`, `sign_limit_date` (DD-MM-AAAA; cancela sozinho às 23:59:59 do dia) |
| Conferir | `GET /documents/{uuid}` | Fase atual — é a confirmação antes de mudar status |
| Lista de signatários | `GET /documents/{uuid}/list` | Resposta não documentada (spike) |
| Reenviar o link | `POST /documents/{uuid}/resend` (`email`, `key_signer`) | Intervalos mínimos: 1, 5 e 30 min, depois 60 |
| Trocar e-mail | "Alterar signatário" | Para e-mail não entregue |
| Cancelar | `POST /documents/{uuid}/cancel` (`comment`) | Volta `statusId` 6 |
| Baixar o assinado | `POST /documents/{uuid}/download` (`type`: `PDF`, `ZIP` ou `pdfa`; `language`) | Devolve `{url, name}`; validade da URL não documentada |
| Prévia | `POST /documents/{uuid}/generate-document-view` | URLs valem 5 minutos |

Não vamos usar: templates da D4Sign (o motor de modelos é nosso), lotes,
power forms, tags, observadores, agendamento, upload de hash, SSO.

### Signatários

Papel (`act`): `1` Assinar · `2` Aprovar · `3` Reconhecer · `4` Assinar como
parte · `5` como testemunha · `6` como interveniente · `7` Acusar recebimento ·
`8` como emissor, endossante e avalista · `9` o mesmo, mais fiador · `10` como
fiador · `11` como parte e fiador · `12` como responsável solidário · `13` como
parte e responsável solidário.

Autenticação, por signatário:

| Opção | Parâmetros | Exige |
|---|---|---|
| Código por e-mail | padrão | — |
| Link pelo WhatsApp | `whatsapp_number` | celular com DDI (+55…); gasta a cota de WhatsApp |
| Pix | `auth_pix`, `auth_pix_nome`, `auth_pix_cpf` | nome e CPF |
| Documento com foto (+ selfie) | `docauth` ou `docauthandselfie` (excludentes) | — |
| Vídeo-selfie | `videoselfie` | — |
| Biometria (D4Sign Score) | `d4sign_score`, `_nome`, `_cpf`, `_similarity` (70–90) | CNH + selfie ou vídeo-selfie |
| Certificado ICP-Brasil | `certificadoicpbr`, `certificadoicpbr_tipo` (1 qualquer · 2 e-CPF · 3 e-CNPJ), `_cpf`, `_cnpj` | certificado do signatário |
| Presencial | `assinatura_presencial` | exclui as outras, menos `password_code` |
| Sem CPF (estrangeiro) | `foreign`, `foreign_lang` | — |
| Embed | `embed_methodauth` (`email`, `password`, `sms`, `whats`), `embed_smsnumber` | Embed ativo |

**Combinação inválida não dá erro:** a D4Sign aplica a regra dela (ICP
prevalece sobre presencial; `docauth` × `docauthandselfie` fica o último) e
devolve o que valeu. Guardamos o pedido e o aplicado, e a tela mostra o
aplicado.

### Webhook

- Disparos: `type_post` `1` finalizado · `2` e-mail não entregue ·
  `3` cancelado · `4` um signatário assinou. Em **form-data**.
- Versão 2.0 acrescenta `event_datetime` e, conforme o evento: `signers[]`
  (`uuid`, `email`, `name`, `signed_at`, `identification_number`), `signer`,
  `error_details`, `cancellation_message`.
- Retentativas: na hora, depois de 1 h, 1 h, 1 h, 6 h, 6 h e 12 h — até ~27 h.
- **Segurança:** cabeçalho `Content-Hmac: sha256=<hex>`, HMAC-SHA256 **só do
  UUID do documento** com a "Secret Key MAC" (gerada em Dev API). O corpo não é
  assinado. A central de ajuda cita o IP de origem `54.94.40.55`.

### Embed

Iframe de `https://secure.d4sign.com.br/embed/viewblob` com `key` (UUID do
documento), `signer_email` e, opcionais, `signer_display_name`,
`signer_documentation` (CPF), `signer_birthday`, `signer_key_signer`. Avisa a
página por `postMessage`: `signed` e `wrong-data`. O documento precisa estar em
"Aguardando assinaturas"; o signatário confirma com um código. Ativação pelo
suporte.

### O que a documentação não diz (o spike responde)

- Resposta de `createlist` e de `GET /documents/{uuid}/list`: onde vem o
  `key_signer`.
- O webhook v2 por cofre manda o formato 2.0? Em form-data ou JSON? O que
  responder, e em quanto tempo?
- Quanto tempo vale a URL do download, e o que vem no PDF (folha de
  assinaturas, carimbo).
- O limite é por método ou total? Que status HTTP volta ao estourar?
- A conversão de DOCX respeita o papel timbrado?
- O Embed tem host próprio no sandbox? Exige domínio cadastrado? Convive com
  `skip_email = 0`?
- Upload sem envio, ou documento cancelado, conta na cota mensal?
- O signatário recebe a via final por e-mail sozinho?
- Nome de pasta repetido no mesmo cofre: aceito ou recusado? (`d4sign_folders`
  liga pelo `client_id`, então homônimos geram duas pastas de mesmo nome.)
- A "Secret Key MAC" entra no HMAC como texto ou como bytes? O webhook aceita
  as duas leituras até o spike dizer qual.

## Armazenamento: quem guarda o quê

| Onde | O quê | Por quê |
|---|---|---|
| Supabase (`attachments`) | Tudo que o app usa: minuta, documentos e a **cópia do PDF assinado** | RLS por pasta; o leitor de IA, a tela e o portal leem daqui; não depende de a conta da D4Sign continuar ativa |
| D4Sign (cofre escolhido, uma pasta por cliente) | O que foi para assinatura, a trilha de auditoria e a via assinada com validade jurídica | É a prova da assinatura, organizada como o app |

**Por que a D4Sign não vira o armazenamento principal:** o acesso aos arquivos
vale "enquanto a conta estiver ativa no mesmo contrato"; cada abertura de
arquivo seria uma chamada (10 por hora); as URLs expiram; e o leitor de IA, a
RLS e o portal deixariam de alcançar os arquivos. Espaço também não é motivo:
o bucket tem hoje 10 arquivos e 18 MB.

**Pastas:** `<cofre>/<nome do cliente>`, criadas no primeiro envio do cliente e
guardadas em `d4sign_folders` (por `client_id`, então homônimos não se
confundem). Contrato do escritório vai para "Escritório"; documento sem
cliente, para "Sem cliente". Nome do cliente mudou: a pasta é renomeada no
envio seguinte. Sem subpasta por processo na v1.

## Fluxos

### Enviar um contrato

"Enviar para assinatura" (o botão do rascunho) abre o diálogo novo quando a
D4Sign está configurada. "Só marcar como aguardando" fica no menu, para
assinatura em papel. Sem D4Sign, o botão faz o que faz hoje.

- **Arquivo:** a minuta mais recente, ou outro PDF/DOCX do contrato. DOCX vai
  como está e a D4Sign converte; se o spike mostrar que a conversão estraga o
  timbrado, o diálogo ganha a prévia (`generate-document-view`) antes do envio.
- **Signatários**, pré-preenchidos das partes (`contract_parties`, com e-mail,
  celular e CPF):

  | Papel no contrato | `act` |
  |---|---|
  | Testemunha | 5 |
  | Fiador | 10 |
  | Cônjuge anuente, interveniente | 6 |
  | Os demais | 4 (parte) |

  A parte do escritório vira o advogado ou os advogados escolhidos (padrão: o
  responsável pelo contrato), com o e-mail do login. Parte sem e-mail aparece
  com aviso; o e-mail digitado no diálogo é gravado na parte.
- **Por signatário:** autenticação (padrão: código por e-mail; as outras só se
  ligadas em Configurações), "link também pelo WhatsApp" (com o celular da
  parte ou do cadastro) e "assina pelo portal" (só o cliente do contrato, só
  com Embed ligado).
- **Envio:** seguir a ordem ou todos ao mesmo tempo (padrão), mensagem e prazo
  (vazio = o padrão do cofre).

### O envio no servidor

`POST /api/assinaturas`, com `contratos:update` (ou `documentos:update`, fora
de Contratos) conferido antes de qualquer chamada à D4Sign — o envio gasta
cota.

1. Grava `signature_requests` (`preparing`) e os signatários.
2. Garante a pasta do cliente.
3. Lê o arquivo do Storage e faz o upload → guarda o `external_id`.
4. `createlist` → guarda o aplicado de cada signatário e o `key_signer`.
5. `sendtosigner` → `sent`.
6. O contrato vai para `aguardando_assinatura` **pelo client de sessão**, para
   o histórico de status registrar quem enviou.

Cada passo é gravado. Se um falha, o pedido fica `failed` com o passo e o
motivo; "Tentar de novo" continua dali (sem novo upload, se já houver
`external_id`). Limite estourado vira mensagem com o horário para tentar de
novo — nada de repetição automática.

### Acompanhar

- **Contrato:** seção "Assinatura" com o status, o prazo e cada signatário
  (pendente, assinou em…, e-mail não entregue). Ações: reenviar o link,
  corrigir e-mail, cancelar o envio e "Atualizar status" (1–2 chamadas,
  bloqueado por alguns minutos depois de usado).
- **Listas:** selo "Em assinatura (1/3)" no contrato e no documento.
- **Sino:** só o que pede ação ou fecha o ciclo — concluído, cancelado e
  e-mail não entregue. Cada assinatura individual vai só para a seção, sem
  aviso.

### Finalizado

1. Webhook `1` (ou "Atualizar status") → HMAC → o UUID tem de ser nosso.
2. `GET /documents/{uuid}` confirma a fase 4. Se não confirmar, a entrega fica
   `ignored`, com o motivo.
3. `download` em PDF → o arquivo entra no Storage como documento novo:
   - no contrato, `contract_file_role = 'assinado'`;
   - fora dele, com os mesmos donos do original.
4. Uma função no banco grava tudo numa transação: pedido `signed`,
   signatários, o vínculo com a cópia e — **se o contrato estava aguardando
   assinatura** — `vigente` com `signed_at` = data da última assinatura
   (horário de Brasília; na falta dela, a data da confirmação). Em qualquer
   outro status (um aditivo de contrato já vigente), só guarda o arquivo.
5. O trigger `sync_contract_event` põe o fim do contrato na Agenda, como já
   faz com a assinatura manual.
6. Aviso ao responsável: "Contrato X assinado por todos". Na página, a seção
   Financeiro já oferece "Lançar parcelas" quando nada foi lançado.

Idempotente: o pedido sai de `sent` uma vez só; webhook repetido vira
`duplicate`.

### Cancelado ou expirado

Webhook `3` (cancelado no painel ou prazo vencido) → confirmação na API →
pedido `canceled` com o motivo → contrato volta a `rascunho` se ainda estava
aguardando e não há outro envio aberto → aviso. Cancelar pelo app faz o
mesmo, sem esperar o webhook.

### E-mail não entregue

Webhook `2` → signatário `email_failed` + aviso. A seção oferece "Corrigir
e-mail", que troca na D4Sign e reenvia.

### Documentos (procuração, declaração)

- "Enviar para assinatura" no menu de qualquer PDF/DOCX de Documentos e das
  abas do cliente e do processo. Anexo de lançamento fica de fora.
- Signatário padrão: **só o cliente** — procuração e declaração não levam a
  assinatura do advogado. Dá para incluir outros.
- A cópia assinada entra ao lado da original, com os mesmos donos; a original
  ganha "Assinado — ver a versão assinada".

### Portal (Embed)

- Seção **"Para assinar"** no topo do `/acompanhar`, como as cobranças em
  aberto: pedidos `sent` com um signatário pendente que é o cliente do link e
  marcado "assina pelo portal".
- O clique abre o Embed. Os dados (UUID do documento, e-mail, CPF) só saem
  depois de `requirePortalSession`.
- `signed` → "Assinado! A via final chega por e-mail" e o item sai da lista na
  sessão; o banco se atualiza pelo webhook. `wrong-data` → "Fale com o
  escritório para corrigir". Sem aviso automático: o portal não é canal.
- O e-mail da D4Sign continua indo (`skip_email = 0`): o portal é um caminho a
  mais. Se o spike mostrar que o Embed exige `skip_email = 1`, quem não assina
  pelo portal recebe o link pelo `resend` (uma chamada por signatário).
- O assistente do portal não vê assinaturas, como já não vê pagamentos.

## O limite de 10 chamadas por hora

| Momento | Chamadas |
|---|---|
| Configurar (uma vez) | cofres, webhook do cofre, saldo |
| Primeiro envio de um cliente | +1 ou 2 (achar ou criar a pasta) |
| Enviar | 3: `upload`, `createlist`, `sendtosigner` |
| Finalizar | 2: `GET` do documento e `download` |
| Cancelar, reenviar, corrigir e-mail | 1 cada (+1 de confirmação no cancelamento) |

- **Se o limite for por método:** cerca de 10 envios e 10 finalizações por
  hora. Sobra para um escritório.
- **Se for total:** uns 2 contratos por hora. Aí a API Premium vira
  necessária.
- Por isso: nada de consulta periódica de status; assinaturas individuais
  (`type_post` 4) não são conferidas na API — só os eventos que mudam o
  contrato; "Atualizar status" é manual e tem intervalo.

## Segurança

1. **Credenciais só no servidor:** `D4SIGN_API_URL`, `D4SIGN_TOKEN_API`,
   `D4SIGN_CRYPT_KEY`, `D4SIGN_WEBHOOK_SECRET`. Nunca com `NEXT_PUBLIC_`.
   Faltando, as rotas respondem 503 e a aba mostra "não configurado".
2. **As chaves vão na URL:** o cliente HTTP nunca registra URLs, e todo erro
   gravado (`signature_requests.error`, `webhook_events`) passa por uma
   limpeza de `tokenAPI` e `cryptKey`.
3. **Webhook** (`/api/webhooks/d4sign`):
   - HMAC do UUID, comparado em tempo constante;
   - o UUID tem de ser de um pedido nosso (senão, `unmatched`);
   - o corpo é **pista**: finalizar e cancelar só depois do `GET` na API;
   - idempotente;
   - o IP de origem fica registrado, sem bloquear (a D4Sign pode trocá-lo);
   - responde rápido e processa em `after()`. Falha no processamento fica em
     `webhook_events`, com "Reprocessar" e "Atualizar status".
4. **RLS:** as tabelas novas são só leitura para a tela; quem grava é a rota,
   via service_role, depois de `requireApiPermission` — o desenho da
   InfinitePay.
5. **Portal:** só os pendentes do cliente da sessão; nenhum arquivo para
   baixar.
6. **LGPD:** selfie, Pix e biometria ficam na D4Sign. O app guarda o status e
   o PDF assinado. O download nunca pede `document=true`, que devolve as fotos
   dos documentos dos signatários.
7. **Armadilha dev → produção:** o `APP_PUBLIC_URL` do `.env` local é a
   produção. Registrar o webhook do cofre do sandbox a partir do dev apontaria
   a produção para eventos do sandbox. A tela mostra a URL antes de registrar e
   aceita `D4SIGN_WEBHOOK_URL` para apontar outro endereço.

## Modelo de dados — migration `20260101000079_d4sign_signatures.sql`

Número a reconferir ao criar: a 78 é a última hoje, e 77 e 78 ainda não foram
aplicadas no remoto.

**`office_settings`:** `d4sign_safe_uuid`, `d4sign_safe_name`,
`d4sign_webhook_url`, `d4sign_webhook_registered_at`, `d4sign_features jsonb`
(`whatsapp`, `pix`, `selfie`, `video_selfie`, `score`, `icp`, `embed`) e o
último saldo lido (`d4sign_balance_credit`, `d4sign_balance_sent`,
`d4sign_balance_checked_at`). Nada disso é segredo: o cofre não autentica nada
sem as chaves.

**`signature_requests`** — um envio.

| Coluna | |
|---|---|
| `provider` | `'d4sign'` |
| `document_id` | → `documents`, o arquivo enviado (`set null`: o histórico fica) |
| `contract_id` | → `contracts` (`cascade`); nulo fora de Contratos. Decide o regime da RLS |
| `client_id` | → `clients` (`set null`): para a pasta e o portal |
| `external_id` | UUID do documento na D4Sign, **unique** |
| `safe_uuid`, `folder_uuid`, `title` | onde ficou e com que nome |
| `status` | `preparing` · `sent` · `signed` · `canceled` · `failed` |
| `failed_step` | `upload` · `signers` · `send` — de onde "Tentar de novo" continua |
| `ordered`, `message`, `deadline` | o que foi pedido no envio |
| `signed_document_id` | → `documents`, a cópia assinada (`set null`) |
| `sent_at`, `finished_at`, `canceled_at`, `cancel_reason`, `error` | |
| `created_by`, `created_at`, `updated_at` | |

Índice único parcial: um envio `preparing`/`sent` por documento.

**`signature_signers`** — um signatário.

| Coluna | |
|---|---|
| `request_id` | → `signature_requests` (`cascade`) |
| `position` | ordem |
| `name`, `email`, `document`, `phone` | o que foi enviado |
| `act` | papel na D4Sign (1–13) |
| `contract_party_id`, `client_id`, `profile_id` | de onde veio (`set null`). `client_id` é o que o portal procura; `profile_id`, o advogado |
| `auth_requested`, `auth_applied` | jsonb — o pedido e o que a D4Sign aplicou |
| `whatsapp_number` | celular (+55…) quando o link também vai pelo WhatsApp |
| `via_portal` | assina pelo Embed |
| `key_signer` | chave na D4Sign (reenvio, Embed) |
| `status` | `pending` · `signed` · `email_failed` |
| `signed_at` | |

**`d4sign_folders`:** `safe_uuid`, `client_id` (→ `clients`, `cascade`; nulo =
"Escritório"), `folder_uuid`, `folder_name`. Único por cofre e cliente
(`nulls not distinct`). Sem policy: só o servidor usa.

**RLS:** leitura de `signature_requests` pelo regime do arquivo — contrato →
`contratos:view`; senão, `documentos:view` — como as policies de `documents`
na migration 69. `signature_signers` segue o pedido. Nenhuma policy de
escrita.

**Travas:** excluir um documento ou contrato com envio aberto é recusado com
`PT409` ("cancele o envio na D4Sign antes"). Mudar o status de um contrato com
envio aberto não é travado no banco: a tela avisa e oferece cancelar.

**Histórico de status:** a finalização grava pela service_role, sem
`auth.uid()`. `contract_status_changes` ganha `source` (`'d4sign'`), que o
trigger lê de uma configuração local da transação, para o histórico mostrar
"pela D4Sign" em vez de um nome vazio.

**`webhook_events`:** `provider = 'd4sign'`, uma entrada nova em
`WEBHOOK_PROVIDERS`. As consultas da BuscaProcessos e da InfinitePay já filtram
pelo provedor.

## Telas

- **Configurações → Assinatura:** credenciais (presentes ou não), ambiente
  (sandbox ou produção, pelo host), "Testar conexão" (mostra o saldo),
  escolha do cofre, registro do webhook do cofre e as chaves dos recursos do
  plano, com o aviso de que a API não informa o plano.
- **Contrato:** o diálogo de envio, a seção "Assinatura" e o selo na lista.
- **Documentos:** "Enviar para assinatura" no menu, selo e cópia assinada.
- **Portal:** "Para assinar".
- **Webhooks:** D4Sign no filtro de provedor.

## Ajustes no que já existe

| Onde | Ajuste |
|---|---|
| `ContractStatusActions` | "Enviar para assinatura" abre o diálogo da D4Sign; "só marcar" vai para o menu |
| `ContractSignDialog` | com envio aberto, avisa e oferece cancelar antes |
| `ContractDetailPage` | seção "Assinatura"; histórico com "pela D4Sign" |
| `DOCUMENT_SELECT` | o status do envio, para o selo. ⚠️ Ordem do deploy: migration antes do código |
| `PortalPage` e `lib/clientPortal/data.ts` | "Para assinar", no molde de `getPortalPayments` |
| Sino | ícones de `assinatura_concluida`, `assinatura_cancelada`, `assinatura_email_falhou` |
| `.env.example` | as variáveis `D4SIGN_*` |
| `docs/portal-cliente.md`, `docs/contratos.md`, `docs/ROADMAP-MODULOS.md` | "não é assinatura" e "assinatura fora de escopo" mudam |

Nota: existem dois porteiros de rota quase iguais, `requireApiPermission` e
`requirePermissionApi`. A integração usa o primeiro, como a InfinitePay.

## Fases

Cada fase é um PR. Se ficarem empilhados, mergear um por vez trocando a base
para `main` antes do merge, ou abrir um PR só do topo da pilha.

0. **Spike no sandbox** (nada no repo): script no scratchpad com as chaves do
   sandbox. Cofre e pasta; upload de DOCX com timbrado e de PDF; `createlist`
   com as variações de autenticação (para ver o que volta); envio; webhook v2
   do cofre; assinar com e-mails seus; Embed numa página local; download;
   cancelamento; reenvio; e o comportamento do limite. O receptor pode ser a
   própria rota da fase 1, por um túnel até o dev local (`D4SIGN_WEBHOOK_URL`):
   ela grava cada aviso em `webhook_events` como teste, mas, sem a migration
   79, responde 503 depois de gravar, e a D4Sign repete. Combinar na hora.
   Resultados numa seção "O que o spike mostrou".
1. **Fundação:** migration, `src/lib/d4sign/` (cliente com limpeza das chaves,
   schemas zod das respostas, erro de limite próprio), variáveis de ambiente,
   Configurações → Assinatura, rota do webhook e pastas por cliente.
2. **Contratos:** diálogo de envio (com autenticação forte e ICP atrás das
   chaves), seção "Assinatura", finalização, cancelamento, e-mail não
   entregue, travas, avisos, reenviar, corrigir e-mail e "Atualizar status".
3. **Documentos:** o mesmo envio para qualquer PDF/DOCX, a cópia assinada ao
   lado e os selos.
4. **Portal (Embed):** depende do Embed ativo na conta — e, talvez, de outro
   plano.

Verificação de cada fase: `tsc --noEmit`, `pnpm lint`, build e conferência no
navegador. O fluxo completo, contra o sandbox.

## Como ficou a fase 1

Branch `feat/d4sign-base`, a partir da `main` (`7af6643`), adiantada antes do
spike a pedido (2026-10-22).

### Banco — migration 79 (escrita, NÃO aplicada)

`20260101000079_d4sign_signatures.sql`, como na seção "Modelo de dados":
colunas `d4sign_*` em `office_settings`, `signature_requests`,
`signature_signers`, `d4sign_folders`, `contract_status_changes.source` (com o
trigger do histórico lendo `app.status_change_source`), as travas `PT409` de
exclusão e a RLS só de leitura. Aplicar só depois do spike: a resposta real da
API ainda pode mudar `signature_signers`.

⚠️ **Ordem do deploy:** a migration antes do código. Sem ela a aba abre, mas
salvar o cofre e o saldo falham, e o webhook responde 503 (a D4Sign tenta de
novo por até ~27 h).

### Servidor — `src/lib/d4sign/`

| Arquivo | O que faz |
|---|---|
| `config.ts` | Lê `D4SIGN_*`. Só aceita os dois hosts da D4Sign (as chaves vão na query); `d4signSetupStatus()` diz à tela o que falta, sem valores |
| `urls.ts` | O endpoint do webhook: `D4SIGN_WEBHOOK_URL` vence `APP_PUBLIC_URL` (a armadilha dev → produção) |
| `client.ts` | Uma chamada à API: chaves na query, corpo lido como texto, erros por tipo (`auth`, `rate_limit`, `quota`, `rejected`, `unavailable`, `invalid_response`, `not_configured`) e limpeza das chaves em toda mensagem. O limite e a cota são reconhecidos pela mensagem, até num 200 |
| `schemas.ts` | Respostas de cofres, saldo e pasta, aceitando lista ou objeto e número ou texto até o spike dizer o formato |
| `account.ts` | Cofres, saldo e o webhook 2.0 do cofre |
| `folders.ts` | A pasta de cada cliente (e "Escritório", "Sem cliente"), criada no primeiro envio; renomear é cosmético e nunca para o envio. Sem chamador até a fase 2 |
| `webhook.ts` | O corpo em multipart, urlencoded ou JSON; o HMAC do UUID com a chave lida como texto e como hexa; os cabeçalhos de diagnóstico |
| `http.ts` | Erro da D4Sign → resposta da rota (chave recusada é 502, não 401) |

Rotas:
- `POST /api/webhooks/d4sign`: autentica, procura o envio e grava em
  `webhook_events` (`provider = 'd4sign'`). 401 com HMAC errado, 503 quando
  não grava ou não consegue procurar, 200 para o resto. Com o ambiente em
  sandbox, as entregas ficam `is_test`. Nenhum evento é processado ainda.
- `GET /api/assinaturas/d4sign/cofres`, `PUT /api/assinaturas/d4sign/cofre` e
  `POST /api/assinaturas/d4sign/saldo`, todas com `configuracoes:manage`.
  Escolher o cofre registra o webhook; se o registro falhar por outro motivo
  que não as chaves, o cofre é salvo e a resposta diz o que faltou, mantendo
  o registro anterior quando o cofre é o mesmo.

### Tela — Configurações → Assinatura

- Situação das chaves (sandbox ou produção, o que falta) e dos avisos (sem
  segredo, sem endereço, não registrados, registrados para outro endereço).
- Cofre: lista sob demanda (gasta chamada), escolha e troca com confirmação.
- Envios do plano: "Testar conexão e ler o saldo" mostra quantos restam e
  quando foi lido.
- Recursos do plano: as sete chaves (WhatsApp, Pix, documento + selfie,
  vídeo-selfie, biometria, ICP-Brasil, Embed).
- Avisos da D4Sign: as últimas entregas do webhook, com o motivo da recusa.
- `StatusRow` saiu do cartão da InfinitePay para ser usado pelos dois.

### Verificação

- `tsc --noEmit`, `pnpm lint` (os avisos que restam são de arquivos que a fase
  não tocou) e `pnpm build` sem erro. O bundle do navegador não tem `tokenAPI`
  nem `service_role`: o cliente da API ficou no servidor.
- **No Node, com o código real** (loader no scratchpad, `fetch` falso no lugar
  da D4Sign e Supabase em memória): 44 verificações — hosts aceitos e
  recusados, endpoint com e sem `D4SIGN_WEBHOOK_URL`, chaves na query e fora
  de toda mensagem de erro, limite e cota reconhecidos até num 200, cofres e
  saldo em formatos diferentes, o corpo do webhook em multipart, urlencoded e
  JSON, o HMAC (certo, errado, maiúsculo, sem prefixo, chave em hexa lida das
  duas formas), pastas (criar, reaproveitar, renomear, recusa ao renomear,
  corrida) e as quatro rotas com seus códigos de resposta e o que gravam.
- **Tela** numa página temporária sob `/acompanhar` (já apagada), com sessão
  falsa e cache pré-carregado: os seis estados das chaves e dos avisos, a
  linha sem as colunas da migration, listar e escolher cofre (direto na
  primeira vez, com confirmação na troca), saldo, recursos (o payload gravado
  conferido), perfil só de leitura sem botões, as três falhas (limite, webhook
  recusado, chave recusada), celular a 375 px sem rolagem lateral e os temas
  claro e escuro. O cartão da InfinitePay segue igual com o `StatusRow`
  compartilhado.
- **Não verificado:** a migration não rodou em nenhum Postgres, e nada falou
  com a D4Sign de verdade — isso é o spike.

## Riscos e pontos em aberto

- **Plano Advanced × recursos escolhidos:** o Embed e o custo da autenticação
  forte. Perguntas abaixo.
- **Cota de 20 envios por mês:** com as procurações entrando, pode faltar. O
  saldo fica à vista e o envio avisa antes.
- **Limite por método ou total:** muda de "sobra" para "API Premium
  obrigatória".
- **Conversão de DOCX:** se estragar o timbrado, entra a prévia, ou o envio
  passa a exigir PDF.
- **Prazo da URL de download:** baixamos na hora da finalização; se expirar
  antes, "Atualizar status" refaz.
- **Testemunhas:** o art. 784, § 4º, do CPC (Lei 14.620/2023) dispensa
  testemunhas em título executivo eletrônico com integridade conferida por
  provedor de assinatura; há debate sobre exigir provedor ICP-Brasil. O papel
  "testemunha" (`act` 5) fica disponível — o escritório decide quando usar.
- **D4Sign fora do ar:** o envio fica `failed` e o caminho manual ("Marcar
  como assinado" com o PDF) continua valendo.
- **Custo por uso** da autenticação forte: confirmar antes de ligar.

## Antes do spike: o que fica com você

1. Criar a conta de teste em https://sandbox.d4sign.com.br/criar.html.
2. Pedir a suporte@d4sign.com.br: API ativa no sandbox, envios de teste e o
   Embed no sandbox.
3. No sandbox, criar o cofre "advtool-testes"; em Dev API, copiar o token e a
   cryptKey e gerar a "Secret Key MAC".
4. Colocar no `.env` local — **nunca no chat**: `D4SIGN_API_URL=https://sandbox.d4sign.com.br/api/v1`,
   `D4SIGN_TOKEN_API`, `D4SIGN_CRYPT_KEY`, `D4SIGN_WEBHOOK_SECRET`.
5. Mandar ao comercial (comercial@d4sign.com.br), mencionando o plano Advanced:
   1. Pix, documento + selfie, vídeo-selfie, D4Sign Score e certificado
      ICP-Brasil: quais o Advanced libera pela API, e com que custo por uso?
   2. Embed: está no Advanced? Precisa da API Premium? Exige domínio
      cadastrado?
   3. O limite de 10 requisições por hora é por método ou total? Quanto custa
      a API Premium?
   4. Documento cancelado, ou subido e não enviado, conta nos 20 envios do
      mês? Quanto custa o envio além dos 20?
   5. Os 20 WhatsApp contam por signatário ou por documento?
   6. O webhook por cofre (v2) está disponível no Advanced?

## Fora de escopo

- D4Sign AI (200 créditos do plano): a API não tem chamada para ela.
- Arquivar na D4Sign o que não vai para assinatura (decisão 3).
- Documentos assinados no portal (decisão 6).
- Templates, lotes, power forms, tags, observadores, agendamento, hash e SSO
  da D4Sign.
- Posição da assinatura e rubricas no corpo (`addpins`): a D4Sign junta a
  folha de assinaturas. Reavaliar depois do spike.
- Assistente IA (enviar e consultar assinaturas): depois deste ciclo.
- Mais de um provedor de assinatura.
