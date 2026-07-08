# Módulo de Clientes — Documentação Técnica

> Última atualização: 2026-07-07

---

## Visão geral

O módulo gerencia o cadastro e consulta de clientes do escritório. Suporta Pessoa Física (PF) e Pessoa Jurídica (PJ), múltiplos contatos, busca automática de dados pelo CNPJ e um módulo de pendências para alertar cadastros incompletos.

---

## Estrutura de arquivos

```
src/
├── app/
│   ├── (app)/
│   │   ├── clientes/page.tsx          → Rota /clientes
│   │   └── pendencias/page.tsx        → Rota /pendencias
│   └── api/
│       └── cnpj/route.ts              → GET /api/cnpj?cnpj=XXXXXXXXXXXXXXX
│
├── features/
│   ├── clientes/
│   │   ├── components/
│   │   │   ├── ClientesContent.tsx    → Listagem com create/edit/delete
│   │   │   ├── ClienteForm.tsx        → Formulário PF/PJ (create e edit)
│   │   │   └── ClienteDetailModal.tsx → Modal de detalhe do cliente
│   │   ├── hooks/
│   │   │   ├── useClientes.ts         → Queries (React Query)
│   │   │   └── useClienteMutations.ts → Mutations (create/update/delete)
│   │   └── services/
│   │       └── clientes.service.ts    → Acesso ao Supabase
│   └── pendencias/
│       └── components/
│           └── PendenciasContent.tsx  → Listagem de pendências
│
├── schemas/
│   └── cliente.schema.ts              → Validação Zod
│
└── types/
    └── cliente.types.ts               → Tipos TypeScript
```

---

## Banco de dados (Supabase)

### Tabela `clients`

| Coluna               | Tipo         | Descrição                            |
|----------------------|--------------|--------------------------------------|
| `id`                 | uuid (PK)    | Identificador único                  |
| `type`               | text         | `'individual'` ou `'company'`        |
| `name`               | text         | Nome (PF)                            |
| `cpf`                | text         | CPF (PF)                             |
| `company_name`       | text         | Razão Social (PJ)                    |
| `trade_name`         | text         | Nome Fantasia (PJ)                   |
| `cnpj`               | text         | CNPJ (PJ)                            |
| `contact_person`     | text         | Responsável (PJ)                     |
| `legal_area`         | text         | Área jurídica principal              |
| `phone`              | text         | Telefone principal                   |
| `email`              | text         | E-mail principal                     |
| `address_*`          | text         | Campos de endereço                   |
| `notes`              | text         | Observações                          |
| `assigned_to`        | uuid (FK)    | Advogado responsável                 |
| `created_by`         | uuid (FK)    | Quem criou o registro                |
| `created_at`         | timestamptz  | Data de criação                      |
| `updated_at`         | timestamptz  | Última atualização (auto via trigger)|

**Constraints:**
- `chk_individual`: se `type = 'individual'`, `name` não pode ser nulo
- `chk_company`: se `type = 'company'`, `company_name` não pode ser nulo
- RLS: apenas usuários autenticados têm acesso

### Tabela `client_contacts`

Armazena contatos adicionais (múltiplos telefones/emails por cliente).

| Coluna       | Tipo        | Descrição                                     |
|--------------|-------------|-----------------------------------------------|
| `id`         | uuid (PK)   | Identificador único                           |
| `client_id`  | uuid (FK)   | Referência ao cliente (`on delete cascade`)   |
| `type`       | text        | `'phone'` ou `'email'`                        |
| `value`      | text        | O valor do contato                            |
| `label`      | text        | Rótulo: "Celular", "WhatsApp", "Trabalho" etc |
| `is_primary` | boolean     | Se é o contato principal daquele tipo         |
| `created_at` | timestamptz | Data de criação                               |

**Migrations:**
- `supabase/migrations/03_clients.sql` — tabela `clients` e `client_attachments`
- `supabase/migrations/08_client_contacts.sql` — tabela `client_contacts` + coluna `legal_area`

---

## Tipos principais

```typescript
// Tipo de cliente
type ClientType = 'individual' | 'company'

// Áreas jurídicas disponíveis
type LegalArea =
  | 'trabalhista' | 'civel' | 'familia' | 'tributario'
  | 'criminal' | 'previdenciario' | 'consumidor'

// Contato adicional
interface ClientContact {
  id: string
  client_id: string
  type: 'phone' | 'email'
  value: string
  label: string | null
  is_primary: boolean
  created_at: string
}

// Cliente com relações (usado em listas e detalhes)
interface ClientWithRelations {
  // ...todos os campos da tabela clients
  assignee?: Profile | null  // advogado responsável
  creator?: Profile          // quem criou
  contacts?: ClientContact[] // contatos adicionais
}
```

**Helpers de tipo:**
- `getClientDisplayName(client)` — retorna nome de exibição (nome PF ou fantasia/razão PJ)
- `getClientDocument(client)` — retorna CPF ou CNPJ formatado

---

## API Route — CNPJ Lookup

```
GET /api/cnpj?cnpj=12345678000100
```

**Fonte:** BrasilAPI (`https://brasilapi.com.br/api/cnpj/v1/{cnpj}`) — gratuita, sem autenticação.

