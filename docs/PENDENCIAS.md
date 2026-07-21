# Pendências e Backlog Técnico — AdvTool

> Documento vivo. Atualizar conforme módulos forem implementados.
> Última atualização: 2026-07-08

---

## Módulo: Clientes

### Implementado ✅

- Listagem com filtros (área jurídica, busca)
- Cadastro PF/PJ com múltiplos contatos (useFieldArray)
- Edição e exclusão com confirmação
- CNPJ lookup via BrasilAPI (`/api/cnpj`)
- CEP lookup via ViaCEP
- Tabela `client_contacts` com RLS
- Pendências (campos faltantes) com badge na sidebar
- Página `/pendencias` com resolução inline

### Pendente 🔴

| Item                                            | Motivo / Desbloqueio                                               |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| CPF lookup                                      | Requer API paga (Serpro / Netlex) — botão mostra toast informativo |
| Aba "Casos" no ClienteDetailModal               | Depende do módulo Processos                                        |
| Aba "Financeiro" no ClienteDetailModal          | Depende do módulo Financeiro                                       |
| Pendências de Processos na página `/pendencias` | Depende do módulo Processos                                        |
| Paginação/virtualização na listagem             | Necessário com > 200 clientes                                      |

---

## Módulo: Processos (CRM Kanban)

### Implementado ✅ (Fase 1 — em andamento)

- UI Kanban completa (dnd-kit drag-and-drop)
- Modal CasoModal com 9 abas
- WorkflowSelector (Negociação / Processos)

### Pendente Fase 1 🔴 (imediato)

- Migração `20260101000009_cases.sql` — tabelas `cases`, `case_movements`; FK em tasks/events
- Tipos `CaseWithRelations`, `CaseMovement` em `src/types/case.types.ts`
- Schema Zod `caseSchema` em `src/schemas/case.schema.ts`
- Rota `/api/buscaprocessos/processos/[cnj]` — CNJ lookup via BuscaProcessos
- Service `src/features/crm/services/cases.service.ts` — CRUD Supabase
- Hooks `useCases`, `useCaseMutations`
- Formulário `CasoForm.tsx` — criar/editar caso com busca CNJ
- Migrar store `casos.store.ts` para UI state apenas (dados via React Query)
- Atualizar `CrmKanbanBoard`, `CrmKanbanColumn`, `SortableCasoCard`, `CasoCard`, `CasoModal` para `CaseWithRelations`

### Pendente Fase 2 🟡 (próximo sprint)

| Item                                     | Motivo / Desbloqueio                       |
| ---------------------------------------- | ------------------------------------------ |
| Aba Timeline no CasoModal                | Precisa `case_movements` populados         |
| Aba Tarefas no CasoModal                 | Precisa `tasks.case_id` + UI de criação    |
| Aba Agenda no CasoModal                  | Precisa `events.case_id` + UI de criação   |
| Aba Documentos no CasoModal              | Precisa storage + `case_id` em attachments |
| Aba Financeiro no CasoModal              | Depende módulo Financeiro                  |
| Aba Comentários no CasoModal             | Precisa tabela `case_comments`             |
| Aba Cliente no CasoModal com dados reais | Fase 1 implementa dados reais              |

### Pendente Fase 3 🟢 (futuro)

| Item                                    | Detalhe                                                              |
| --------------------------------------- | -------------------------------------------------------------------- |
| Monitoramento BuscaProcessos            | `POST /api/buscaprocessos/monitoramentos` ao criar caso; webhook em `/api/webhooks/buscaprocessos` |
| Motor de prazos CPC                     | Tabela de regras CPC; auto-cria tarefas de prazo                     |
| Auto-criação tasks/events de intimações | Integrado ao motor de prazos                                         |
| Notificações push de prazos             | Via Supabase Realtime + browser notifications                        |

---

## Módulo: Financeiro

### Implementado ✅

- Tela de fluxo de caixa (mock data, CSS puro)
- Movimentações mensais + por área/advogado

### Pendente 🔴

| Item                                   | Motivo / Desbloqueio                   |
| -------------------------------------- | -------------------------------------- |
| Tabela `financial_entries` no Supabase | Requer design da schema                |
| InfinityPay webhook (boletos emitidos) | Requer webhook endpoint + segredo HMAC |
| ASAAS integration (opcional)           | Alternativa ao InfinityPay             |
| Vinculação de receitas a casos         | Depende módulo Processos (case_id)     |
| Relatório exportável (PDF/XLSX)        | Funcionalidade futura                  |

---

## Módulo: DocuSign

### Implementado ✅

- Nenhum

### Pendente 🔴

| Item              | Detalhe                                         |
| ----------------- | ----------------------------------------------- |
| OAuth DocuSign    | App registration no DocuSign Developer          |
| Envio de envelope | Via DocuSign REST API v2                        |
| Status tracking   | Webhook de status (completed, declined, voided) |
| UI de envio       | Seleção de documento + signatários              |

---

## Módulo: DDA (Débito Direto Autorizado)

### Status: Baixa prioridade

| Item                       | Detalhe                                      |
| -------------------------- | -------------------------------------------- |
| Integração bancária DDA    | Alta complexidade — requer parceiro bancário |
| Análise boletos escritório | Identificar boletos de custas processuais    |

---

## Infraestrutura / Transversal

| Item                               | Prioridade | Detalhe                                      |
| ---------------------------------- | ---------- | -------------------------------------------- |
| Variáveis de ambiente documentadas | Alta       | `.env.example` com todas as vars necessárias |
| `BUSCA_PROCESSOS_API_KEY`          | Alta       | Obter chave em buscaprocessos.app.br/dashboard |
| Supabase RLS review                | Média      | Garantir que nenhum dado vaza entre usuários |
| Testes E2E (Playwright)            | Baixa      | Cobertura dos fluxos principais              |
| Rate limiting no `/api/cnpj`       | Média      | Evitar abuso da BrasilAPI                    |

---

## Decisões Técnicas Registradas

| Decisão                                           | Razão                                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| Tudo em Next.js + Supabase, sem API Node separada | Simplicidade de deploy; Supabase Edge Functions cobrem os casos de polling   |
| WORKFLOWS como config estática (mock)             | Configuração de workflow é pouco frequente; UI de edição não priorizada      |
| CPF lookup não implementado                       | Requer API paga (Serpro R$0,15/consulta ou Netlex)                           |
| BrasilAPI para CNPJ                               | Gratuita, sem autenticação, dados da Receita Federal                         |
| `case_movements` com `source` enum                | Distingue movimentos manuais (`'manual'`) de movimentos via BuscaProcessos (`'busca_processos'`) |
| Tags como `text[]` no Postgres                    | Simples, sem tabela de junção; tags são valores fixos (enum-like)            |
