# Setup do Banco de Dados

## Fonte da verdade

As **migrations em `migrations/`** são a fonte da verdade do schema — rode-as em
ordem numérica. O arquivo `schema.sql` é um snapshot desatualizado (congelado por
volta da migration 06, ainda descreve o modelo `leads` pré-rename) e **não deve
ser usado como referência**.

> ### ⚠️ Nunca marque migrations como aplicadas sem rodá-las
>
> `supabase migration repair --status applied` só reescreve o histórico — não
> executa SQL nenhum. Isso já aconteceu aqui: a migration 07 ficou marcada como
> aplicada sem nunca ter rodado, e o banco passou meses sem `event_assignees`,
> `event_attachments` e 12 colunas de `events`. O sintoma só apareceu ao criar
> um evento (`PGRST200`), e o conserto foi a migration 20.
>
> Se precisar adotar um banco criado à mão, escreva uma migration idempotente
> (`if not exists`) e aplique de verdade. Para conferir o histórico:
> `pnpm db:verify`.

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

As três policies originais (`auth_upload`, `auth_read`, `auth_delete`) liberavam o
bucket inteiro para qualquer conta autenticada. **A migration 38 as substituiu**
por `attachments_select` / `attachments_insert` / `attachments_delete`, que
seguem `documentos:view` / `:create` / `:delete` da matriz de permissões. Continua
sem escopo por pasta — a decisão de negócio é que todo mundo do escritório vê os
mesmos documentos; o que muda por perfil é quem envia e quem apaga.

## Verificação

Após aplicar tudo, confirme em **Table Editor** que existem:

`profiles`, `clients`, `client_contacts`, `client_addresses`, `crm_items`, `crm_item_comments`,
`crm_item_column_history`, `legal_processes`, `legal_process_movements`,
`legal_process_parties`, `workflows`, `workflow_columns`, `events`,
`event_assignees`, `tasks`, `task_comments`, `task_checklist_items`,
`financial_entries`, `documents`, `activities`, `role_permissions`.

> ### ⚠️ RLS: `auth_full` não existe mais — use `apply_rbac_policies`
>
> Até a migration 33, toda tabela tinha a mesma policy
> `for all using (auth.role() = 'authenticated')`: qualquer conta logada lia,
> editava e apagava tudo. As migrations 34–38 trocaram isso por permissão real
> por perfil (`admin`, `attorney`, `paralegal`, `finance`) — ver
> `docs/PLANEJAMENTO-MULTIUSUARIO.md`.
>
> **Tabela nova não recria `auth_full`.** Chama o helper da migration 35:
>
> ```sql
> select public.apply_rbac_policies(
>   'minha_tabela', 'recurso:view', 'recurso:create', 'recurso:update', 'recurso:delete'
> );
> ```
>
> `'*'` no lugar de `'recurso:acao'` libera para qualquer membro ativo (tabelas
> de apoio como `event_types` e `workflows`); `NULL` não cria policy nenhuma
> para aquele comando, ou seja, ninguém pode.
>
> Lembre que **RLS negando não gera erro** — devolve lista vazia ou
> `0 rows updated`. Policy errada parece "sumiu tudo". Confira com
> `supabase/tests/rls_matrix.sql`, que assume os quatro perfis e conta o que
> cada um enxerga.

> ### ⚠️ Migration que faz DROP precisa varrer o `src/` junto
>
> A migration 23 unificou `client_attachments` e `event_attachments` em
> `documents` e apagou as duas — mas cinco pontos do código continuaram
> apontando para elas. O embed `attachments:event_attachments(*)` em
> `EVENT_SELECT` derrubou a Agenda inteira com `PGRST200`, e o erro só apareceu
> ao abrir a aba, porque `tsc` e o build não sabem nada sobre o schema.
>
> Ao remover ou renomear uma tabela, faça `grep` pelo nome dela em `src/` **e**
> valide os `*_SELECT` contra a API real — embed inválido responde 400/PGRST200
> antes da RLS, então dá para conferir sem sessão:
>
> ```bash
> curl -s -o /dev/null -w '%{http_code}\n' \
>   "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/events?select=*,assignees:event_assignees(*)&limit=0" \
>   -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
> ```

E em **Storage**, o bucket `attachments` (privado).

> As tabelas `lead_stages`, `leads`, `lead_movements` e `lead_comments`
> (migration 02) ainda existem no banco, mas são **código morto** — nenhum
> arquivo em `src/` as referencia desde a migração para `crm_items`.
