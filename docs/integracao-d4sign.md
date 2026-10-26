# Integração D4Sign — assinatura eletrônica em Contratos e Documentos

> **Status:** plano e decisões técnicas aprovados em 2026-10-21. Em 2026-10-22
> o plano da conta foi corrigido para o Advanced e o WhatsApp entrou na v1. A
> Fase 1 (fundação) começou antes do spike, a pedido: a migration fica escrita
> e só é aplicada depois dele. Sem acesso ao sandbox, o spike leu a produção
> (só leitura) e mudou o desenho dos cofres — decisão 8. O que cria ou envia
> segue dependendo da conta de teste — ver "Antes do spike".
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
| 7 | Spike | **No sandbox** | Conta de teste separada; nenhuma chamada na conta real antes do spike. Em 2026-10-22, sem acesso ao sandbox, o usuário liberou **só leitura** na produção |
| 8 | Cofres | **Um por tipo, sugerido no envio** (2026-10-22, depois de ver os 15 cofres da conta) | Configurações liga cada tipo de envio a um cofre, com sugestão pelo nome; o envio sugere e deixa trocar; a pasta do cliente fica dentro do cofre; o webhook passa a ser registrado em cada documento |

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
| Webhook | `POST /webhooks/v2/` (`type`: `cofre` ou `documento`, `uuid`, `url`); o `GET` com `type` e `uuid` lê o registrado | **Por documento**, no envio (decisão 8): com 15 cofres, registrar um por cofre esbarraria no limite, e assim só chegam avisos do que o app mandou |
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
  `3` cancelado · `4` um signatário assinou. Chegam em
  `application/x-www-form-urlencoded; charset=utf-8` (visto no spike).
- Versão 2.0 acrescenta `event_datetime` e, conforme o evento: `signers[]`
  (`uuid`, `email`, `name`, `signed_at`, `identification_number`), `signer`,
  `error_details`, `cancellation_message`. No aviso real, `event_datetime` veio
  **sem fuso, em horário de Brasília** (`2026-10-22T22:19:52`), e não com o `Z`
  da documentação.
- Retentativas: na hora, depois de 1 h, 1 h, 1 h, 6 h, 6 h e 12 h — até ~27 h.
- **Segurança:** a documentação fala em `Content-Hmac: sha256=<hex>`, mas o
  aviso real trouxe **`x-signature: <hex>`**, sem prefixo. É o HMAC-SHA256 **só
  do UUID do documento** com a "Secret Key MAC" (gerada em Dev API) **lida como
  texto**. O corpo não é assinado. Origem vista: `18.229.93.53`, com
  `User-Agent: Webhook-Worker/1.0` (a central de ajuda cita `54.94.40.55`).

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
- ~~O webhook v2 manda o formato 2.0? Em form-data ou JSON?~~ Urlencoded, no
  formato 2.0 (spike). Ainda em aberto: em quanto tempo responder.
- Quanto tempo vale a URL do download, e o que vem no PDF (folha de
  assinaturas, carimbo).
- O limite é por método ou total? Que status HTTP volta ao estourar?
- A conversão de DOCX respeita o papel timbrado?
- O Embed tem host próprio no sandbox? Exige domínio cadastrado? Convive com
  `skip_email = 0`?
- ~~Upload sem envio, ou documento cancelado, conta na cota mensal?~~ Não
  (spike: `sent` 4 → 4 → 4).
- O signatário recebe a via final por e-mail sozinho?
- Nome de pasta repetido no mesmo cofre: aceito ou recusado? (`d4sign_folders`
  liga pelo `client_id`, então homônimos geram duas pastas de mesmo nome.)
- ~~A "Secret Key MAC" entra no HMAC como texto ou como bytes?~~ Como texto
  (spike) — a leitura em bytes saiu do código.

## O que o spike mostrou (2026-10-22 — produção, só leitura)

O sandbox ficou de fora: as chaves colocadas no `.env` eram da produção (o
sandbox as recusou com 401) e o usuário não conseguiu entrar na conta de
testes. Decisão do usuário: ler a produção, sem criar documento nem gastar
envio. As respostas cruas, com as chaves mascaradas, ficaram no scratchpad da
sessão.

