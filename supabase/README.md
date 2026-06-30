# Setup do Banco de Dados

## Onde rodar

Acesse: **supabase.com → seu projeto → SQL Editor → New query**

Rode cada arquivo abaixo em ordem, um por vez. Copie o conteúdo, cole no SQL Editor e clique em **Run**.

## Ordem de execução

| Arquivo | Conteúdo |
|---|---|
| `migrations/01_profiles.sql` | Tabela de usuários + trigger de auto-criação |
| `migrations/02_crm.sql` | lead_stages, leads, lead_movements, lead_comments |
| `migrations/03_clients.sql` | clients, client_attachments |
| `migrations/04_events.sql` | events (agenda) |
| `migrations/05_tasks.sql` | tasks, task_comments, task_checklist_items |
| `migrations/06_activities.sql` | activities (feed global) |

## Storage (bucket de anexos)

**NÃO** rode o SQL de storage. Faça pelo dashboard:

1. No Supabase: **Storage → New bucket**
2. Name: `attachments`
3. Public bucket: **desligado** (privado)
4. Clique em **Create bucket**

As políticas de acesso já estão no schema principal (`schema.sql`) se precisar aplicar manualmente.

## Verificação

Após rodar todos os arquivos, vá em **Table Editor** e confirme que as seguintes tabelas foram criadas:

- profiles
- lead_stages (com 7 registros seed)
- leads
- lead_movements
- lead_comments
- clients
- client_attachments
- events
- tasks
- task_comments
- task_checklist_items
- activities