**Resposta de sucesso (200):**
```json
{
  "company_name": "EMPRESA XPTO LTDA",
  "trade_name": "XPTO",
  "phone": "(11) 30001234",
  "email": "contato@xpto.com.br",
  "address_street": "RUA DAS FLORES",
  "address_number": "100",
  "address_complement": "SALA 1",
  "address_neighborhood": "JARDIM PAULISTA",
  "address_city": "SAO PAULO",
  "address_state": "SP",
  "address_zip": "01403001"
}
```

**Erros possíveis:**
- `400` — CNPJ inválido (não tem 14 dígitos)
- `404` — CNPJ não encontrado na Receita Federal
- `502` — Falha ao conectar com a BrasilAPI

> **Nota sobre CPF:** A busca automática por CPF requer uma API paga (Serpro ou Netlex). Por isso, o botão "Buscar" no formulário PF exibe um aviso informativo. Apenas validação de formato é feita localmente.

---

## Formulário (`ClienteForm`)

Comportamento:
- Ao criar: exibe abas PF/PJ para o usuário escolher
- Ao editar: aba fixada no tipo já cadastrado (sem troca)
- **CEP auto-preenchimento:** ao sair do campo CEP, consulta ViaCEP e preenche logradouro, bairro, cidade e UF
- **CNPJ auto-preenchimento (PJ):** botão "Buscar CNPJ" chama `/api/cnpj` e preenche todos os campos disponíveis
- **Contatos adicionais:** botões "+ Telefone" e "+ E-mail" adicionam linhas dinamicamente com rótulo e valor; cada linha pode ser removida individualmente
- **Área jurídica:** select com todas as 7 áreas disponíveis

**Props:**
```typescript
interface ClienteFormProps {
  onSubmit: (data: CreateClientInput) => void
  isLoading?: boolean
  defaultValues?: Partial<ClientWithRelations> // preenchido em modo edição
}
```

---

## Módulo de Pendências

### O que é monitorado

| Campo                         | Tipo     | Alerta quando             |
|-------------------------------|----------|---------------------------|
| CPF                           | PF       | não preenchido            |
| CNPJ                          | PJ       | não preenchido            |
| Contato (telefone ou e-mail)  | Ambos    | nenhum dos dois           |
| Telefone principal            | Ambos    | não preenchido            |
| E-mail principal              | Ambos    | não preenchido            |
| Área jurídica                 | Ambos    | não preenchida            |

### Comportamento

- Badge numérico no item "Pendências" da sidebar mostra o total de clientes com dados incompletos
- A página `/pendencias` lista todos os clientes com campos faltando
- Cada card exibe o nome do cliente e as tags dos campos ausentes
- Botão "Preencher" abre diretamente o formulário de edição pré-carregado
- Após salvar, a lista é atualizada automaticamente (React Query `invalidateQueries`)
- Não bloqueia criação — é apenas um alerta visual

---

## Fluxo de dados

```
Supabase (clients + client_contacts)
    ↓ getClients() / getClientById()
clientes.service.ts
    ↓ useClientes() / useCliente()
React Query (cache)
    ↓
ClientesContent / ClienteDetailModal / PendenciasContent
```

**Mutations:**
```
useCreateCliente()   → createClientRecord() → INSERT clients + INSERT client_contacts
useUpdateCliente(id) → updateClientRecord() → UPDATE clients + DELETE+INSERT client_contacts
useDeleteCliente()   → deleteClientRecord() → DELETE clients (cascade apaga contacts)
```

---

## Hooks disponíveis

```typescript
// Queries
useClientes()             // lista todos os clientes
useCliente(id)            // cliente específico com relações
useClienteAttachments(id) // anexos de um cliente
useClientesPendencies()   // clientes com campos obrigatórios vazios

// Mutations
useCreateCliente()        // criar cliente
useUpdateCliente(id)      // atualizar cliente
useDeleteCliente()        // remover cliente
useUploadAttachment(id)   // upload de arquivo
useDeleteAttachment(id)   // remover arquivo
```

---

## Decisões técnicas

| Decisão | Motivo |
|---|---|
| `phone`/`email` mantidos na tabela `clients` | Compatibilidade e queries simples para listagem |
| `client_contacts` para contatos adicionais | Permite N contatos sem alterar a tabela principal |
| `useFieldArray` (React Hook Form) para contatos | Gerenciamento dinâmico de arrays sem state manual |
| BrasilAPI para CNPJ | Gratuita, sem chave de API, cobertura completa da Receita Federal |
| ViaCEP para CEP | Gratuita, amplamente usada, retorno confiável |
| Sem CPF lookup automático | APIs de CPF são pagas (Serpro/Netlex) — documentado como item futuro |
| Tabs fixadas no edit | Evitar troca de tipo acidental em edição — dados seriam perdidos |
| Pendências via query JS | Simples para MVP; pode virar uma View SQL no futuro para melhor performance |

---

## Itens futuros (não implementados)

- [ ] Integração com API de CPF paga (Serpro ou Netlex)
- [ ] Aba "Casos" no modal de detalhe — depende do módulo de Processos
- [ ] Aba "Financeiro" no modal de detalhe — depende do módulo Financeiro
- [ ] View SQL de pendências (performance em escala)
- [ ] Upload de foto/avatar do cliente
- [ ] Histórico de atividades por cliente
- [ ] Exportação CSV da listagem