| Pergunta | Resposta |
|---|---|
| Formato das chaves | Token `live_` + 64 hexa; cryptKey `live_crypt_` + 32. As do sandbox, na produção ou vice-versa, voltam `401 {"mensagem_pt":"Chave de API inválida."}` |
| `GET /account/balance` | `{"credit":"20","sent":4,"used_balance":"4/20","sms":{…},"whatsapp":{"credit_whatsapp":null,"sent_whatsapp":0,…}}` — `credit` em **texto** e `sent` em **número**. 20 é a cota mensal do plano. O WhatsApp não informa crédito (`null`) |
| `GET /safes` | **`uuid_safe`**, com sublinhado (a documentação diz `uuid-safe`), e `name-safe`, com hífen. O schema da fase 1 recusou — corrigido para aceitar as duas grafias |
| Cofres da conta | **15, um por tipo de documento**: Contratos de Honorários, Procurações, Outras procurações, Declarações de Hipossuficiência, Declaração, Aditivos, Acordo, Petições, Termo de Renúncia, Revogação de mandato, Contrato de Locação Anual, Contratos A. Temporada, Contratos de Parceria, Contratos diversos e Outros documentos |
| `GET /folders/{cofre}/find` | `[]` nos três cofres lidos: o escritório não usa pastas hoje |
| `GET /webhooks/v2/?type=cofre&uuid=…` | `{"type":"cofre","uuid":…,"webhook_url":"Sem Cadastro!!!","history":[]}` — sem webhook, a URL vem como o texto `"Sem Cadastro!!!"`. O `history` deve listar as entregas: serve de diagnóstico do lado da D4Sign |
| Latência | ~10 s por chamada, mas **da rede desta máquina** — o Google levou 8,8 s para conectar no mesmo minuto. Duas chamadas caíram no tempo de conexão do `fetch` (10 s) e foram repetidas. O cliente passou a esperar 30 s, e as rotas, `maxDuration = 60` |

### Parte 2 — um documento fictício, sem envio (2026-10-22)

