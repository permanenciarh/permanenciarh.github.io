-- =============================================================================
-- Permanência RH — atualização 003: CPF (opcional) e CNH no cadastro
-- Rodar UMA vez no SQL Editor, depois do 002.
-- =============================================================================
alter table candidatos add column cpf text check (cpf ~ '^[0-9]{11}$');
alter table candidatos add column cnh_categoria text check (cnh_categoria in ('nao_possui', 'A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE'));
alter table candidatos add column cnh_ear boolean not null default false;
create unique index candidatos_cpf_unico on candidatos (cpf) where cpf is not null and excluido_em is null;
create index candidatos_cnh on candidatos (cnh_categoria) where excluido_em is null;

-- anonimização também apaga CPF e CNH
create or replace function anonimizar_candidato(p_candidato uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if papel_atual() is distinct from 'admin' then raise exception 'sem_permissao'; end if;
  update candidatos set
    nome = 'Anonimizado', email = 'anonimizado+' || id || '@invalid', telefone = null, linkedin_url = null,
    cpf = null, cnh_categoria = null, cnh_ear = false,
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
