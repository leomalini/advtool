# Setup do Banco de Dados

## Fonte da verdade

As **migrations em `migrations/`** são a fonte da verdade do schema — rode-as em
ordem numérica. O arquivo `schema.sql` é um snapshot desatualizado (congelado por
volta da migration 06, ainda descreve o modelo `leads` pré-rename) e **não deve
ser usado como referência**.

## Como aplicar

Com a Supabase CLI (recomendado):

```bash
supabase db reset
```

Ou manualmente: **supabase.com → seu projeto → SQL Editor → New query**, colando
o conteúdo de cada arquivo de `migrations/` em ordem numérica.

## Storage

O bucket `attachments` é criado pela migration
`20260101000018_storage_attachments_bucket.sql` — **não** é mais necessário
criá-lo à mão pelo Studio. A migration é idempotente: em bases onde o bucket já
foi criado manualmente, ela não falha.

As três policies (`auth_upload`, `auth_read`, `auth_delete`) liberam o bucket
inteiro para qualquer usuário autenticado, sem escopo por pasta — consistente com
o modelo single-tenant do produto.

## Verificação

Após aplicar tudo, confirme em **Table Editor** que existem:

`profiles`, `clients`, `client_contacts`, `client_attachments`, `crm_items`,
`crm_item_comments`, `crm_item_column_history`, `legal_processes`,
`legal_process_movements`, `workflows`, `workflow_columns`, `events`,
`event_assignees`, `event_attachments`, `tasks`, `task_comments`,
`task_checklist_items`, `activities`.

E em **Storage**, o bucket `attachments` (privado).

> As tabelas `lead_stages`, `leads`, `lead_movements` e `lead_comments`
> (migration 02) ainda existem no banco, mas são **código morto** — nenhum
> arquivo em `src/` as referencia desde a migração para `crm_items`.