Com ok do usuário: um DOCX fictício ("TESTE advtool - documento ficticio -
cancelar.docx", com cabeçalho, rodapé, tabela e acentos) no cofre "Outros
documentos", **sem signatário e sem envio**, cancelado no fim. Os avisos foram
recebidos por um túnel temporário da Cloudflare (`cloudflared`, assinatura
digital da Cloudflare conferida; a rede daqui bloqueia QUIC, então foi por
HTTP/2) até um receptor local que só gravava em arquivo.

| Pergunta | Resposta |
|---|---|
| `POST /documents/{cofre}/upload` | `200 {"message":"success","uuid":"…"}`. O nome perde o ponto da extensão: "… cancelar.docx" vira "… cancelar docx" |
| Depois do upload | Fase 2, "Aguardando Signatários". O upload não gera aviso |
| `GET /documents/{uuid}` | **Lista** com um objeto: `uuidDoc`, `nameDoc`, `type`, `size`, `pages`, `uuidSafe`, `safeName`, `statusId`, `statusName`, `statusComment`, `whoCanceled`. `statusId` vem em **texto** (`"2"`, `"6"`) |
| `POST /webhooks/v2/` com `type: documento` | Aceito pela lib da fase 1 |
| `GET /webhooks/v2/?type=documento&uuid=…` | O endereço registrado e o `history`. Depois do aviso: `[{"event":"event.cancelled","status":"success","attempts":"1","payload":"<o JSON enviado>"}]` — dá para diagnosticar a entrega do lado da D4Sign |
| `POST /documents/{uuid}/generate-document-view` | `{"doc_principal": "<página HTML>"}` — um iframe que transmite o PDF a partir de um link do S3 válido por 300 s, **com a chave de criptografia do arquivo no próprio link**: tratar como segredo, só abrir numa aba e nunca gravar. Com o documento cancelado: **200 com `{"message":"Document unavailable."}`** — erro com cara de sucesso |
| `POST /documents/{uuid}/cancel` (`comment`) | 200 com o documento: `statusId: 6` (aqui em **número**), `statusName: "Cancelado"`, `statusComment` = o comentário. Lido depois, `whoCanceled` traz o e-mail da conta |
| Cota | `sent` 4 → 4 → 4: **upload e cancelamento não gastam envio** |
| O aviso de cancelamento | Chegou um, segundos depois: `POST` urlencoded (`charset=utf-8`), `User-Agent: Webhook-Worker/1.0`, de `18.229.93.53`. Corpo no formato 2.0: `uuid`, `type_post=3`, `message=Cancelled document`, `event_datetime=2026-10-22T22:19:52` (sem fuso, horário de Brasília), `document_name` e `cancellation_message` |
| A assinatura do aviso | **`x-signature: <hex>`**, e não `Content-Hmac: sha256=…` como diz a documentação. É o HMAC-SHA256 do UUID com a Secret Key MAC **lida como texto** (as outras leituras testadas — corpo, chave em bytes — não batem) |

**O que mudou no código por causa disso:** a rota da fase 1 lia só
`Content-Hmac` e teria recusado (401) todo aviso real. Agora lê `x-signature`,
com `Content-Hmac` de reserva, e a chave só como texto. O aviso real foi
repassado pela rota corrigida, com o banco simulado: assinatura verdadeira
aceita, adulterada e ausente recusadas.

Ainda sem resposta: a conversão do DOCX (a prévia do documento cancelado não
abre mais; ver de novo pede outro documento fictício) e tudo o que depende de
envio — `createlist` e `key_signer`, assinatura, finalização, download do
assinado e se o limite é por método. Fica para o sandbox, ou para a produção
com teto se o usuário decidir.

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

**Pastas:** `<cofre do tipo>/<nome do cliente>` — "Procurações/Maria Silva",
"Contratos de Honorários/Maria Silva" —, criadas no primeiro envio do cliente
para aquele cofre e guardadas em `d4sign_folders` (por `client_id`, então
homônimos não se confundem). Contrato do escritório vai para "Escritório"; documento sem
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
- **Cofre:** o do tipo do contrato (Configurações → Assinatura), trocável no
  envio — um aditivo vai para "Aditivos".
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
2. Garante a pasta do cliente no cofre escolhido.
3. Lê o arquivo do Storage e faz o upload → guarda o `external_id`.
4. Registra o webhook no documento (`POST /webhooks/v2/`, `type: documento`).
5. `createlist` → guarda o aplicado de cada signatário e o `key_signer`.
6. `sendtosigner` → `sent`.
7. O contrato vai para `aguardando_assinatura` **pelo client de sessão**, para
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
   (horário de Brasília — o `event_datetime` do aviso já vem nele, sem fuso;
   na falta dela, a data da confirmação). Em qualquer
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
| Configurar (uma vez) | cofres e saldo |
| Primeiro envio de um cliente para um cofre | +1 ou 2 (criar ou renomear a pasta) |
| Enviar | 4: `upload`, webhook do documento, `createlist`, `sendtosigner` |
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
   - HMAC do UUID, lido de `x-signature` (com `Content-Hmac` de reserva) e
     comparado em tempo constante;
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
   produção. Um envio de teste feito no dev registraria no documento o
   endereço da produção. A tela mostra o endereço que vai ser usado, e
   `D4SIGN_WEBHOOK_URL` aponta outro.

## Modelo de dados — migration `20260101000079_d4sign_signatures.sql`

Número a reconferir ao criar: a 78 é a última hoje, e 77 e 78 ainda não foram
aplicadas no remoto.

**`office_settings`:** `d4sign_safes jsonb` (o cofre de cada tipo de envio,
com `padrao` para o resto — decisão 8), `d4sign_features jsonb` (`whatsapp`,
`pix`, `selfie`, `video_selfie`, `score`, `icp`, `embed`) e o último saldo
lido (`d4sign_balance_credit`, `d4sign_balance_sent`,
`d4sign_balance_checked_at`). Nada disso é segredo: um cofre não autentica
nada sem as chaves. Não há coluna de webhook: ele vai em cada documento.

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
| `failed_step` | `folder` · `upload` · `webhook` · `signers` · `send` — de onde "Tentar de novo" continua |
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
  (sandbox ou produção, pelo host), se há endereço e segredo para os avisos,
  o cofre de cada tipo de envio (sugerido pelo nome), "Testar conexão" com o
  saldo e as chaves dos recursos do plano, com o aviso de que a API não
  informa o plano.
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
| `schemas.ts` | Respostas de cofres, saldo e pasta, aceitando lista ou objeto e número ou texto. Cofre com `uuid_safe` (a produção) ou `uuid-safe` (a documentação) |
| `account.ts` | Cofres, saldo e o webhook 2.0 de um documento, que a fase 2 registra no envio |
| `safeRoutes.ts` | O mapa tipo → cofre: a sugestão pelo nome (igual > começa com > contém, sem acento — "Procurações" ganha de "Outras procurações"), o cofre de um tipo com o padrão e o tipo de um contrato ou documento. Sem nada de servidor: serve à tela e ao envio |
| `folders.ts` | A pasta de cada cliente (e "Escritório", "Sem cliente"), criada no primeiro envio; renomear é cosmético e nunca para o envio. Sem chamador até a fase 2 |
| `webhook.ts` | O corpo em multipart, urlencoded ou JSON; a assinatura de `x-signature` (com `Content-Hmac` de reserva) conferida contra o HMAC do UUID, com a chave como texto — o formato do aviso real do spike; os cabeçalhos de diagnóstico |
| `http.ts` | Erro da D4Sign → resposta da rota (chave recusada é 502, não 401) |

Rotas:
- `POST /api/webhooks/d4sign`: autentica, procura o envio e grava em
  `webhook_events` (`provider = 'd4sign'`). 401 com HMAC errado, 503 quando
  não grava ou não consegue procurar, 200 para o resto. Com o ambiente em
  sandbox, as entregas ficam `is_test`. Nenhum evento é processado ainda.
- `GET /api/assinaturas/d4sign/cofres` e `POST /api/assinaturas/d4sign/saldo`,
  as duas com `configuracoes:manage` e `maxDuration = 60`. O mapa de cofres e
  os recursos do plano a tela grava direto em `office_settings` (a RLS já
  exige `configuracoes:manage`): um UUID errado só faria a D4Sign recusar o
  envio.

### Tela — Configurações → Assinatura

- Situação das chaves (sandbox ou produção, o que falta) e dos avisos (sem
  segredo, sem endereço ou prontos).
- Cofres por tipo: o mapa salvo; "Carregar cofres" / "Editar cofres" lista os
  cofres (1 chamada), sugere um por tipo pelo nome, marca o sugerido e só
  grava ao salvar. Sem o padrão, não salva; cofre que sumiu da conta é trocado
  por sugestão.
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
  da D4Sign e Supabase em memória): 46 verificações — hosts aceitos e
  recusados, endpoint com e sem `D4SIGN_WEBHOOK_URL`, chaves na query e fora
  de toda mensagem de erro, limite e cota reconhecidos até num 200, cofres e
  saldo nos formatos da documentação e no que a produção devolveu, o webhook
  do documento, a sugestão de cofres com os 15 nomes reais da conta, o corpo
  do webhook em multipart, urlencoded e JSON, a assinatura (certa, errada,
  maiúscula, com e sem prefixo, em `x-signature` ou `Content-Hmac`, chave em
  hexa lida como texto), pastas (criar, reaproveitar, renomear, recusa ao
  renomear, corrida) e as três rotas com seus códigos de resposta e o que
  gravam.
