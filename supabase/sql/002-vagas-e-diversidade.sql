-- =============================================================================
-- Permanência RH — atualização 002: vagas, candidaturas e dados de diversidade
-- Rodar UMA vez no SQL Editor, depois do banco-de-dados.sql.
-- =============================================================================

-- ---------------------------------------------------------------- vagas
create table vagas (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text unique not null default ('VAGA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  titulo             text not null check (char_length(titulo) between 3 and 120),
  empresa_exibicao   text not null default 'Empresa confidencial' check (char_length(empresa_exibicao) <= 120),
  empresa_cliente    text check (char_length(empresa_cliente) <= 120),   -- uso interno, nunca exibido no site
  area               text not null,
  cidade             text,
  uf                 char(2),
  modalidade         modalidade_trabalho not null,
  tipo               text not null check (tipo in ('clt', 'estagio', 'aprendizagem', 'temporario', 'pj', 'freelancer')),
  descricao          text not null check (char_length(descricao) <= 4000),
  requisitos         text check (char_length(requisitos) <= 3000),
  beneficios         text check (char_length(beneficios) <= 2000),
  faixa_salarial     text check (char_length(faixa_salarial) <= 80),
  afirmativa         text check (afirmativa is null or afirmativa in ('pcd', 'mulheres', 'pessoas_negras', 'lgbtqia', 'pessoas_50_mais', 'pessoas_trans')),
  status             text not null default 'rascunho' check (status in ('rascunho', 'aberta', 'pausada', 'encerrada')),
  publicada_em       timestamptz,
  encerra_em         date,
  criado_por         uuid default auth.uid() references equipe(user_id),
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create index vagas_status on vagas (status, publicada_em desc);
create trigger trg_vagas_atualizado before update on vagas for each row execute function tocar_atualizado_em();

create or replace function vagas_publicacao() returns trigger language plpgsql as $$
begin
  if new.status = 'aberta' and new.publicada_em is null then new.publicada_em := now(); end if;
  return new;
end $$;
create trigger trg_vagas_publicacao before insert or update on vagas for each row execute function vagas_publicacao();

-- ---------------------------------------------------------------- candidaturas
create table candidaturas (
  id            bigint generated always as identity primary key,
  vaga_id       uuid not null references vagas(id) on delete cascade,
  candidato_id  uuid not null references candidatos(id) on delete cascade,
  etapa         text not null default 'inscrito' check (etapa in ('inscrito', 'triagem', 'entrevista', 'finalista', 'contratado', 'nao_selecionado')),
  observacao    text check (char_length(observacao) <= 1000),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (vaga_id, candidato_id)
);
create index candidaturas_vaga on candidaturas (vaga_id, etapa);
create trigger trg_candidaturas_atualizado before update on candidaturas for each row execute function tocar_atualizado_em();

-- ---------------------------------------------------------------- diversidade (dados pessoais sensíveis — LGPD art. 11)
-- Opcional, com consentimento específico e destacado. Separado do cadastro e com acesso restrito.
create table diversidade (
  candidato_id    uuid primary key references candidatos(id) on delete cascade,
  genero          text check (genero in ('mulher', 'homem', 'nao_binaria', 'outro')),
  pessoa_trans    text check (pessoa_trans in ('sim', 'nao')),
  raca_cor        text check (raca_cor in ('branca', 'preta', 'parda', 'amarela', 'indigena')),
  pcd             text check (pcd in ('sim', 'nao')),
  pcd_tipo        text check (pcd_tipo in ('fisica', 'auditiva', 'visual', 'intelectual', 'psicossocial', 'multipla', 'tea')),
  pcd_adaptacoes  text check (char_length(pcd_adaptacoes) <= 500),
  lgbtqia         text check (lgbtqia in ('sim', 'nao')),
  pessoa_50_mais  text check (pessoa_50_mais in ('sim', 'nao')),
  registrado_em   timestamptz not null default now()
);

alter table consentimentos drop constraint if exists consentimentos_finalidade_check;
alter table consentimentos add constraint consentimentos_finalidade_check
  check (finalidade in ('ciencia_aviso', 'compartilhar_empresas', 'receber_conteudos', 'perfil_comportamental', 'dados_diversidade'));

-- ---------------------------------------------------------------- RLS
alter table vagas        enable row level security;
alter table candidaturas enable row level security;
alter table diversidade  enable row level security;

-- Vagas abertas são públicas (site). Somente colunas de exibição; a empresa cliente nunca sai.
create policy vagas_publicas on vagas for select to anon using (status = 'aberta');
revoke all on vagas from anon;
grant select (id, codigo, titulo, empresa_exibicao, area, cidade, uf, modalidade, tipo, descricao, requisitos,
              beneficios, faixa_salarial, afirmativa, status, publicada_em, encerra_em) on vagas to anon;

create policy vagas_equipe_ler     on vagas for select to authenticated using (papel_atual() is not null);
create policy vagas_equipe_criar   on vagas for insert to authenticated with check (papel_atual() in ('admin', 'recrutador'));
create policy vagas_equipe_editar  on vagas for update to authenticated using (papel_atual() in ('admin', 'recrutador')) with check (papel_atual() in ('admin', 'recrutador'));
create policy vagas_equipe_apagar  on vagas for delete to authenticated using (papel_atual() = 'admin');

create policy cand_vaga_ler     on candidaturas for select to authenticated using (papel_atual() is not null);
create policy cand_vaga_editar  on candidaturas for update to authenticated using (papel_atual() in ('admin', 'recrutador')) with check (papel_atual() in ('admin', 'recrutador'));
revoke all on candidaturas from anon;
revoke update on candidaturas from authenticated;
grant update (etapa, observacao) on candidaturas to authenticated;

-- Diversidade: só admin e recrutador leem; ninguém grava pela API (só a função de cadastro)
create policy div_ler on diversidade for select to authenticated using (papel_atual() in ('admin', 'recrutador'));
revoke all on diversidade from anon;
revoke insert, update, delete on diversidade from authenticated;

-- ---------------------------------------------------------------- funções atualizadas
create or replace function registrar_acesso(p_acao text, p_candidato uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if papel_atual() is null then raise exception 'sem_permissao'; end if;
  if p_acao not in ('ver_perfil', 'baixar_curriculo', 'exportar', 'ver_diversidade') then raise exception 'acao_invalida'; end if;
  insert into auditoria (ator_id, acao, entidade, entidade_id) values (auth.uid(), p_acao, 'candidatos', p_candidato::text);
end $$;

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
  delete from interacoes   where candidato_id = p_candidato;
  delete from diversidade  where candidato_id = p_candidato;
  delete from candidaturas where candidato_id = p_candidato;
  insert into auditoria (ator_id, acao, entidade, entidade_id) values (auth.uid(), 'anonimizacao_titular', 'candidatos', p_candidato::text);
end $$;

-- Auditoria de alterações de vagas e etapas
create or replace function auditar_vagas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into auditoria (ator_id, acao, entidade, entidade_id) values (auth.uid(), 'remocao', 'vagas', old.id::text);
    return old;
  elsif tg_op = 'UPDATE' then
    insert into auditoria (ator_id, acao, entidade, entidade_id, detalhes)
    values (auth.uid(), 'alteracao', 'vagas', new.id::text, jsonb_build_object('status_de', old.status, 'status_para', new.status));
  else
    insert into auditoria (ator_id, acao, entidade, entidade_id) values (auth.uid(), 'criacao', 'vagas', new.id::text);
  end if;
  return new;
end $$;

create or replace function auditar_candidaturas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into auditoria (ator_id, acao, entidade, entidade_id, detalhes)
  values (auth.uid(), 'etapa', 'candidaturas', new.candidato_id::text, jsonb_build_object('etapa_de', old.etapa, 'etapa_para', new.etapa));
  return new;
end $$;
create trigger trg_auditar_vagas after insert or update or delete on vagas for each row execute function auditar_vagas();
create trigger trg_auditar_candidaturas after update on candidaturas for each row execute function auditar_candidaturas();

-- ---------------------------------------------------------------- ficha interna (só administrador)
-- Anotações de entrevista, o que a pessoa busca, plano contratado. Nunca exibido a empresas.
create table ficha_interna (
  candidato_id     uuid primary key references candidatos(id) on delete cascade,
  o_que_busca      text check (char_length(o_que_busca) <= 2000),
  sobre_a_pessoa   text check (char_length(sobre_a_pessoa) <= 4000),
  pontos_fortes    text check (char_length(pontos_fortes) <= 2000),
  pontos_atencao   text check (char_length(pontos_atencao) <= 2000),
  parecer          text check (char_length(parecer) <= 3000),
  plano            text check (plano in ('nenhum', 'curriculo', 'linkedin', 'curriculo_linkedin', 'entrevistas', 'orientacao', 'posicionamento', 'personalizado')),
  plano_detalhes   text check (char_length(plano_detalhes) <= 1000),
  plano_inicio     date,
  plano_fim        date,
  atualizado_por   uuid default auth.uid() references equipe(user_id),
  atualizado_em    timestamptz not null default now()
);
create trigger trg_ficha_atualizado before update on ficha_interna for each row execute function tocar_atualizado_em();
alter table ficha_interna enable row level security;
create policy ficha_admin on ficha_interna for all to authenticated using (papel_atual() = 'admin') with check (papel_atual() = 'admin');
revoke all on ficha_interna from anon;

-- ---------------------------------------------------------------- acompanhamento a cada 30 dias
alter table candidatos add column ultimo_checkin date;
alter table candidatos add column proximo_checkin date not null default (current_date + 30);
create index candidatos_checkin on candidatos (proximo_checkin) where excluido_em is null;

-- Registra o contato do mês: agenda o próximo para daqui a 30 dias e, se a pessoa quer continuar, renova a retenção
create or replace function registrar_checkin(p_candidato uuid, p_manter boolean, p_nota text default null) returns date
language plpgsql security definer set search_path = public as $$
declare d date;
begin
  if papel_atual() not in ('admin', 'recrutador') then raise exception 'sem_permissao'; end if;
  update candidatos set ultimo_checkin = current_date, proximo_checkin = current_date + 30,
         reter_ate = case when p_manter then (current_date + interval '24 months')::date else reter_ate end
   where id = p_candidato and excluido_em is null
   returning proximo_checkin into d;
  if d is null then raise exception 'nao_encontrado'; end if;
  insert into interacoes (candidato_id, tipo, descricao, autor_id)
  values (p_candidato, 'contato', 'Acompanhamento mensal' || case when p_manter then ' — quer continuar no banco' else ' — não confirmou interesse' end
          || coalesce(': ' || left(p_nota, 500), ''), auth.uid());
  return d;
end $$;
grant execute on function registrar_checkin(uuid, boolean, text) to authenticated;

-- anonimização também apaga a ficha interna
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
  delete from interacoes    where candidato_id = p_candidato;
  delete from diversidade   where candidato_id = p_candidato;
  delete from candidaturas  where candidato_id = p_candidato;
  delete from ficha_interna where candidato_id = p_candidato;
  insert into auditoria (ator_id, acao, entidade, entidade_id) values (auth.uid(), 'anonimizacao_titular', 'candidatos', p_candidato::text);
end $$;

-- ---------------------------------------------------------------- empresas (clientes e prospecções)
create table empresas (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null check (char_length(nome) between 2 and 160),
  cnpj              text check (char_length(cnpj) <= 20),
  segmento          text check (char_length(segmento) <= 80),
  porte             text check (porte in ('mei', 'micro', 'pequena', 'media', 'grande')),
  cidade            text check (char_length(cidade) <= 80),
  uf                char(2),
  contato_nome      text check (char_length(contato_nome) <= 120),
  contato_cargo     text check (char_length(contato_cargo) <= 80),
  contato_email     text check (char_length(contato_email) <= 160),
  contato_telefone  text check (char_length(contato_telefone) <= 20),
  origem            text check (origem in ('indicacao', 'linkedin', 'instagram', 'site', 'whatsapp', 'evento', 'prospeccao_ativa', 'outro')),
  etapa             text not null default 'prospeccao' check (etapa in ('prospeccao', 'contato_feito', 'proposta', 'negociacao', 'cliente', 'inativo', 'perdida')),
  servicos          text[] not null default '{}',
  valor_estimado    numeric(12,2) check (valor_estimado >= 0),
  proximo_passo     text check (char_length(proximo_passo) <= 300),
  proximo_contato   date,
  observacoes       text check (char_length(observacoes) <= 3000),
  criado_por        uuid default auth.uid() references equipe(user_id),
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);
create index empresas_etapa on empresas (etapa, proximo_contato);
create trigger trg_empresas_atualizado before update on empresas for each row execute function tocar_atualizado_em();

create table empresa_interacoes (
  id          bigint generated always as identity primary key,
  empresa_id  uuid not null references empresas(id) on delete cascade,
  tipo        text not null check (tipo in ('ligacao', 'reuniao', 'email', 'whatsapp', 'proposta', 'visita', 'outro')),
  descricao   text not null check (char_length(descricao) <= 2000),
  autor_id    uuid not null default auth.uid() references equipe(user_id),
  criado_em   timestamptz not null default now()
);

alter table vagas add column empresa_id uuid references empresas(id) on delete set null;

alter table empresas enable row level security;
alter table empresa_interacoes enable row level security;
revoke all on empresas, empresa_interacoes from anon;
create policy emp_ler     on empresas for select to authenticated using (papel_atual() is not null);
create policy emp_criar   on empresas for insert to authenticated with check (papel_atual() in ('admin', 'recrutador'));
create policy emp_editar  on empresas for update to authenticated using (papel_atual() in ('admin', 'recrutador')) with check (papel_atual() in ('admin', 'recrutador'));
create policy emp_apagar  on empresas for delete to authenticated using (papel_atual() = 'admin');
create policy empi_ler    on empresa_interacoes for select to authenticated using (papel_atual() is not null);
create policy empi_criar  on empresa_interacoes for insert to authenticated with check (papel_atual() in ('admin', 'recrutador') and autor_id = auth.uid());

-- ---------------------------------------------------------------- equipe vincula candidatos do banco a vagas
create policy cand_vaga_criar   on candidaturas for insert to authenticated with check (papel_atual() in ('admin', 'recrutador'));
create policy cand_vaga_apagar  on candidaturas for delete to authenticated using (papel_atual() = 'admin');

-- ---------------------------------------------------------------- resumo do painel (visão geral)
-- Roda com as permissões de quem chama (RLS vale): fora da equipe, tudo volta zerado.
create or replace function painel_resumo() returns json
language sql stable set search_path = public as $$
  select json_build_object(
    'ativos',            (select count(*) from candidatos where excluido_em is null),
    'novos_30',          (select count(*) from candidatos where excluido_em is null and criado_em >= now() - interval '30 days'),
    'checkin_pendente',  (select count(*) from candidatos where excluido_em is null and proximo_checkin <= current_date),
    'retencao_vencida',  (select count(*) from candidatos where excluido_em is null and reter_ate < current_date),
    'compartilhar_ok',   (select count(distinct c.candidato_id) from (
                            select distinct on (candidato_id) candidato_id, concedido from consentimentos
                             where finalidade = 'compartilhar_empresas' order by candidato_id, registrado_em desc) c
                           join candidatos k on k.id = c.candidato_id and k.excluido_em is null where c.concedido),
    'por_mes',      (select coalesce(json_agg(json_build_object('mes', mes, 'n', n) order by mes), '[]') from (
                       select to_char(date_trunc('month', criado_em), 'YYYY-MM') mes, count(*) n from candidatos
                        where criado_em >= date_trunc('month', now()) - interval '5 months' group by 1) t),
    'por_area',     (select coalesce(json_agg(json_build_object('k', area, 'n', n) order by n desc), '[]') from (
                       select area, count(*) n from candidatos where excluido_em is null group by 1 order by 2 desc limit 8) t),
    'por_uf',       (select coalesce(json_agg(json_build_object('k', uf, 'n', n) order by n desc), '[]') from (
                       select uf, count(*) n from candidatos where excluido_em is null group by 1 order by 2 desc limit 8) t),
    'por_perfil',   (select coalesce(json_agg(json_build_object('k', coalesce(perfil_predominante, 'sem'), 'n', n)), '[]') from (
                       select perfil_predominante, count(*) n from candidatos where excluido_em is null group by 1) t),
    'por_modalidade', (select coalesce(json_agg(json_build_object('k', modalidade, 'n', n)), '[]') from (
                       select modalidade, count(*) n from candidatos where excluido_em is null group by 1) t),
    'vagas',        (select coalesce(json_agg(json_build_object('k', status, 'n', n)), '[]') from (
                       select status, count(*) n from vagas group by 1) t),
    'candidaturas', (select coalesce(json_agg(json_build_object('k', etapa, 'n', n)), '[]') from (
                       select etapa, count(*) n from candidaturas group by 1) t),
    'empresas',     (select coalesce(json_agg(json_build_object('k', etapa, 'n', n, 'valor', v)), '[]') from (
                       select etapa, count(*) n, coalesce(sum(valor_estimado), 0) v from empresas group by 1) t),
    'servicos',     (select coalesce(json_agg(json_build_object('k', s, 'n', n) order by n desc), '[]') from (
                       select s, count(*) n from empresas, unnest(servicos) s where etapa not in ('perdida') group by 1) t),
    'agenda',       (select coalesce(json_agg(json_build_object('id', id, 'nome', nome, 'etapa', etapa, 'data', proximo_contato, 'passo', proximo_passo) order by proximo_contato), '[]') from (
                       select id, nome, etapa, proximo_contato, proximo_passo from empresas
                        where proximo_contato is not null and proximo_contato <= current_date + 7 and etapa not in ('perdida', 'inativo')
                        order by proximo_contato limit 10) t)
  );
$$;
revoke all on function painel_resumo() from public, anon;
grant execute on function painel_resumo() to authenticated;
