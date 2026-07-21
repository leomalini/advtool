# Módulo Processos (CRM) — Documentação Técnica

> Última atualização: 2026-07-08

---

## Visão Geral

O módulo Processos implementa o kanban de casos jurídicos ("CRM Jurídico").
Cada "Caso" representa um processo ou negociação vinculada a um cliente.

---

## Arquitetura

```
src/features/crm/
├── components/
│   ├── CrmWorkboard.tsx      ← orquestrador principal
│   ├── CrmKanbanBoard.tsx    ← dnd-kit + carrega casos do Supabase
│   ├── CrmKanbanColumn.tsx   ← coluna droppable
│   ├── SortableCasoCard.tsx  ← wrapper sortable para dnd-kit
│   ├── CasoCard.tsx          ← card do kanban (usa CaseWithRelations)
│   ├── CasoModal.tsx         ← modal de detalhes (9 abas)
│   ├── CasoForm.tsx          ← formulário criar/editar
│   └── WorkflowSelector.tsx  ← tabs de workflow
├── hooks/
│   ├── useCases.ts           ← React Query: getCasesByWorkflow, getCaseById
│   └── useCaseMutations.ts   ← create, update, move, delete, addMovement
├── services/
│   └── cases.service.ts      ← CRUD Supabase
└── stores/
    └── casos.store.ts        ← UI state apenas (modal open/selected)
```

---

## Banco de Dados

### Tabela: `public.cases`

```sql
id                uuid PK
client_id         uuid → clients.id (nullable)
title             text              -- título livre (opcional)
cnj_number        text              -- número CNJ formatado
court             text              -- ex: TJSP
court_division    text              -- ex: 3ª Vara do Trabalho de SP
legal_area        text              -- trabalhista | civel | etc
workflow_id       text NOT NULL     -- ID do workflow (config estática)
column_id         text NOT NULL     -- ID da coluna (config estática)
position          integer           -- ordem na coluna
assigned_to       uuid → profiles.id (nullable)
tags              text[]            -- array de EtiquetaId strings
next_deadline     date
next_task_summary text
plaintiff         text              -- requerente
defendant         text              -- requerido
opposing_counsel  text
notes             text
created_by        uuid NOT NULL → profiles.id
created_at        timestamptz
updated_at        timestamptz
```

### Tabela: `public.case_movements`

Movimentações processuais (intimações, decisões, etc).

```sql
id             uuid PK
case_id        uuid NOT NULL → cases.id CASCADE
movement_date  timestamptz NOT NULL
description    text NOT NULL
source         text CHECK ('manual' | 'busca_processos')
raw_data       jsonb       -- payload bruto do BuscaProcessos (se source=busca_processos)
created_at     timestamptz
```

### Alterações em tabelas existentes

```sql
-- Adicionado em migration 09
ALTER TABLE public.tasks  ADD COLUMN case_id uuid → cases.id SET NULL;
ALTER TABLE public.events ADD COLUMN case_id uuid → cases.id SET NULL;
```

---

## Tipos TypeScript

### `src/types/case.types.ts`

```typescript
interface Case { ... }
interface CaseWithRelations extends Case {
  client: CaseClientSummary | null
  assigned_profile: CaseProfileSummary | null
  movements: CaseMovement[]
}
interface CaseMovement { ... }
function getCaseClientName(c: CaseWithRelations): string
function getCaseDisplayTitle(c: CaseWithRelations): string
interface CnjLookupResult { ... }
```

---

## Schema Zod

### `src/schemas/case.schema.ts`

```typescript
export const caseSchema = z.object({
  title, client_id, cnj_number, court, court_division, legal_area,
  workflow_id, column_id, assigned_to, tags, next_deadline,
  next_task_summary, plaintiff, defendant, opposing_counsel, notes
})

export type CaseInput = z.infer<typeof caseSchema>
```

---

## API Routes

### `GET /api/buscaprocessos/processos/[cnj]`

Busca dados de um processo pelo número CNJ via BuscaProcessos.

**Requer:** `BUSCA_PROCESSOS_API_KEY` no `.env.local`
**Como obter:** https://buscaprocessos.app.br/dashboard

**Request:**
```
GET /api/buscaprocessos/processos/0000000-00.0000.8.26.0100
```

**Response (200):**
```json
{
  "cnj_number": "0000000-00.0000.8.26.0100",
  "court": "TJSP",
  "court_division": "3ª Vara Cível de SP",
  "plaintiff": "João Silva",
  "defendant": "Empresa XYZ Ltda",
  "subject": "Indenização por Danos Morais",
  "last_movement": "Juntada de Petição",
  "last_movement_date": "2026-06-15T10:30:00Z"
}
```

**Errors:**
- `401`: API key inválida
- `403`: Créditos insuficientes
- `404`: Processo não encontrado
- `422`: Número CNJ rejeitado
- `503`: BUSCA_PROCESSOS_API_KEY não configurada
- `504`: Timeout (30s)

### `GET /api/buscaprocessos/processos?cpf_cnpj={doc}`

Busca todos os processos vinculados a um CPF ou CNPJ.

### `GET /api/buscaprocessos/monitoramentos`
### `POST /api/buscaprocessos/monitoramentos`

Gerencia monitoramentos de processos (atualizações automáticas).

### `POST /api/webhooks/buscaprocessos`

