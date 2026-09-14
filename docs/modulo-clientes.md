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
| `legal_areas`        | text[]       | Áreas jurídicas — plural desde a migration 53 |
| `phone`              | text         | Telefone principal                   |
| `email`              | text         | E-mail principal                     |
| `tags`               | text[]       | Etiquetas (as mesmas do CRM)         |
| `notes`              | text         | Observações                          |
| `assigned_to`        | uuid (FK)    | Advogado responsável                 |
| `created_by`         | uuid (FK)    | Quem criou o registro                |
| `created_at`         | timestamptz  | Data de criação                      |
| `updated_at`         | timestamptz  | Última atualização (auto via trigger)|

Os campos de qualificação (`birth_date`, `sex`, `nationality`, `marital_status`,
`profession`, `rg`, `rg_issuer`) vieram na migration 30 — ver `utils/qualificacao.ts`.
O endereço **não** mora mais aqui: virou `client_addresses` na migration 54.

**Constraints:**
- `chk_individual`: se `type = 'individual'`, `name` não pode ser nulo
- `chk_company`: se `type = 'company'`, `company_name` não pode ser nulo
- `chk_clients_legal_areas`: toda área do array está na lista das sete conhecidas
- RLS: `apply_rbac_policies` com `clientes:view/create/update/delete` (migration 36)

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

### Tabela `client_addresses`

Endereços do cliente (residencial, comercial, de correspondência). Substituiu as
sete colunas `address_*` de `clients` na migration 54 — manter as duas formas
daria dois endereços "principais", que divergiriam na primeira edição.

| Coluna         | Tipo        | Descrição                                                     |
|----------------|-------------|---------------------------------------------------------------|
| `id`           | uuid (PK)   | Identificador único                                           |
| `client_id`    | uuid (FK)   | Referência ao cliente (`on delete cascade`)                   |
| `kind`         | text        | `'residencial'`, `'comercial'`, `'correspondencia'`, `'outro'`|
| `street`       | text        | Logradouro                                                    |
| `number`       | text        | Número                                                        |
| `complement`   | text        | Complemento                                                   |
| `neighborhood` | text        | Bairro                                                        |
| `city`         | text        | Cidade                                                        |
| `state`        | text        | UF                                                            |
| `zip`          | text        | CEP                                                           |
| `is_primary`   | boolean     | O que entra na qualificação da petição                        |
| `created_at`   | timestamptz | Data de criação                                               |
| `updated_at`   | timestamptz | Última atualização (auto via trigger)                         |

`kind`, e não `type`, para não colidir com `clients.type` (PF/PJ) quando os dois
chegam juntos ao componente pelo embed. O índice único parcial
`idx_client_addresses_primary` garante **no máximo um** principal por cliente —
"qual endereço vai na petição" precisa ter uma resposta só.

**Migrations:**
- `supabase/migrations/03_clients.sql` — tabela `clients` e `client_attachments`
- `supabase/migrations/08_client_contacts.sql` — tabela `client_contacts` + coluna `legal_area`
- `supabase/migrations/30_clients_qualification.sql` — campos de qualificação e `tags`
- `supabase/migrations/53_clients_legal_areas.sql` — `legal_area` → `legal_areas text[]`
- `supabase/migrations/54_client_addresses.sql` — endereço vira tabela filha

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

// Finalidade do endereço
type AddressKind = 'residencial' | 'comercial' | 'correspondencia' | 'outro'

// Endereço (migration 54)
interface ClientAddress {
  id: string
  client_id: string
  kind: AddressKind
  street: string | null
  number: string | null
  complement: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  zip: string | null
  is_primary: boolean        // o que entra na qualificação
  created_at: string
  updated_at: string
}

// Cliente com relações (usado em listas e detalhes)
interface ClientWithRelations {
  // ...todos os campos da tabela clients — inclusive legal_areas: LegalArea[]
  assignee?: Profile | null    // advogado responsável
  creator?: Profile            // quem criou
  contacts?: ClientContact[]   // contatos adicionais
  addresses?: ClientAddress[]  // opcionais: só chegam quando o select embute
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

> As chaves `address_*` são o contrato **desta rota**, não colunas de `clients`
> (que perdeu o endereço na migration 54). O formulário PJ usa a resposta para
> preencher o **primeiro** endereço da lista, criando-o se ainda não houver nenhum.

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
- **CEP auto-preenchimento:** ao sair do campo CEP, consulta ViaCEP e preenche logradouro, bairro, cidade e UF **do endereço daquela linha**
- **CNPJ auto-preenchimento (PJ):** botão "Buscar CNPJ" chama `/api/cnpj` e preenche todos os campos disponíveis
- **Contatos adicionais:** botões "+ Telefone" e "+ E-mail" adicionam linhas dinamicamente com rótulo e valor; cada linha pode ser removida individualmente
- **Endereços (`AddressFields`):** lista com "Adicionar endereço"; cada um tem tipo e o marcador "principal", que é o endereço usado na qualificação. Remover o principal promove o próximo, senão o schema recusaria o salvamento por um estado que a própria remoção criou
- **Áreas jurídicas:** chips de alternância — o cliente pode ter mais de uma
- **Etiquetas:** `TagToggle` com `allowCreate`, ou seja, dá para criar uma etiqueta sem sair do cadastro

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

| Campo                         | Tipo     | Severidade | Alerta quando                                    |
|-------------------------------|----------|------------|--------------------------------------------------|
| CPF                           | PF       | alta       | não preenchido                                   |
| CNPJ                          | PJ       | alta       | não preenchido                                   |
| Contato                       | Ambos    | alta       | nenhum telefone nem e-mail, em `clients` ou em `client_contacts` |
| Telefone                      | Ambos    | média      | ausente, havendo outro contato                   |
| E-mail                        | Ambos    | média      | ausente, havendo outro contato                   |
| Área jurídica                 | Ambos    | média      | `legal_areas` vazio                              |
| Endereço                      | Ambos    | média      | nenhuma linha em `client_addresses`              |
| Data de nascimento            | PF       | média      | não preenchida                                   |
| Estado civil                  | PF       | média      | não preenchido                                   |
| RG                            | PF       | média      | não preenchido                                   |

**Alta** é o que trava o trabalho — sem documento não se peticiona, sem nenhum
contato não se avisa o cliente. **Média** é o que enriquece a qualificação: a
peça sai sem eles, só que mais pobre. Sem a distinção, os nove avisos possíveis
chegariam todos com o mesmo peso visual.

Nascimento, estado civil e RG não valem para PJ: não existem no cadastro de
empresa, e cobrá-los deixaria toda pessoa jurídica permanentemente pendente.

A tela `/pendencias` filtra a seção de Clientes por Pessoa Física / Jurídica. O
filtro fica no cabeçalho da seção porque não faz sentido para as pendências de
processo, listadas logo acima.

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
