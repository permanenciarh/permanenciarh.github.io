-- =============================================================================
-- Permanência RH — banco de dados (Supabase / PostgreSQL)
-- Como usar: Supabase > SQL Editor > New query > cole TODO este arquivo > Run.
-- Pode ser executado uma única vez em um projeto novo.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tipos
create type papel_equipe as enum ('admin', 'recrutador', 'leitura');
create type status_candidato as enum (
  'cadastro_recebido', 'perfil_em_analise', 'perfil_atualizado',
  'considerado_para_oportunidade', 'contato_realizado',
  'encaminhado_processo_seletivo', 'arquivado', 'excluido'
);
create type modalidade_trabalho as enum ('presencial', 'hibrido', 'remoto', 'todas');
create type tipo_solicitacao_titular as enum ('acesso', 'correcao', 'exclusao', 'retirada_consentimento', 'portabilidade', 'outro');

-- ---------------------------------------------------------------- equipe autorizada
create table equipe (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nome       text not null,
  papel      papel_equipe not null default 'leitura',
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------- candidatos
create table candidatos (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text unique not null default ('PRH-' || to_char(now(), 'YYMM') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  nome               text not null check (char_length(nome) between 2 and 120),
  email              text not null check (char_length(email) <= 160),
  telefone           text check (telefone is null or char_length(telefone) <= 20),
  cidade             text not null check (char_length(cidade) <= 80),
  uf                 char(2) not null,
  linkedin_url       text check (linkedin_url is null or linkedin_url ~* '^https?://'),
  area               text not null,
  cargo_desejado     text not null check (char_length(cargo_desejado) <= 100),
  resumo             text not null check (char_length(resumo) <= 1200),
  experiencia        text not null,
  escolaridade       text not null,
  competencias       text not null check (char_length(competencias) <= 300),
  idiomas            text,
  modalidade         modalidade_trabalho not null,
  tipos_oportunidade text[] not null check (cardinality(tipos_oportunidade) >= 1),
  disponibilidade    text not null,
  pretensao_faixa    text,
  curriculo_path     text,          -- caminho no bucket privado "curriculos"
  -- perfil comportamental (opcional, com autorização própria): % de cada perfil, somando 100
  perfil_respostas   text check (perfil_respostas is null or perfil_respostas ~ '^[ICOA]{25}$'),
  perfil_aguia       smallint check (perfil_aguia between 0 and 100),
  perfil_gato        smallint check (perfil_gato between 0 and 100),
  perfil_lobo        smallint check (perfil_lobo between 0 and 100),
  perfil_tubarao     smallint check (perfil_tubarao between 0 and 100),
  perfil_predominante text check (perfil_predominante in ('aguia', 'gato', 'lobo', 'tubarao')),
  perfil_respondido_em timestamptz,
  curriculo_link     text check (curriculo_link is null or curriculo_link ~* '^https?://'),
  status             status_candidato not null default 'cadastro_recebido',
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  reter_ate          date not null default ((current_date + interval '24 months')::date),
  excluido_em        timestamptz
);
create unique index candidatos_email_ativo on candidatos (lower(email)) where excluido_em is null;
create index candidatos_filtros on candidatos (area, uf, modalidade, status);
create index candidatos_perfil on candidatos (perfil_predominante);

-- ---------------------------------------------------------------- autorizações (histórico; nunca sobrescrever)
create table consentimentos (
  id             bigint generated always as identity primary key,
  candidato_id   uuid not null references candidatos(id) on delete cascade,
  finalidade     text not null check (finalidade in ('ciencia_aviso', 'compartilhar_empresas', 'receber_conteudos', 'perfil_comportamental')),
  concedido      boolean not null,
  versao_aviso   text not null,
  registrado_em  timestamptz not null default now(),
  origem         text not null default 'formulario_site'
);
create index consentimentos_cand on consentimentos (candidato_id, finalidade, registrado_em desc);

-- ---------------------------------------------------------------- contatos e encaminhamentos
create table interacoes (
  id             bigint generated always as identity primary key,
  candidato_id   uuid not null references candidatos(id) on delete cascade,
  tipo           text not null check (tipo in ('contato', 'encaminhamento', 'observacao', 'atualizacao_status')),
  descricao      text not null check (char_length(descricao) <= 2000),
  empresa        text,
  autor_id       uuid not null default auth.uid() references equipe(user_id),
  criado_em      timestamptz not null default now()
);

-- ---------------------------------------------------------------- pedidos do titular (LGPD art. 18)
create table solicitacoes_titular (
  id              bigint generated always as identity primary key,
  candidato_id    uuid references candidatos(id) on delete set null,
  email_contato   text not null,
  tipo            tipo_solicitacao_titular not null,
  detalhes        text,
  status          text not null default 'aberta' check (status in ('aberta', 'em_andamento', 'concluida', 'recusada')),
  prazo_resposta  date not null default (current_date + 15),
  respondido_em   timestamptz,
  responsavel_id  uuid references equipe(user_id),
  criado_em       timestamptz not null default now()
);

-- ---------------------------------------------------------------- auditoria (sem dados pessoais)
create table auditoria (
  id          bigint generated always as identity primary key,
  ator_id     uuid,
  acao        text not null,
  entidade    text not null,
  entidade_id text,
  detalhes    jsonb not null default '{}'::jsonb,
  criado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------- limite de envios (anti-abuso do formulário)
create table limite_envios (
  id         bigint generated always as identity primary key,
  ip_hash    text not null,
  criado_em  timestamptz not null default now()
);
create index limite_envios_ip on limite_envios (ip_hash, criado_em desc);

-- ---------------------------------------------------------------- funções auxiliares
create or replace function papel_atual() returns papel_equipe
language sql stable security definer set search_path = public as $$
  select papel from equipe where user_id = auth.uid() and ativo
$$;

create or replace function tocar_atualizado_em() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
create trigger trg_candidatos_atualizado before update on candidatos
  for each row execute function tocar_atualizado_em();

create or replace function auditar_candidato() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into auditoria (ator_id, acao, entidade, entidade_id) values (auth.uid(), 'cadastro_recebido', 'candidatos', new.id::text);
    return new;
  elsif tg_op = 'UPDATE' then
    insert into auditoria (ator_id, acao, entidade, entidade_id, detalhes)
    values (auth.uid(), 'alteracao', 'candidatos', new.id::text,
            jsonb_build_object('status_de', old.status, 'status_para', new.status));
    return new;
  else
    insert into auditoria (ator_id, acao, entidade, entidade_id) values (auth.uid(), 'remocao', 'candidatos', old.id::text);
    return old;
  end if;
end $$;
create trigger trg_auditar_candidato after insert or update or delete on candidatos
  for each row execute function auditar_candidato();

-- Registro de visualização de perfil / download de currículo (chamado pelo painel)
create or replace function registrar_acesso(p_acao text, p_candidato uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if papel_atual() is null then raise exception 'sem_permissao'; end if;
  if p_acao not in ('ver_perfil', 'baixar_curriculo', 'exportar') then raise exception 'acao_invalida'; end if;
  insert into auditoria (ator_id, acao, entidade, entidade_id) values (auth.uid(), p_acao, 'candidatos', p_candidato::text);
end $$;

-- Exclusão (a pedido do titular ou por fim do prazo de retenção): anonimiza o registro.
-- O painel apaga o PDF do Storage antes de chamar esta função.
create or replace function anonimizar_candidato(p_candidato uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if papel_atual() is distinct from 'admin' then raise exception 'sem_permissao'; end if;
  update candidatos set
    nome = 'Anonimizado', email = 'anonimizado+' || id || '@invalid', telefone = null, linkedin_url = null,
    cidade = '-', resumo = '-', competencias = '-', idiomas = null, cargo_desejado = '-',
    pretensao_faixa = null, curriculo_path = null, curriculo_link = null,
    perfil_respostas = null, perfil_aguia = null, perfil_gato = null, perfil_lobo = null, perfil_tubarao = null,
    perfil_predominante = null, perfil_respondido_em = null,
    status = 'excluido', excluido_em = now()
  where id = p_candidato and excluido_em is null;
  delete from interacoes where candidato_id = p_candidato;
  insert into auditoria (ator_id, acao, entidade, entidade_id) values (auth.uid(), 'anonimizacao_titular', 'candidatos', p_candidato::text);
end $$;

-- Renovar prazo de retenção (quando o candidato confirma interesse)
create or replace function renovar_retencao(p_candidato uuid) returns date
language plpgsql security definer set search_path = public as $$
declare d date;
begin
  if papel_atual() not in ('admin', 'recrutador') then raise exception 'sem_permissao'; end if;
  update candidatos set reter_ate = (current_date + interval '24 months')::date where id = p_candidato returning reter_ate into d;
  return d;
end $$;

-- ---------------------------------------------------------------- segurança em nível de linha (RLS)
alter table equipe               enable row level security;
alter table candidatos           enable row level security;
alter table consentimentos       enable row level security;
alter table interacoes           enable row level security;
alter table solicitacoes_titular enable row level security;
alter table auditoria            enable row level security;
alter table limite_envios        enable row level security;

-- Público (anon) não tem NENHUMA política: não lê nem grava nada diretamente.
-- O cadastro entra pela Edge Function, que usa a service_role apenas no servidor.

create policy equipe_ve_a_si on equipe for select to authenticated using (user_id = auth.uid() or papel_atual() = 'admin');
create policy equipe_admin   on equipe for all    to authenticated using (papel_atual() = 'admin') with check (papel_atual() = 'admin');

create policy cand_ler     on candidatos for select to authenticated using (papel_atual() is not null);
create policy cand_editar  on candidatos for update to authenticated using (papel_atual() in ('admin', 'recrutador')) with check (papel_atual() in ('admin', 'recrutador'));

create policy cons_ler     on consentimentos for select to authenticated using (papel_atual() is not null);
create policy cons_inserir on consentimentos for insert to authenticated with check (papel_atual() in ('admin', 'recrutador'));

create policy int_ler      on interacoes for select to authenticated using (papel_atual() is not null);
create policy int_inserir  on interacoes for insert to authenticated with check (papel_atual() in ('admin', 'recrutador') and autor_id = auth.uid());

create policy sol_admin    on solicitacoes_titular for all to authenticated using (papel_atual() = 'admin') with check (papel_atual() = 'admin');
create policy aud_ler      on auditoria for select to authenticated using (papel_atual() = 'admin');
-- auditoria e limite_envios: sem update/delete para ninguém via API

-- Recrutador não altera colunas pessoais diretamente: apenas status e retenção
revoke update on candidatos from authenticated;
grant update (status, reter_ate) on candidatos to authenticated;
revoke all on limite_envios from anon, authenticated;
revoke all on auditoria from anon;
grant execute on function registrar_acesso(text, uuid), anonimizar_candidato(uuid), renovar_retencao(uuid) to authenticated;

-- ---------------------------------------------------------------- visão para compartilhamento com empresas
create or replace view perfis_compartilhaveis with (security_invoker = true) as
select c.codigo, c.area, c.cargo_desejado, c.resumo, c.experiencia, c.escolaridade,
       c.competencias, c.idiomas, c.modalidade, c.tipos_oportunidade, c.cidade, c.uf, c.disponibilidade
from candidatos c
where c.excluido_em is null
  and (select k.concedido from consentimentos k
       where k.candidato_id = c.id and k.finalidade = 'compartilhar_empresas'
       order by k.registrado_em desc limit 1) is true;

-- ---------------------------------------------------------------- armazenamento de currículos (bucket privado)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('curriculos', 'curriculos', false, 5242880, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['application/pdf'];

create policy curriculos_ler on storage.objects for select to authenticated
  using (bucket_id = 'curriculos' and papel_atual() in ('admin', 'recrutador'));
create policy curriculos_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'curriculos' and papel_atual() = 'admin');
-- Upload somente pela Edge Function (service_role). Nenhuma política de insert.

-- ---------------------------------------------------------------- manter o projeto ativo (plano gratuito pausa após 7 dias sem uso)
-- Chamado a cada 3 dias pelo GitHub Actions (.github/workflows/manter-ativo.yml). Não lê nenhum dado.
create or replace function ping() returns integer language sql stable as $$ select 1 $$;
grant execute on function ping() to anon;