- **Contra a D4Sign de verdade** (ver "O que o spike mostrou"): saldo e
  cofres pela lib, que pegou `uuid_safe` × `uuid-safe`; um documento fictício
  com upload, webhook, prévia e cancelamento, sem envio; e o **aviso real** de
  cancelamento, que expôs `x-signature` × `Content-Hmac` e depois passou pela
  rota corrigida (assinatura verdadeira aceita, adulterada e ausente
  recusadas).
- **Tela** numa página temporária sob `/acompanhar` (já apagada), com sessão
  falsa e cache pré-carregado: os estados das chaves e dos avisos, a linha sem
  as colunas da migration, os cofres por tipo (sugestão com os 15 nomes reais,
  "Usar o padrão", troca manual tirando a marca de sugerido, o payload gravado,
  cofre que sumiu da conta, falha ao listar), saldo, recursos, perfil só de
  leitura sem botões, celular a 375 px sem rolagem lateral e os temas claro e
  escuro. O cartão da InfinitePay segue igual com o `StatusRow` compartilhado.
- **Não verificado:** a migration não rodou em nenhum Postgres, e nada que
  cria ou envia falou com a D4Sign — isso é o resto do spike.

## Como ficou a fase 2

Branch `feat/d4sign-contratos`, sobre a `feat/d4sign-base` (`5a719aa`),
adiantada antes do resto do spike a pedido (2026-10-26). O que o spike já
confirmou (upload, cancelamento, o formato do aviso, `x-signature`) entrou
como fato; o resto é lido com folga até o primeiro envio de verdade.

