# Planejamento Técnico — AdvTool

> Documento gerado após reunião com cliente (escritório de advocacia).
> Data: 2026-07-07 | Status: Em validação

---

## Contexto

- Ferramenta de uso **interno** de um único escritório
- Stack: Next.js + TypeScript + Supabase
- Modelo de negócio futuro: SaaS (não escopo atual)
- Prioridade imediata: **Clientes** e **Processos/Intimações**

---

## 1. Módulos e Features

### 1.1 Clientes ⭐ Prioridade 1

| Feature                       | Descrição                                              | Complexidade |
| ----------------------------- | ------------------------------------------------------ | ------------ |
| Múltiplos contatos            | Vários emails e telefones por cliente, todos opcionais | Baixa        |
| Busca por CPF                 | Auto-preencher dados ao cadastrar (via API)            | Média        |
| Campos opcionais              | Nenhum campo deve bloquear o cadastro                  | Baixa        |
| Tarefas vinculadas ao cliente | Tarefa pode ter cliente sem ter processo               | Baixa        |
| Módulo de Pendências          | Alertar campos importantes não preenchidos             | Média        |

**Campos obrigatórios (sem eles → aparece na tela de pendências):**

- Nome completo
- CPF ou CNPJ
- Pelo menos 1 telefone

**Campos complementares (opcionais, mas monitorados):**

- Email
- Endereço completo

---

### 1.2 Processos + Intimações ⭐ Prioridade 1

| Feature                        | Descrição                                              | Complexidade |
| ------------------------------ | ------------------------------------------------------ | ------------ |
| Cadastro com número CNJ        | Validar formato CNJ ao cadastrar                       | Baixa        |
| Busca automática no CNJ        | Puxar dados do processo pelo número via API DataJud    | Alta         |
| Importar movimentações         | Trazer histórico de movimentações do processo          | Alta         |
| Detecção de intimações         | Identificar novas intimações nas movimentações         | Alta         |
| Auto-criar tarefa de intimação | Gerar tarefa atribuída ao advogado do processo         | Média        |
| Auto-criar evento na agenda    | Gerar evento com prazo calculado automaticamente       | Média        |
| Motor de prazos                | Calcular prazo padrão por tipo de intimação            | Alta         |
| Atualização periódica          | Job que busca movimentações novas automaticamente      | Alta         |
| Módulo de Pendências           | Alertar campos importantes não preenchidos no processo | Média        |

**Campos obrigatórios do processo (sem eles → pendência):**

- Número CNJ
- Tribunal
- Vara / Juízo
- Advogado responsável
- Cliente vinculado
- Área jurídica
- Partes (requerente + requerido)

**Motor de prazos — Tabela inicial (validar com cliente):**

| Tipo de intimação               | Prazo padrão                  | Base legal     |
| ------------------------------- | ----------------------------- | -------------- |
| Contestação                     | 15 dias úteis                 | CPC art. 335   |
| Réplica / Manifestação genérica | 15 dias úteis                 | CPC art. 351   |
| Recurso de Apelação             | 15 dias úteis                 | CPC art. 1.003 |
| Agravo de Instrumento           | 15 dias corridos              | CPC art. 1.003 |
| Embargos de Declaração          | 5 dias úteis                  | CPC art. 1.023 |
| Cumprir diligência              | 5 dias úteis                  | —              |
| Audiência (lembrete)            | -2 dias antes                 | —              |
| Intimação não identificada      | 15 dias úteis (padrão seguro) | —              |

> ⚠️ **Ação requerida:** validar e ajustar esta tabela com o advogado responsável antes da implementação.

---

### 1.3 Financeiro 🔵 Prioridade 2

| Feature                     | Descrição                                      | Complexidade |
| --------------------------- | ---------------------------------------------- | ------------ |
| InfinityPay Webhook         | Receber eventos de cobranças e pagamentos      | Média        |
| ASAAS — Emissão             | Criar cobranças e boletos via ASAAS            | Alta         |
| ASAAS — Webhook             | Receber confirmações de pagamento              | Média        |
| DDA — Boletos do escritório | Buscar boletos a pagar via Open Banking        | Alta         |
| Conciliação automática      | Cruzar pagamentos recebidos com casos/clientes | Alta         |

---

### 1.4 Documentos + DocuSign 🔵 Prioridade 2

| Feature                          | Descrição                                    | Complexidade |
| -------------------------------- | -------------------------------------------- | ------------ |
| Upload de documentos por caso    | Já parcialmente existente no mock            | —            |
| Envio para assinatura (DocuSign) | Enviar doc via API DocuSign                  | Alta         |
| Webhook de status                | Receber notificação quando assinado          | Média        |
| Notificação interna              | Alertar advogado responsável quando assinado | Baixa        |

---

### 1.5 Módulo de Pendências 🔵 Prioridade 2

Tela única (ou badge no menu) mostrando todos os registros com campos importantes faltando.

