-- =============================================================================
-- Permanência RH — atualização 012: migração para Orientação e documentos por pessoa
-- Rodar UMA vez no SQL Editor, depois do 011. Não edita nenhum arquivo já rodado.
--
-- O que cria:
--  - orientacao_clientes.candidato_origem: vínculo com o cadastro do Banco de Talentos (o cadastro de origem
--    continua existindo; se for excluído, o vínculo apenas se desfaz).
--  - migrar_candidato_para_orientacao(candidato): cria (ou devolve) a pessoa em Orientação a partir do candidato.
--    Copia só dados de contato e de perfil profissional. NÃO copia testes, laudos nem entrevistas: foram
--    autorizados para o processo seletivo; na orientação a pessoa responde de novo, com a autorização dela.
--  - documentos_pessoa + bucket privado "documentos": arquivos que a equipe gera ou recebe (currículo, LinkedIn,
--    relatório, PDI, contrato...), na ficha do candidato ou da pessoa em Orientação.
--  - registrar_acesso_documento: registra na auditoria quem abriu um documento.
-- =============================================================================

alter table orientacao_clientes add column candidato_origem uuid references candidatos(id) on delete set null;
create unique index orientacao_clientes_origem on orientacao_clientes (candidato_origem) where candidato_origem is not null;

create or replace function migrar_candidato_para_orientacao(p_candidato uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare c candidatos; v_id uuid;
begin
  if papel_atual() not in ('admin', 'recrutador') then raise exception 'sem_permissao'; end if;
  select id into v_id from orientacao_clientes where candidato_origem = p_candidato;
  if found then return v_id; end if;
  select * into c from candidatos where id = p_candidato and excluido_em is null;
  if not found then raise exception 'candidato_nao_encontrado'; end if;
  insert into orientacao_clientes (nome, nome_social, email, telefone, cidade, uf, ocupacao_atual, area, escolaridade,
                                   autorizacao_forma, candidato_origem)
  values (left(c.nome, 160), left(c.nome_social, 160), left(c.email, 200), left(c.telefone, 30), left(c.cidade, 120), c.uf, left(c.cargo_desejado, 160), left(c.area, 120), left(c.escolaridade, 120),
          'Migrado do Banco de Talentos. Registrar aqui a contratação e a autorização da assessoria.', p_candidato)
  returning id into v_id;
  insert into auditoria (ator_id, acao, entidade, entidade_id, detalhes)
  values (auth.uid(), 'migrar_para_orientacao', 'candidatos', p_candidato::text, jsonb_build_object('cliente_id', v_id));
  return v_id;
end $$;

-- ---------------------------------------------------------------- documentos
create table documentos_pessoa (
  id            uuid primary key default gen_random_uuid(),
  candidato_id  uuid references candidatos(id) on delete cascade,
  cliente_id    uuid references orientacao_clientes(id) on delete cascade,
  tipo          text not null check (tipo in ('curriculo', 'linkedin', 'relatorio', 'pdi', 'plano_carreira', 'contrato', 'outro')),
  titulo        text not null check (char_length(titulo) between 1 and 160),
  arquivo_nome  text not null check (char_length(arquivo_nome) <= 200),
  caminho       text not null unique check (char_length(caminho) <= 400 and caminho !~ '\.\.'),
  mime          text,
  tamanho       integer check (tamanho between 1 and 10485760),
  enviado_por   uuid default auth.uid() references equipe(user_id),
  criado_em     timestamptz not null default now(),
  check (num_nonnulls(candidato_id, cliente_id) = 1)
);
create index documentos_candidato on documentos_pessoa (candidato_id, criado_em desc) where candidato_id is not null;
create index documentos_cliente   on documentos_pessoa (cliente_id, criado_em desc) where cliente_id is not null;
alter table documentos_pessoa enable row level security;
revoke all on documentos_pessoa from anon;
grant select, insert, delete on documentos_pessoa to authenticated;
create policy doc_ler    on documentos_pessoa for select to authenticated using (papel_atual() in ('admin', 'recrutador'));
create policy doc_criar  on documentos_pessoa for insert to authenticated with check (papel_atual() in ('admin', 'recrutador'));
create policy doc_apagar on documentos_pessoa for delete to authenticated using (papel_atual() in ('admin', 'recrutador'));

-- bucket privado: até 10 MB, só formatos de documento e imagem
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 10485760, array[
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png', 'image/jpeg', 'text/plain'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;

create policy documentos_ler    on storage.objects for select to authenticated using (bucket_id = 'documentos' and papel_atual() in ('admin', 'recrutador'));
create policy documentos_enviar on storage.objects for insert to authenticated with check (bucket_id = 'documentos' and papel_atual() in ('admin', 'recrutador'));
create policy documentos_apagar on storage.objects for delete to authenticated using (bucket_id = 'documentos' and papel_atual() in ('admin', 'recrutador'));

create or replace function registrar_acesso_documento(p_documento uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos_pessoa;
begin
  if papel_atual() not in ('admin', 'recrutador') then raise exception 'sem_permissao'; end if;
  select * into d from documentos_pessoa where id = p_documento;
  if not found then return; end if;
  insert into auditoria (ator_id, acao, entidade, entidade_id, detalhes)
  values (auth.uid(), 'abrir_documento', case when d.cliente_id is not null then 'orientacao_clientes' else 'candidatos' end,
          coalesce(d.cliente_id, d.candidato_id)::text, jsonb_build_object('tipo', d.tipo));
end $$;

-- Exclusão (anonimização) do candidato apaga as linhas de documentos. Os arquivos são removidos pelo painel antes.
create or replace function limpar_documentos_excluido() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from documentos_pessoa where candidato_id = new.id;
  return new;
end $$;
create trigger trg_limpar_documentos after update of excluido_em on candidatos
  for each row when (new.excluido_em is not null and old.excluido_em is null)
  execute function limpar_documentos_excluido();

revoke all on function migrar_candidato_para_orientacao(uuid), registrar_acesso_documento(uuid), limpar_documentos_excluido() from public, anon;
grant execute on function migrar_candidato_para_orientacao(uuid), registrar_acesso_documento(uuid) to authenticated;

select count(*) as tabelas_012 from information_schema.tables where table_schema = 'public' and table_name = 'documentos_pessoa';