### Banco — migration 80 (escrita, NÃO aplicada)

`20260101000080_d4sign_send_flow.sql`, depende da 79:

- o trigger do histórico passa a aceitar o autor por
  `app.status_changed_by` quando não há sessão (`auth.uid()` vem primeiro);
- `finish_signature_request` — envio `signed`, signatários `signed` e o
  contrato `vigente` com a data de Brasília, numa transação. Só age sobre
  envio `sent`: o segundo caminho (aviso e "Atualizar status" juntos) recebe
  `finished = false` e desfaz a cópia que acabou de subir;
- `cancel_signature_request` — envio `canceled` e o contrato de volta a
  `rascunho`, se estava aguardando e não sobrou outro envio aberto. A origem
  (`d4sign`) ou quem clicou vão para o histórico;
- as duas sem `execute` para `anon`/`authenticated`: só o servidor chama.

⚠️ **Ordem do deploy:** 79 e 80 antes do código.

### Servidor — `src/lib/d4sign/`

| Arquivo | O que faz |
|---|---|
| `documents.ts` | O documento na D4Sign: upload (`uploadbigfile` acima de 20 MB, 90 s), os parâmetros de cada autenticação (tudo em texto), `createlist`, a lista de signatários procurada em profundidade (a resposta não é documentada), envio, fase, download (só o PDF, conferindo o `%PDF-`), cancelamento, reenvio e troca de e-mail |
| `send.ts` | O envio em passos — pasta, upload, webhook, signatários, envio —, gravando o progresso. "Tentar de novo" continua do passo que falhou, sem subir o arquivo outra vez. Sem endereço público ou sem a Secret Key MAC, segue sem registrar o webhook |
| `requests.ts` | Ler e gravar envio e signatários; os avisos do sino (só para quem vê o módulo do envio) |
| `storage.ts` | O arquivo que sobe e a cópia assinada que volta: no contrato, como `assinado`, autor = quem enviou |
| `finish.ts` | Finalizar, cancelar, "uma pessoa assinou", "e-mail não entregue" e o "Atualizar status". Finalizar e cancelar só depois de a API confirmar a fase — o aviso assina só o UUID; os outros dois são pista e não mexem no contrato |
| `deliveries.ts` | Processa um aviso já gravado e anota o resultado na mesma linha de `webhook_events` |
| `signers.ts` | A chave do signatário: a guardada ou a da lista da D4Sign |
| `routeGuard.ts` | Carrega o envio e confere a permissão do módulo dele; o contrato vai a "aguardando" pelo client de sessão, com o autor no histórico |

A rota do webhook grava e responde na hora; o processamento corre em
`after()` (`maxDuration = 60`, por causa do download). Falha ao processar
fica `error` na linha, sem a chave, e o "Atualizar status" refaz.

Rotas novas, todas com a permissão conferida antes de qualquer chamada:

| Rota | O que faz |
|---|---|
| `POST /api/assinaturas` | Envia um arquivo do contrato (`contratos:update`). Confere que o arquivo é do contrato e é PDF/Word, os recursos do plano ligados, o e-mail de login de quem assina pelo escritório e e-mail repetido; completa o e-mail da parte que não tinha. 409 com o arquivo já em assinatura ou com um envio dele parado num passo; 502 com o envio quando um passo falha |
| `…/[id]/tentar` | Continua um envio que falhou |
| `…/[id]/cancelar` | Cancela na D4Sign primeiro (se o documento chegou lá) e depois aqui, com o motivo |
| `…/[id]/atualizar` | Pergunta a fase: finaliza, cancela ou marca quem já assinou |
| `…/signatarios/[signerId]/reenviar` | Reenvia o link |
| `…/signatarios/[signerId]/email` | Troca o e-mail na D4Sign, no signatário e na parte do contrato |

