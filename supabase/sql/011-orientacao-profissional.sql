-- =============================================================================
-- Permanência RH — atualização 011: orientação de profissionais
-- Rodar UMA vez no SQL Editor, depois do 010. Não edita nenhum arquivo já rodado.
--
-- O que cria:
--  - orientacao_clientes: pessoas atendidas em orientação de carreira (separadas do Banco de Talentos).
--  - avaliacoes e entrevistas_star passam a aceitar cliente_id no lugar de candidato_id
--    (um dos dois, nunca os dois). Os testes e a entrevista STAR são os mesmos da seleção.
--  - orientacao_roteiros: roteiro de entrevista de carreira (anotações por bloco + síntese).
--  - orientacao_relatorios: relatório da pessoa (síntese, forças, plano 30/60/90) e o link opcional
--    da página de resultado (resultado.html#t=TOKEN), com prazo e possibilidade de revogar.
--  - avaliacao_abrir_v3: como a v2, mas aceita link de cliente e informa a finalidade ('orientacao').
--    avaliacao_enviar_v2 não muda: ela só mexe em avaliacoes pelo token.
--  - orientacao_resultado_abrir: função pública da página de resultado (token válido, liberado e no prazo).
--  - orientacao_liberar / orientacao_revogar: a equipe libera ou fecha a página de resultado.
-- =============================================================================

-- ---------------------------------------------------------------- pessoas em orientação
create table orientacao_clientes (
  id               uuid primary key default gen_random_uuid(),
  codigo           text unique not null default ('ORI-' || to_char(now(), 'YYMM') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  nome             text not null check (char_length(nome) between 2 and 160),
  nome_social      text check (char_length(nome_social) <= 160),
  email            text check (char_length(email) <= 200),
  telefone         text check (char_length(telefone) <= 30),
  cidade           text check (char_length(cidade) <= 120),
  uf               text check (uf is null or uf ~ '^[A-Z]{2}$'),
  ocupacao_atual   text check (char_length(ocupacao_atual) <= 160),
  area             text check (char_length(area) <= 120),
  escolaridade     text check (char_length(escolaridade) <= 120),
  objetivo         text check (char_length(objetivo) <= 3000),
  observacoes      text check (char_length(observacoes) <= 3000),
  status           text not null default 'em_atendimento' check (status in ('em_atendimento', 'pausado', 'concluido')),
  autorizacao_em   date not null default current_date,
  autorizacao_forma text check (char_length(autorizacao_forma) <= 200),
  criado_por       uuid default auth.uid() references equipe(user_id),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create trigger trg_orientacao_clientes_atualizado before update on orientacao_clientes for each row execute function tocar_atualizado_em();
alter table orientacao_clientes enable row level security;
revoke all on orientacao_clientes from anon;
grant select, insert, update, delete on orientacao_clientes to authenticated;
create policy ori_cli_ler    on orientacao_clientes for select to authenticated using (papel_atual() in ('admin', 'recrutador'));
create policy ori_cli_criar  on orientacao_clientes for insert to authenticated with check (papel_atual() in ('admin', 'recrutador'));
create policy ori_cli_editar on orientacao_clientes for update to authenticated using (papel_atual() in ('admin', 'recrutador')) with check (papel_atual() in ('admin', 'recrutador'));
create policy ori_cli_apagar on orientacao_clientes for delete to authenticated using (papel_atual() = 'admin');

-- ---------------------------------------------------------------- avaliacoes e STAR aceitam cliente
alter table avaliacoes alter column candidato_id drop not null;
alter table avaliacoes add column cliente_id uuid references orientacao_clientes(id) on delete cascade;
alter table avaliacoes add constraint avaliacoes_um_titular check (num_nonnulls(candidato_id, cliente_id) = 1);
alter table avaliacoes add constraint avaliacoes_cliente_sem_vaga check (cliente_id is null or candidatura_id is null);
create index avaliacoes_cliente on avaliacoes (cliente_id, criado_em desc) where cliente_id is not null;

alter table entrevistas_star alter column candidato_id drop not null;
alter table entrevistas_star add column cliente_id uuid references orientacao_clientes(id) on delete cascade;
alter table entrevistas_star add constraint star_um_titular check (num_nonnulls(candidato_id, cliente_id) = 1);
alter table entrevistas_star add constraint star_cliente_sem_vaga check (cliente_id is null or candidatura_id is null);
create unique index entrevistas_star_uma_por_cliente on entrevistas_star (cliente_id) where cliente_id is not null;

-- auditoria dos links: passa a funcionar também para clientes
create or replace function auditar_avaliacoes() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ent text := case when new.cliente_id is not null then 'orientacao_clientes' else 'candidatos' end;
        v_id  text := coalesce(new.cliente_id, new.candidato_id)::text;
begin
  if tg_op = 'INSERT' then
    insert into auditoria (ator_id, acao, entidade, entidade_id, detalhes)
    values (auth.uid(), 'avaliacao_enviada', v_ent, v_id, jsonb_build_object('testes', new.testes));
  elsif new.status is distinct from old.status then
    insert into auditoria (ator_id, acao, entidade, entidade_id, detalhes)
    values (auth.uid(), 'avaliacao_' || new.status, v_ent, v_id, jsonb_build_object('testes', new.testes));
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- roteiro de entrevista de carreira
create table orientacao_roteiros (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null unique references orientacao_clientes(id) on delete cascade,
  entrevistador   text check (char_length(entrevistador) <= 160),
  data_sessao     date,
  -- lista de {id, notas}
  blocos          jsonb not null default '[]'::jsonb check (jsonb_typeof(blocos) = 'array' and char_length(blocos::text) <= 40000),
  sintese         text check (char_length(sintese) <= 4000),
  atualizado_por  uuid default auth.uid() references equipe(user_id),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create trigger trg_orientacao_roteiros_atualizado before update on orientacao_roteiros for each row execute function tocar_atualizado_em();
alter table orientacao_roteiros enable row level security;
revoke all on orientacao_roteiros from anon;
grant select, insert, update, delete on orientacao_roteiros to authenticated;
create policy ori_rot_ler    on orientacao_roteiros for select to authenticated using (papel_atual() in ('admin', 'recrutador'));
create policy ori_rot_criar  on orientacao_roteiros for insert to authenticated with check (papel_atual() in ('admin', 'recrutador'));
create policy ori_rot_editar on orientacao_roteiros for update to authenticated using (papel_atual() in ('admin', 'recrutador')) with check (papel_atual() in ('admin', 'recrutador'));
create policy ori_rot_apagar on orientacao_roteiros for delete to authenticated using (papel_atual() = 'admin');

-- ---------------------------------------------------------------- relatório da pessoa + página de resultado
create table orientacao_relatorios (
  id                 uuid primary key default gen_random_uuid(),
  cliente_id         uuid not null unique references orientacao_clientes(id) on delete cascade,
  objetivo           text check (char_length(objetivo) <= 1000),
  sintese            text check (char_length(sintese) <= 8000),
  pontos_fortes      text check (char_length(pontos_fortes) <= 3000),
  pontos_desenvolver text check (char_length(pontos_desenvolver) <= 3000),
  areas_exploracao   text check (char_length(areas_exploracao) <= 3000),
  plano_30           text check (char_length(plano_30) <= 2000),
  plano_60           text check (char_length(plano_60) <= 2000),
  plano_90           text check (char_length(plano_90) <= 2000),
  proximos_passos    text check (char_length(proximos_passos) <= 2000),
  responsavel        text check (char_length(responsavel) <= 160),
  incluir_testes     boolean not null default true,
  -- página de resultado: só existe enquanto token e liberado_em estiverem preenchidos
  token              text unique check (token is null or token ~ '^[0-9a-f]{64}$'),
  liberado_em        timestamptz,
  expira_em          timestamptz,
  aberto_em          timestamptz,
  atualizado_por     uuid default auth.uid() references equipe(user_id),
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create trigger trg_orientacao_relatorios_atualizado before update on orientacao_relatorios for each row execute function tocar_atualizado_em();
alter table orientacao_relatorios enable row level security;
revoke all on orientacao_relatorios from anon;
grant select, insert, delete on orientacao_relatorios to authenticated;
-- token e datas de liberação não são editáveis direto: só pelas funções orientacao_liberar / orientacao_revogar
grant update (objetivo, sintese, pontos_fortes, pontos_desenvolver, areas_exploracao, plano_30, plano_60, plano_90, proximos_passos, responsavel, incluir_testes, atualizado_por) on orientacao_relatorios to authenticated;
create policy ori_rel_ler    on orientacao_relatorios for select to authenticated using (papel_atual() in ('admin', 'recrutador'));
create policy ori_rel_criar  on orientacao_relatorios for insert to authenticated with check (papel_atual() in ('admin', 'recrutador') and token is null and liberado_em is null);
create policy ori_rel_editar on orientacao_relatorios for update to authenticated using (papel_atual() in ('admin', 'recrutador')) with check (papel_atual() in ('admin', 'recrutador'));
create policy ori_rel_apagar on orientacao_relatorios for delete to authenticated using (papel_atual() = 'admin');

create or replace function orientacao_liberar(p_cliente uuid, p_dias int default 30) returns text
language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  if papel_atual() not in ('admin', 'recrutador') then raise exception 'sem_permissao'; end if;
  if p_dias is null or p_dias not between 1 and 90 then raise exception 'prazo_invalido'; end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  update orientacao_relatorios set token = v_token, liberado_em = now(), expira_em = now() + make_interval(days => p_dias), aberto_em = null
   where cliente_id = p_cliente;
  if not found then raise exception 'salve_o_relatorio_antes'; end if;
  insert into auditoria (ator_id, acao, entidade, entidade_id, detalhes)
  values (auth.uid(), 'orientacao_resultado_liberado', 'orientacao_clientes', p_cliente::text, jsonb_build_object('dias', p_dias));
  return v_token;
end $$;

create or replace function orientacao_revogar(p_cliente uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if papel_atual() not in ('admin', 'recrutador') then raise exception 'sem_permissao'; end if;
  update orientacao_relatorios set token = null, liberado_em = null, expira_em = null where cliente_id = p_cliente;
  insert into auditoria (ator_id, acao, entidade, entidade_id) values (auth.uid(), 'orientacao_resultado_revogado', 'orientacao_clientes', p_cliente::text);
end $$;

-- Página pública de resultado: devolve só o primeiro nome, o texto do relatório e as somas dos testes.
create or replace function orientacao_resultado_abrir(p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare r orientacao_relatorios; v_nome text; v_disc json; v_b5 json;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return json_build_object('estado', 'invalido'); end if;
  select * into r from orientacao_relatorios where token = p_token and liberado_em is not null;
  if not found then return json_build_object('estado', 'invalido'); end if;
  if r.expira_em < now() then return json_build_object('estado', 'expirado', 'expira_em', r.expira_em); end if;
  select split_part(trim(coalesce(nullif(trim(nome_social), ''), nome)), ' ', 1) into v_nome from orientacao_clientes where id = r.cliente_id;
  if v_nome is null then return json_build_object('estado', 'invalido'); end if;
  if r.incluir_testes then
    select json_build_object('D', disc_d, 'I', disc_i, 'S', disc_s, 'C', disc_c, 'data', respondido_em) into v_disc
      from avaliacoes where cliente_id = r.cliente_id and status = 'concluida' and disc_d is not null order by respondido_em desc limit 1;
    select json_build_object('O', bigfive_o, 'C', bigfive_c, 'E', bigfive_e, 'A', bigfive_a, 'N', bigfive_n, 'data', respondido_em) into v_b5
      from avaliacoes where cliente_id = r.cliente_id and status = 'concluida' and bigfive_o is not null order by respondido_em desc limit 1;
  end if;
  update orientacao_relatorios set aberto_em = coalesce(aberto_em, now()) where id = r.id;
  return json_build_object(
    'estado', 'ok', 'nome', v_nome, 'data', r.atualizado_em, 'expira_em', r.expira_em,
    'objetivo', r.objetivo, 'sintese', r.sintese, 'pontos_fortes', r.pontos_fortes, 'pontos_desenvolver', r.pontos_desenvolver,
    'areas_exploracao', r.areas_exploracao, 'plano_30', r.plano_30, 'plano_60', r.plano_60, 'plano_90', r.plano_90,
    'proximos_passos', r.proximos_passos, 'responsavel', r.responsavel, 'disc', v_disc, 'bigfive', v_b5
  );
end $$;

-- ---------------------------------------------------------------- link de avaliação v3 (seleção ou orientação)
create or replace function avaliacao_abrir_v3(p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare a avaliacoes; v_nome text; v_vaga text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return json_build_object('estado', 'invalido'); end if;
  select * into a from avaliacoes where token = p_token;
  if not found or a.status = 'cancelada' then return json_build_object('estado', 'invalido'); end if;
  if a.status = 'concluida' then return json_build_object('estado', 'concluida'); end if;
  if a.expira_em < now() then return json_build_object('estado', 'expirada', 'expira_em', a.expira_em); end if;
  if a.cliente_id is not null then
    select split_part(trim(coalesce(nullif(trim(c.nome_social), ''), c.nome)), ' ', 1) into v_nome from orientacao_clientes c where c.id = a.cliente_id;
  else
    select split_part(trim(coalesce(nullif(trim(c.nome_social), ''), c.nome)), ' ', 1) into v_nome
      from candidatos c where c.id = a.candidato_id and c.excluido_em is null;
    select v.titulo into v_vaga from candidaturas k join vagas v on v.id = k.vaga_id where k.id = a.candidatura_id;
  end if;
  if v_nome is null then return json_build_object('estado', 'invalido'); end if;
  update avaliacoes set aberto_em = coalesce(aberto_em, now()) where id = a.id;
  return json_build_object(
    'estado', 'ok', 'nome', v_nome, 'vaga', v_vaga, 'testes', a.testes, 'expira_em', a.expira_em,
    'finalidade', case when a.cliente_id is not null then 'orientacao' else 'selecao' end,
    'eneagrama', case when 'eneagrama' = any(a.testes) then
      (select json_agg(json_build_object('q', pergunta, 'a', opcao_a, 'b', opcao_b) order by n) from aval_eneagrama_itens) end,
    'perfil', case when 'perfil' = any(a.testes) then
      (select json_agg(json_build_object('q', pergunta, 'o', (select json_agg(json_build_object('k', o->>'k', 't', o->>'t')) from jsonb_array_elements(opcoes) o)) order by n) from aval_perfil_itens) end,
    'disc', case when 'disc' = any(a.testes) then
      (select json_agg(json_build_object('q', pergunta) order by n) from aval_disc_itens) end,
    'bigfive', case when 'bigfive' = any(a.testes) then
      (select json_agg(json_build_object('q', pergunta) order by n) from aval_bigfive_itens) end
  );
end $$;

-- registro de acesso da equipe à ficha e ao relatório da pessoa (sem dados pessoais no registro)
create or replace function registrar_acesso_orientacao(p_cliente uuid, p_acao text default 'ver_ficha') returns void
language plpgsql security definer set search_path = public as $$
begin
  if papel_atual() not in ('admin', 'recrutador') then raise exception 'sem_permissao'; end if;
  if p_acao not in ('ver_ficha', 'ver_relatorio') then raise exception 'acao_invalida'; end if;
  insert into auditoria (ator_id, acao, entidade, entidade_id) values (auth.uid(), 'orientacao_' || p_acao, 'orientacao_clientes', p_cliente::text);
end $$;

revoke all on function orientacao_resultado_abrir(text), avaliacao_abrir_v3(text), orientacao_liberar(uuid, int), orientacao_revogar(uuid), registrar_acesso_orientacao(uuid, text) from public;
grant execute on function orientacao_resultado_abrir(text), avaliacao_abrir_v3(text) to anon, authenticated;
grant execute on function orientacao_liberar(uuid, int), orientacao_revogar(uuid), registrar_acesso_orientacao(uuid, text) to authenticated;
revoke all on function auditar_avaliacoes() from public, anon, authenticated;

-- verificação final: deve devolver 4 tabelas
select count(*) as tabelas_orientacao from information_schema.tables
 where table_schema = 'public' and table_name in ('orientacao_clientes', 'orientacao_roteiros', 'orientacao_relatorios', 'entrevistas_star');