Recebe eventos de novas movimentações. Requer `BUSCA_PROCESSOS_WEBHOOK_SECRET` para validação HMAC.
Para adicionar mais: `COURT_INDEX_MAP` em `src/app/api/cnj/[number]/route.ts`.

---

## Service Layer

### `src/features/crm/services/cases.service.ts`

| Função | Descrição |
|--------|-----------|
| `getCasesByWorkflow(workflowId)` | Lista casos de um workflow com client + profile + movements |
| `getCaseById(id)` | Busca caso por ID |
| `createCaseRecord(input, userId)` | Cria caso + registra activity |
| `updateCaseRecord(id, input)` | Atualiza campos do caso |
| `moveCaseColumn(id, columnId, position)` | Move caso para outra coluna (drag-drop) |
| `deleteCaseRecord(id)` | Remove caso |
| `getCaseMovements(caseId)` | Lista movimentações do caso |
| `addCaseMovement(caseId, description, date)` | Adiciona movimentação manual |

**SELECT usado:**
```sql
*,
client:clients(id, type, name, company_name, trade_name, phone, email, legal_area),
assigned_profile:profiles!cases_assigned_to_fkey(id, full_name, avatar_url, role, created_at),
movements:case_movements(*)
```

---

## Hooks React Query

### `src/features/crm/hooks/useCases.ts`

```typescript
caseKeys.workflow(workflowId)  // para listas por workflow
caseKeys.detail(id)            // para caso individual

useCases(workflowId)           // lista de casos do workflow
useCase(id)                    // caso individual
```

### `src/features/crm/hooks/useCaseMutations.ts`

```typescript
useCreateCase(workflowId)
useUpdateCase(id, workflowId)
useMoveCase(workflowId)              // simples (sem otimismo)
useDeleteCase(workflowId)
useAddCaseMovement(caseId, workflowId)
useOptimisticMoveCase(workflowId)    // com optimistic update para DnD
```

---

## Formulário CasoForm

### Props

```typescript
interface CasoFormProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  defaultValues?: Partial<CaseInput>  // para pré-preencher
  editingCase?: CaseWithRelations     // modo edição
  isLoading?: boolean
  onSubmit: (data: CaseInput) => void
}
```

### Funcionalidades
- Busca CNJ via DataJud (`/api/cnj/[number]`) — preenche tribunal, vara, partes
- Selector de cliente (dropdown dos clientes cadastrados via `useClientes()`)
- Selector de workflow — ao trocar, reseta a coluna para a primeira do novo workflow
- Selector de coluna — dependente do workflow selecionado
- Toggle de etiquetas (multi-select visual)
- Modo criar / editar (diferente via `editingCase` prop)

---

## Store Zustand (UI apenas)

### `src/features/crm/stores/casos.store.ts`

```typescript
interface CrmUiState {
  selectedCaseId: string | null
  modalOpen: boolean
  createModalOpen: boolean
  openModal(caseId: string): void
  closeModal(): void
  openCreateModal(): void
  closeCreateModal(): void
}
```

> A store não guarda mais os dados dos casos (foram para React Query).
> `useCrmCasosStore` é um alias de `useCrmUiStore` para compatibilidade.

---

## Componentes do Kanban

### `CasoCard`
- Exibe: nome do cliente, área jurídica, etiquetas, prazo, tarefa resumo, advogado (iniciais), última atualização
- Alerta de urgência: `tags.includes('urgente') || tags.includes('prazo-fatal')`

### `CrmKanbanBoard`
- Usa `useCases(workflow.id)` para dados reais
- Usa `useOptimisticMoveCase` para drag-drop com rollback automático em erro
- Loading state com colunas skeleton

### `CasoModal` (9 abas)

| Aba | Status | Fonte de dados |
|-----|--------|----------------|
| Resumo | ✅ Real | `CaseWithRelations` |
| Processo | ✅ Real | `CaseWithRelations + movements` |
| Cliente | ✅ Real | `CaseWithRelations.client` |
| Timeline | 🟡 Placeholder | Futuro: `case_movements` |
| Agenda | 🟡 Placeholder | Futuro: `events` com `case_id` |
| Tarefas | 🟡 Placeholder | Futuro: `tasks` com `case_id` |
| Documentos | 🟡 Placeholder | Futuro: Storage + `case_id` |
| Financeiro | 🟡 Placeholder | Futuro: módulo Financeiro |
| Comentários | 🟡 Placeholder | Futuro: `case_comments` |

---

## Workflows (Configuração Estática)

Os workflows e colunas permanecem como configuração estática em `src/data/mock.ts`.
Os IDs (`wf-negociacao`, `wf-processos`, `neg-1`, `proc-1` etc.) são referenciados
diretamente no banco como strings. Não existe tabela de workflows no Supabase (yet).

**Implicação:** Alterar IDs dos workflows quebraria casos existentes no banco.

---

## Variáveis de Ambiente Necessárias

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
CNJ_API_KEY=              # Solicitar em datajud-wiki.cnj.jus.br
```

---

## Pendências desta Fase

Ver `docs/PENDENCIAS.md` — seção "Módulo: Processos".

### Fase 2 (próximo sprint)
- Abas reais: Timeline (via `case_movements`), Tarefas, Agenda, Documentos, Comentários
- Motor de prazos CPC (tabela de regras → auto-cria tasks)
- Botão "Adicionar movimentação" na aba Processo

### Fase 3 (futuro)
- Polling CNJ DataJud via Supabase Edge Function + pg_cron
- Intimação detection engine
- Notificações push de prazos críticos