**Um envio por vez:** o índice da 79 segura o envio aberto; o que falhou
também segura o arquivo (a rota recusa um novo), senão o "Tentar de novo"
dele bateria no índice. A tela esconde o botão enquanto o contrato tiver um
envio que não terminou.

### Tela — contrato

- "Enviar para assinatura" (o botão principal do rascunho, com a D4Sign
  configurada) abre o diálogo; mudar só o status vai para o menu, como "Só
  marcar como aguardando (assinatura por fora)".
- Diálogo: o arquivo (PDF/Word, a minuta primeiro), o cofre do tipo (dá para
  trocar, ou ver todos os da conta), quem assina a partir das partes — a do
  escritório vira o responsável, com o e-mail do login —, o papel, a
  autenticação (só as ligadas no plano), WhatsApp, prazo, ordem e mensagem, e
  quantos envios restam. Erro de um signatário diz de quem é.
- Seção "Assinatura": cada envio com o status, o passo e o motivo da falha,
  quem já assinou; "Atualizar status" (segura 2 minutos), "Tentar de novo",
  "Cancelar envio" com motivo; por signatário, "Reenviar" e "Corrigir e-mail".
- "Marcar como assinado" avisa quando há envio aberto.
- Sino: assinado por todos, cancelado na D4Sign, e-mail não entregue.

### Verificação

- `tsc --noEmit`, `pnpm lint` (sem erro; os avisos são de arquivos que a fase
  não tocou) e `pnpm build`. Nenhum valor das chaves no bundle do navegador.
- **No Node, com o código real** (o mesmo loader, agora com o client de
  sessão, o RPC, o Storage e o `after()` simulados): 42 verificações — os
  parâmetros de cada autenticação, a lista de signatários em envelopes
  diferentes, upload e arquivo grande, envio com prazo e ordem, cota, fase em
  texto ou número, download que não é PDF; os passos em ordem, sem webhook
  quando não há endereço ou segredo, falha no meio e a retomada sem novo
  upload, o índice batendo na retomada; finalizar (cópia no contrato, RPC,
  vigente, aviso), fase errada, o outro caminho chegando antes, erro no banco
  desfazendo a cópia; cancelar pela D4Sign; pistas de assinatura e de e-mail;
  "Atualizar status"; o aviso inteiro pela rota até o `after()`, sem a chave
  no log; e as seis rotas com permissão, validações (nenhuma gasta chamada),
  409, 502, desfazer o envio sem signatários e o autor pela sessão. As 46 da
  fase 1 continuam passando.
- **Tela** numa página temporária sob `/acompanhar` (já apagada): a seção com
  os quatro estados, o diálogo (e-mail cobrado com o nome de quem, só as
  autenticações do plano, o payload enviado), envio que falha fechando o
  diálogo e aparecendo como "Falhou", tentar de novo, atualizar com a espera,
  reenviar, corrigir e-mail e cancelar com motivo.
- **Não verificado:** nada desta fase falou com a D4Sign — a resposta do
  `createlist` (se traz `key_signer`), o aviso de "assinado" e de "e-mail não
  entregue" (onde vem o e-mail), o link de download e a validade dele, a
  conversão do DOCX e o limite por método. E as migrations 79 e 80 não rodaram
  em nenhum Postgres. É o primeiro envio de verdade, com a sua autorização.

## Como ficou a fase 3

Branch `feat/d4sign-documentos`, sobre a `feat/d4sign-contratos` (`fa5a4a4`),
adiantada a pedido (2026-10-26). Sem migration nova: o modelo da 79 e as
funções da 80 já serviam a documentos.

### Servidor