**Comportamento:**

- Lista clientes com campos obrigatórios vazios
- Lista processos com campos obrigatórios vazios
- Cada item clicável leva direto ao registro para edição
- Contador de pendências no menu lateral
- Não impede o cadastro — apenas alerta

---

## 2. Avaliação de Integrações

### 2.1 CNJ — DataJud API

| Item         | Detalhe                                                                     |
| ------------ | --------------------------------------------------------------------------- |
| Custo        | **Gratuito** (API pública do CNJ)                                           |
| Documentação | [datajud.cnj.jus.br](https://datajud.cnj.jus.br)                            |
| Autenticação | API Key (solicitada via formulário ao CNJ)                                  |
| Cobertura    | Maioria dos tribunais (TJ, TRT, TRF, STJ, STF)                              |
| Limitações   | Rate limit não publicado; alguns tribunais têm delay                        |
| Esforço      | **Alto** — parsing de movimentações, detecção de intimações, job de polling |
| Risco        | Médio — formato de resposta pode variar por tribunal                        |
| Recomendação | ✅ Usar como fonte primária                                                 |

### 2.2 Escavador (ou alternativa)

| Item                           | Detalhe                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Custo                          | Pago — planos a partir de ~R$ 300/mês                                                                                     |
| Alternativas gratuitas/baratas | **JusBrasil** (sem API oficial), **Aurum Research API**, scrapers de PJe                                                  |
| Esforço                        | Médio (API bem documentada no Escavador)                                                                                  |
| Valor agregado                 | Monitora automaticamente; enriquece dados além do CNJ                                                                     |
| Recomendação                   | ⚠️ Avaliar custo-benefício. Para MVP, CNJ DataJud é suficiente. Escavador agrega mais dados de movimentação em tempo real |

### 2.3 Busca por CPF — Alternativas à Netlex

| Opção         | Custo               | Dados retornados                   | Recomendação                      |
| ------------- | ------------------- | ---------------------------------- | --------------------------------- |
| **BrasilAPI** | Gratuito            | Nome, situação cadastral (Receita) | ✅ Para MVP — nome + validação    |
| **ReceitaWS** | Gratuito (limitado) | Dados básicos da Receita Federal   | ✅ Complementar                   |
| **Serpro**    | Pago (gov)          | CPF, nome, filiação, situação      | Melhor qualidade, mas burocrático |
| **Netlex**    | Pago                | Dados completos + OAB              | Avaliar contrato                  |
| **APIBrasil** | Freemium            | Dados básicos                      | Alternativa viável                |

**Recomendação MVP:** BrasilAPI + ReceitaWS — gratuitos, suficientes para pré-preencher nome e validar CPF.

### 2.4 InfinityPay — Webhook

| Item         | Detalhe                                                               |
| ------------ | --------------------------------------------------------------------- |
| Custo        | Sem custo adicional (já cliente)                                      |
| Integração   | Webhook para eventos: pagamento confirmado, estornado, pendente       |
| Esforço      | **Médio** — endpoint de recebimento + parser + match com cliente/caso |
| Risco        | Baixo — webhook padrão REST                                           |
| Recomendação | ✅ Implementar                                                        |

### 2.5 ASAAS

| Item         | Detalhe                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| Custo        | Taxa por transação (sem mensalidade no plano básico)                    |
| Documentação | Excelente — API REST bem documentada                                    |
| Features     | Emissão de boleto, PIX, cartão, assinatura recorrente, webhook          |
| Esforço      | **Alto** — criação de clientes no ASAAS, emissão, webhooks, conciliação |
| Risco        | Baixo — API madura e estável                                            |
| Recomendação | ✅ Implementar no módulo financeiro                                     |

### 2.6 DDA — Débito Direto Autorizado (boletos do escritório)

| Item               | Detalhe                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| O que é            | Sistema do Banco Central para consultar boletos registrados em nome de um CNPJ                                 |
| Acesso direto      | Somente via banco com API Open Finance                                                                         |
| Opções via API     | **Pluggy**, **Belvo**, **Open Finance Brasil**                                                                 |
| Custo Pluggy/Belvo | ~R$ 0,50–2,00 por consulta ou plano mensal                                                                     |
| Esforço            | **Alto** — autenticação Open Finance é complexa                                                                |
| Risco              | **Alto** — depende do banco ter aderido ao Open Finance                                                        |
| Recomendação       | ⚠️ Adiar para pós-MVP. Alta complexidade, baixo retorno imediato. Avaliar Pluggy como alternativa mais simples |

### 2.7 DocuSign

| Item         | Detalhe                                                       |
| ------------ | ------------------------------------------------------------- |
| Custo        | Já cliente — sem custo adicional de licença                   |
| Integração   | API REST + Webhooks (Connect)                                 |
| Esforço      | **Alto** — fluxo de envelope, signatários, callback de status |
| Risco        | Baixo — API bem documentada e madura                          |
| Recomendação | ✅ Implementar no módulo de documentos                        |

---

## 3. Estimativa de Esforço

> Referência: 1 sprint = 5 dias úteis de desenvolvimento solo.

### Sprint 1–2: Módulo Clientes (10 dias)

| Task                                                                 | Dias        |
| -------------------------------------------------------------------- | ----------- |
| Refatorar cadastro de cliente (múltiplos contatos, campos opcionais) | 2           |
| Integração BrasilAPI/ReceitaWS — busca por CPF                       | 2           |
| Tarefas opcionalmente vinculadas a cliente (sem processo)            | 1           |
| Schema de banco (Supabase) para contatos múltiplos                   | 1           |
| Módulo de Pendências — clientes                                      | 2           |
| Testes e ajustes                                                     | 2           |
| **Total**                                                            | **10 dias** |

### Sprint 3–6: Módulo Processos + Intimações (20 dias)

| Task                                                          | Dias        |
| ------------------------------------------------------------- | ----------- |
| Solicitar e configurar API Key CNJ DataJud                    | 1           |
| Service de busca de processo por número CNJ                   | 3           |
| Parser de movimentações + detecção de intimações              | 5           |
| Motor de prazos (tabela de tipos + cálculo de dias úteis)     | 3           |
| Auto-criação de tarefa + evento ao detectar intimação         | 3           |
| Job de polling periódico (cron Supabase ou Next.js API route) | 2           |
| Módulo de Pendências — processos                              | 2           |
| Testes e ajustes                                              | 1           |
| **Total**                                                     | **20 dias** |

### Sprint 7–9: Financeiro (15 dias)

| Task                                               | Dias        |
| -------------------------------------------------- | ----------- |
| InfinityPay webhook endpoint + parser              | 3           |
| ASAAS — criação de clientes e emissão de cobranças | 4           |
| ASAAS — webhook de confirmação de pagamento        | 2           |
| Conciliação manual (match cobrança ↔ caso)         | 3           |
| UI — tela de cobranças e status                    | 3           |
| **Total**                                          | **15 dias** |

### Sprint 10–11: DocuSign (10 dias)

| Task                                              | Dias        |
| ------------------------------------------------- | ----------- |
| Configurar app DocuSign (OAuth + Connect webhook) | 2           |
| Envio de documento para assinatura                | 3           |
| Webhook — receber evento de assinatura            | 2           |
| Notificação interna ao advogado                   | 1           |
| UI — status de assinatura no documento            | 2           |
| **Total**                                         | **10 dias** |

### DDA — Não escopo MVP (estimativa futura: 8–12 dias)

---

## 4. Resumo de Esforço Total

| Módulo                              | Dias estimados        | Prioridade |
| ----------------------------------- | --------------------- | ---------- |
| Clientes (refatoração + pendências) | 10                    | ⭐ 1       |
| Processos + Intimações              | 20                    | ⭐ 1       |
| Financeiro (InfinityPay + ASAAS)    | 15                    | 🔵 2       |
| DocuSign                            | 10                    | 🔵 2       |
| DDA                                 | 8–12                  | 🔴 Pós-MVP |
| **Total MVP (P1+P2)**               | **~55 dias úteis**    |            |
| **Total com DDA**                   | **~65–67 dias úteis** |            |

---

## 5. Riscos e Decisões Pendentes

| #   | Risco / Decisão                                      | Impacto | Ação                                                                     |
| --- | ---------------------------------------------------- | ------- | ------------------------------------------------------------------------ |
| 1   | Tabela de prazos por tipo de intimação não validada  | Alto    | Validar com advogado antes de implementar o motor                        |
| 2   | API DataJud pode ter rate limit agressivo em polling | Médio   | Implementar cache + polling inteligente (só busca se houve movimentação) |
| 3   | Escavador vs CNJ — cobertura de processos            | Médio   | Definir se CNJ sozinho é suficiente ou precisa de complemento pago       |
| 4   | DDA depende de Open Finance do banco específico      | Alto    | Confirmar banco do escritório e verificar aderência ao Open Finance      |
| 5   | Múltiplos sistemas de pagamento — conciliação manual | Médio   | Definir se conciliação será automática ou manual no MVP                  |
| 6   | DocuSign — conta e permissões de OAuth configuradas  | Baixo   | Levantar credenciais da conta com o cliente                              |

---

## 6. Próximos Passos Imediatos

1. ✅ **Validar tabela de prazos** com o advogado responsável
2. ✅ **Solicitar API Key DataJud** (formulário no site do CNJ)
3. ✅ **Levantar credenciais DocuSign** (Client ID + Secret da conta)
4. ✅ **Decidir: Escavador ou apenas CNJ DataJud no MVP?**
5. ✅ **Confirmar banco do escritório** para viabilidade do DDA
6. 🚀 **Iniciar Sprint 1** — Módulo Clientes

---

_Documento vivo — atualizar conforme validações e decisões do cliente._
