-- =============================================================================
-- Permanência RH — atualização 009: cadastro com nome social, 3 opções de cargo,
-- experiência total x no cargo e competências marcadas em lista.
-- Rodar UMA vez no SQL Editor, depois do 008.
-- =============================================================================

-- ---------------------------------------------------------------- novos campos
alter table candidatos add column nome_social       text check (char_length(nome_social) between 2 and 120);
alter table candidatos add column cargo_desejado_2  text check (char_length(cargo_desejado_2) <= 100);
alter table candidatos add column cargo_desejado_3  text check (char_length(cargo_desejado_3) <= 100);
alter table candidatos add column experiencia_cargo text check (char_length(experiencia_cargo) <= 40);

comment on column candidatos.experiencia       is 'Tempo total de experiência profissional (faixa)';
comment on column candidatos.experiencia_cargo is 'Tempo de experiência no cargo da 1ª opção (faixa)';
comment on column candidatos.nome_social       is 'Nome pelo qual a pessoa quer ser chamada (Decreto 8.727/2016)';

-- Competências agora vêm de uma lista marcada + "outras": limite sobe de 300 para 800 caracteres
do $$
declare r record;
begin
  for r in select conname from pg_constraint
            where conrelid = 'candidatos'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%competencias%'
  loop
    execute format('alter table candidatos drop constraint %I', r.conname);
  end loop;
end $$;
alter table candidatos add constraint candidatos_competencias_tam check (char_length(competencias) <= 800);

-- ---------------------------------------------------------------- exclusão do titular
-- Ao anonimizar (excluido_em preenchido), os campos novos também são apagados.
create or replace function limpar_campos_cadastro_v2() returns trigger
language plpgsql set search_path = public as $$
begin
  new.nome_social := null;
  new.cargo_desejado_2 := null;
  new.cargo_desejado_3 := null;
  new.experiencia_cargo := null;
  return new;
end $$;
create trigger trg_limpar_cadastro_v2 before update of excluido_em on candidatos
  for each row when (new.excluido_em is not null and old.excluido_em is null)
  execute function limpar_campos_cadastro_v2();
revoke all on function limpar_campos_cadastro_v2() from public, anon, authenticated;

-- ---------------------------------------------------------------- perfil para empresas (sem nome, como antes)
create or replace view perfis_compartilhaveis with (security_invoker = true) as
select c.codigo, c.area, c.cargo_desejado, c.resumo, c.experiencia, c.escolaridade,
       c.competencias, c.idiomas, c.modalidade, c.tipos_oportunidade, c.cidade, c.uf, c.disponibilidade,
       c.cargo_desejado_2, c.cargo_desejado_3, c.experiencia_cargo
from candidatos c
where c.excluido_em is null
  and (select k.concedido from consentimentos k
       where k.candidato_id = c.id and k.finalidade = 'compartilhar_empresas'
       order by k.registrado_em desc limit 1) is true;

-- ---------------------------------------------------------------- link de avaliação chama pelo nome social
create or replace function avaliacao_abrir(p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare a avaliacoes; v_nome text; v_vaga text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return json_build_object('estado', 'invalido'); end if;
  select * into a from avaliacoes where token = p_token;
  if not found or a.status = 'cancelada' then return json_build_object('estado', 'invalido'); end if;
  if a.status = 'concluida' then return json_build_object('estado', 'concluida'); end if;
  if a.expira_em < now() then return json_build_object('estado', 'expirada', 'expira_em', a.expira_em); end if;
  select split_part(trim(coalesce(nullif(trim(c.nome_social), ''), c.nome)), ' ', 1) into v_nome
    from candidatos c where c.id = a.candidato_id and c.excluido_em is null;
  if v_nome is null then return json_build_object('estado', 'invalido'); end if;
  select v.titulo into v_vaga from candidaturas k join vagas v on v.id = k.vaga_id where k.id = a.candidatura_id;
  update avaliacoes set aberto_em = coalesce(aberto_em, now()) where id = a.id;
  return json_build_object(
    'estado', 'ok', 'nome', v_nome, 'vaga', v_vaga, 'testes', a.testes, 'expira_em', a.expira_em,
    'eneagrama', case when 'eneagrama' = any(a.testes) then
      (select json_agg(json_build_object('q', pergunta, 'a', opcao_a, 'b', opcao_b) order by n) from aval_eneagrama_itens) end,
    'perfil', case when 'perfil' = any(a.testes) then
      (select json_agg(json_build_object('q', pergunta, 'o', (select json_agg(json_build_object('k', o->>'k', 't', o->>'t')) from jsonb_array_elements(opcoes) o)) order by n) from aval_perfil_itens) end
  );
end $$;

-- Conferência: deve mostrar 4.
select count(*) as campos_novos from information_schema.columns
 where table_name = 'candidatos' and column_name in ('nome_social', 'cargo_desejado_2', 'cargo_desejado_3', 'experiencia_cargo');