- `POST /api/assinaturas` aceita `contractId: null` — um documento avulso. A
  permissão vem do alvo do pedido (`contratos:update` ou `documentos:update`)
  e o arquivo confirma: arquivo de contrato só sai pelo contrato, anexo de
  lançamento não sai, documento que não existe é 404.
- O cliente da pasta é o do arquivo, o do caso ou, por último, o do primeiro
  signatário que é cliente (o caso do processo, cujas partes podem ser mais de
  um cliente). Sem nenhum, a pasta é "Sem cliente".
- O e-mail digitado não completa o cadastro do cliente: lá é outra
  permissão. Só a parte do contrato é completada, como na fase 2.
- A cópia assinada já ia ao lado do original, com os mesmos donos e a mesma
  categoria (`storage.ts`); o aviso do sino é de Documentos.
- `GET /api/assinaturas/disponivel` (`documentos:view`) responde só se a
  D4Sign está pronta — as abas de Documentos vivem dentro de telas de cliente,
  caso, processo e evento, longe de uma página de servidor que passe a
  informação.

### Tela

- O que era só do contrato virou `src/features/assinaturas/`: o serviço, os
  hooks (chaves em `['signatures']`), o diálogo de envio e a lista de envios
  com as ações. A seção do contrato usa a mesma lista.
- **Enviar:** o botão de assinatura aparece na página Documentos e nas abas
  Documentos (cliente, pessoa, caso, processo, evento) para PDF/Word avulso
  sem envio. O diálogo traz o arquivo fixo, o cofre da categoria e, como
  lista inicial, só os clientes ligados ao arquivo — o do próprio arquivo, o
  do caso e os do processo que são clientes —, assinando como "Signatário".
  Advogado entra só se incluído.
- **Selos:** "Em assinatura", "Envio parou", "Assinado" (com "ver a versão
  assinada") e "Cópia assinada". O de documento abre os envios dele, com as
  mesmas ações do contrato; o de arquivo de contrato leva à seção Assinatura
  do contrato. Os selos vêm de uma consulta à parte, não do `DOCUMENT_SELECT`:
  sem a migration 79, some o selo, não a lista.
- Excluir arquivo ou contrato em assinatura mostra a mensagem da trava do
  banco (`PT409`) com o que fazer, em vez do erro genérico.
- O papel 1 da D4Sign aparece como "Signatário" e o 7 como "Só acusa
  recebimento" ("Assina como assinar" saía antes).

### Verificação

- `tsc --noEmit`, `pnpm lint` (os mesmos avisos de antes, nenhum desta fase),
  `pnpm build`; nenhum valor das chaves no bundle do navegador.
- **No Node:** 11 verificações novas — a permissão pelo alvo, as recusas
  (contrato, lançamento, tipo, 404, arquivo pedido como de outro contrato), o
  cliente da pasta pelos três caminhos e "Sem cliente", as duas travas de
  envio repetido, 403 antes de tudo, a cópia assinada de um documento de
  processo (donos, categoria, pasta `processos/…`, aviso de Documentos), a
  rota de disponibilidade, os selos (mais novo não cancelado, cópia que saiu
  de novo) e a mensagem da trava. As 46 da fase 1 e as 42 da fase 2 continuam
  passando.
- **Tela** em páginas temporárias sob `/acompanhar` (já apagadas): a página
  Documentos e a aba do cliente com os selos e o botão só onde cabe, o
  diálogo de um documento (arquivo fixo, cofre de Procurações, o cliente com
  CPF e WhatsApp, o payload com `contractId: null`), o selo abrindo os envios
  com textos sem menção a contrato, o selo de contrato apontando para
  `#assinatura`, nada de botão com a D4Sign indisponível e a seção do contrato
  igual depois da mudança de lugar.
- **Não verificado:** o mesmo da fase 2 — nada falou com a D4Sign de verdade
  — e a consulta dos clientes do processo (`legal_process_parties` com
  `clients.is_client`) só rodou contra o cache, não contra o banco.

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

1. Criar a conta de teste em https://sandbox.d4sign.com.br/criar.html — é
   uma conta à parte: o login e as chaves da produção não valem lá.
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
   4. Quanto custa o envio além dos 20 do mês? (Upload e cancelamento não
      gastam envio — o spike mediu.)
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
