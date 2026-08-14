-- 29. Vínculo entre uma parte do processo e um cliente cadastrado
--
-- As partes chegam da API BuscaProcessos como texto puro (nome + documento) e
-- não são clientes. A tela de detalhes precisa distinguir "parte que já é
-- cliente nosso" de "parte apenas nominal", para oferecer o cadastro no lugar
-- certo — daí a coluna ser NULLable e não ter default.
--
-- ON DELETE SET NULL: apagar um cliente não pode apagar a parte, que é fato
-- processual e continua valendo mesmo sem cadastro.

alter table legal_process_parties
  add column if not exists client_id uuid references clients(id) on delete set null;

-- Usado nas duas direções: partes de um processo (já coberto pelo índice de
-- legal_process_id) e "em quais processos este cliente aparece como parte".
create index if not exists idx_legal_process_parties_client
  on legal_process_parties(client_id)
  where client_id is not null;
