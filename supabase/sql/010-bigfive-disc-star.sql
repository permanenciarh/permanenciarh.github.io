-- =============================================================================
-- Permanência RH — atualização 010: DISC exploratório, Big Five exploratório e entrevista STAR
-- Rodar UMA vez no SQL Editor, depois do 009. Não edita nenhum arquivo já rodado.
--
-- O que cria:
--  - aval_bigfive_itens (30 afirmações) e aval_disc_itens (20 afirmações): ficam só no banco;
--    o candidato só recebe as perguntas pelo link com convite válido.
--  - novos testes no link de avaliação: 'bigfive' e 'disc' (colunas de respostas e somas em avaliacoes).
--  - avaliacao_abrir_v2 / avaliacao_enviar_v2: funções públicas novas (token válido). A pontuação é
--    calculada aqui no banco, com a chave de correção do material "Formulários de Aplicação e Correção":
--      Big Five: escala 1 a 5; itens reversos 6, 12, 18, 24, 25, 26 e 30 (valor = 6 - resposta);
--                soma de 6 itens por dimensão (6 a 30): O 1-6, C 7-12, E 13-18, A 19-24, N 25-30.
--      DISC:     escala 1 a 5, sem itens reversos; soma de 5 itens por dimensão (5 a 25):
--                D 1-5, I 6-10, S 11-15, C 16-20.
--    As funções avaliacao_abrir e avaliacao_enviar antigas NÃO são alteradas; o site passa a usar as _v2.
--  - entrevistas_star: entrevista por competências (STAR), uma por candidato e processo seletivo.
-- =============================================================================

-- ---------------------------------------------------------------- perguntas
create table aval_bigfive_itens (
  n         smallint primary key check (n between 1 and 30),
  pergunta  text not null,
  dimensao  text not null check (dimensao in ('O', 'C', 'E', 'A', 'N')),
  reverso   boolean not null default false
);
create table aval_disc_itens (
  n         smallint primary key check (n between 1 and 20),
  pergunta  text not null,
  dimensao  text not null check (dimensao in ('D', 'I', 'S', 'C'))
);
alter table aval_bigfive_itens enable row level security;
alter table aval_disc_itens    enable row level security;
revoke all on aval_bigfive_itens, aval_disc_itens from anon, authenticated;

-- ---------------------------------------------------------------- avaliacoes: novos testes
do $$
declare r record;
begin
  for r in select conname from pg_constraint
            where conrelid = 'public.avaliacoes'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%cardinality(testes)%'
  loop
    execute format('alter table avaliacoes drop constraint %I', r.conname);
  end loop;
end $$;
alter table avaliacoes add constraint avaliacoes_testes_valores
  check (cardinality(testes) between 1 and 4 and testes <@ array['eneagrama', 'perfil', 'bigfive', 'disc']::text[]);

alter table avaliacoes
  add column bigfive_respostas text check (bigfive_respostas ~ '^[1-5]{30}$'),
  add column bigfive_o smallint check (bigfive_o between 6 and 30),
  add column bigfive_c smallint check (bigfive_c between 6 and 30),
  add column bigfive_e smallint check (bigfive_e between 6 and 30),
  add column bigfive_a smallint check (bigfive_a between 6 and 30),
  add column bigfive_n smallint check (bigfive_n between 6 and 30),
  add column disc_respostas text check (disc_respostas ~ '^[1-5]{20}$'),
  add column disc_d smallint check (disc_d between 5 and 25),
  add column disc_i smallint check (disc_i between 5 and 25),
  add column disc_s smallint check (disc_s between 5 and 25),
  add column disc_c smallint check (disc_c between 5 and 25);
-- (a permissão de leitura de avaliacoes para a equipe já vale para as colunas novas)

-- ---------------------------------------------------------------- funções públicas (link do candidato)
create or replace function avaliacao_abrir_v2(p_token text) returns json
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
      (select json_agg(json_build_object('q', pergunta, 'o', (select json_agg(json_build_object('k', o->>'k', 't', o->>'t')) from jsonb_array_elements(opcoes) o)) order by n) from aval_perfil_itens) end,
    'disc', case when 'disc' = any(a.testes) then
      (select json_agg(json_build_object('q', pergunta) order by n) from aval_disc_itens) end,
    'bigfive', case when 'bigfive' = any(a.testes) then
      (select json_agg(json_build_object('q', pergunta) order by n) from aval_bigfive_itens) end
  );
end $$;

create or replace function avaliacao_enviar_v2(
  p_token text, p_aceite boolean,
  p_eneagrama text default null, p_perfil text default null,
  p_bigfive text default null, p_disc text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  a avaliacoes;
  v_pontos smallint[]; v_tipo smallint;
  v_i int; v_c int; v_o int; v_a int; v_pred text;
  b_o int; b_c int; b_e int; b_a int; b_n int;
  d_d int; d_i int; d_s int; d_c int;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return json_build_object('ok', false, 'erro', 'invalido'); end if;
  select * into a from avaliacoes where token = p_token for update;
  if not found or a.status = 'cancelada' then return json_build_object('ok', false, 'erro', 'invalido'); end if;
  if a.status = 'concluida' then return json_build_object('ok', false, 'erro', 'concluida'); end if;
  if a.expira_em < now() then return json_build_object('ok', false, 'erro', 'expirada'); end if;
  if p_aceite is not true then return json_build_object('ok', false, 'erro', 'sem_aceite'); end if;

  if 'eneagrama' = any(a.testes) then
    if p_eneagrama is null or p_eneagrama !~ '^[AB]{36}$' then return json_build_object('ok', false, 'erro', 'incompleto'); end if;
    select array_agg(coalesce(x.n, 0)::smallint order by t.t) into v_pontos
      from generate_series(1, 9) t(t)
      left join (select case when substr(p_eneagrama, i.n, 1) = 'A' then i.tipo_a else i.tipo_b end tipo, count(*) n
                   from aval_eneagrama_itens i group by 1) x on x.tipo = t.t;
    select t into v_tipo from unnest(v_pontos) with ordinality u(p, t) order by p desc, t limit 1;
  end if;

  if 'perfil' = any(a.testes) then
    if p_perfil is null or p_perfil !~ '^[ICOA]{25}$' then return json_build_object('ok', false, 'erro', 'incompleto'); end if;
    v_i := 4 * (length(p_perfil) - length(replace(p_perfil, 'I', '')));
    v_c := 4 * (length(p_perfil) - length(replace(p_perfil, 'C', '')));
    v_o := 4 * (length(p_perfil) - length(replace(p_perfil, 'O', '')));
    v_a := 4 * (length(p_perfil) - length(replace(p_perfil, 'A', '')));
    v_pred := case greatest(v_i, v_c, v_o, v_a) when v_i then 'aguia' when v_c then 'gato' when v_o then 'lobo' else 'tubarao' end;
  end if;

  if 'bigfive' = any(a.testes) then
    if p_bigfive is null or p_bigfive !~ '^[1-5]{30}$' then return json_build_object('ok', false, 'erro', 'incompleto'); end if;
    select
      sum(v) filter (where dimensao = 'O'), sum(v) filter (where dimensao = 'C'), sum(v) filter (where dimensao = 'E'),
      sum(v) filter (where dimensao = 'A'), sum(v) filter (where dimensao = 'N')
    into b_o, b_c, b_e, b_a, b_n
    from (select i.dimensao, case when i.reverso then 6 - substr(p_bigfive, i.n::int, 1)::int else substr(p_bigfive, i.n::int, 1)::int end as v
            from aval_bigfive_itens i) x;
  end if;

  if 'disc' = any(a.testes) then
    if p_disc is null or p_disc !~ '^[1-5]{20}$' then return json_build_object('ok', false, 'erro', 'incompleto'); end if;
    select
      sum(v) filter (where dimensao = 'D'), sum(v) filter (where dimensao = 'I'),
      sum(v) filter (where dimensao = 'S'), sum(v) filter (where dimensao = 'C')
    into d_d, d_i, d_s, d_c
    from (select i.dimensao, substr(p_disc, i.n::int, 1)::int as v from aval_disc_itens i) x;
  end if;

  update avaliacoes set
    status = 'concluida', aceite_em = now(), respondido_em = now(),
    eneagrama_respostas = case when 'eneagrama' = any(a.testes) then p_eneagrama end,
    eneagrama_pontos = v_pontos, eneagrama_tipo = v_tipo,
    perfil_respostas = case when 'perfil' = any(a.testes) then p_perfil end,
    perfil_aguia = v_i, perfil_gato = v_c, perfil_lobo = v_o, perfil_tubarao = v_a, perfil_predominante = v_pred,
    bigfive_respostas = case when 'bigfive' = any(a.testes) then p_bigfive end,
    bigfive_o = b_o, bigfive_c = b_c, bigfive_e = b_e, bigfive_a = b_a, bigfive_n = b_n,
    disc_respostas = case when 'disc' = any(a.testes) then p_disc end,
    disc_d = d_d, disc_i = d_i, disc_s = d_s, disc_c = d_c
  where id = a.id;
  return json_build_object('ok', true);
end $$;

revoke all on function avaliacao_abrir_v2(text), avaliacao_enviar_v2(text, boolean, text, text, text, text) from public;
grant execute on function avaliacao_abrir_v2(text), avaliacao_enviar_v2(text, boolean, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------- entrevista por competências (STAR)
create table entrevistas_star (
  id                 uuid primary key default gen_random_uuid(),
  candidato_id       uuid not null references candidatos(id) on delete cascade,
  candidatura_id     bigint references candidaturas(id) on delete cascade,   -- vazio = banco de talentos, sem vaga
  entrevistador      text check (char_length(entrevistador) <= 160),
  etapa              text check (char_length(etapa) <= 80),
  data_entrevista    date,
  -- lista de {id, s, t, a, r, evidencias, nota ('1'..'4' ou 'NE'), justificativa}
  competencias       jsonb not null default '[]'::jsonb check (jsonb_typeof(competencias) = 'array' and char_length(competencias::text) <= 40000),
  pontos_fortes      text check (char_length(pontos_fortes) <= 3000),
  pontos_aprofundar  text check (char_length(pontos_aprofundar) <= 3000),
  sintese_requisitos text check (char_length(sintese_requisitos) <= 4000),
  atualizado_por     uuid default auth.uid() references equipe(user_id),
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create unique index entrevistas_star_uma_por_processo on entrevistas_star (candidato_id, coalesce(candidatura_id, 0));
create trigger trg_star_atualizado before update on entrevistas_star for each row execute function tocar_atualizado_em();

alter table entrevistas_star enable row level security;
revoke all on entrevistas_star from anon;
grant select, insert, update, delete on entrevistas_star to authenticated;
create policy star_ler    on entrevistas_star for select to authenticated using (papel_atual() in ('admin', 'recrutador'));
create policy star_criar  on entrevistas_star for insert to authenticated with check (papel_atual() in ('admin', 'recrutador'));
create policy star_editar on entrevistas_star for update to authenticated using (papel_atual() in ('admin', 'recrutador')) with check (papel_atual() in ('admin', 'recrutador'));
create policy star_apagar on entrevistas_star for delete to authenticated using (papel_atual() = 'admin');

-- Exclusão do candidato apaga também as entrevistas STAR (mesmo gatilho de antes, função nova)
create or replace function limpar_star_excluido() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from entrevistas_star where candidato_id = new.id;
  return new;
end $$;
create trigger trg_limpar_star after update of excluido_em on candidatos
  for each row when (new.excluido_em is not null and old.excluido_em is null)
  execute function limpar_star_excluido();
revoke all on function limpar_star_excluido() from public, anon, authenticated;

-- ---------------------------------------------------------------- perguntas
-- Textos do material "Formulários de Aplicação e Correção" (Big Five exploratório e DISC exploratório).
insert into aval_bigfive_itens (n, pergunta, dimensao, reverso) values
  (1, 'Gosto de explorar ideias ou maneiras diferentes de resolver um problema.', 'O', false),
  (2, 'Tenho curiosidade por assuntos que ainda não conheço.', 'O', false),
  (3, 'Considero perspectivas diferentes antes de formar uma opinião.', 'O', false),
  (4, 'Tenho interesse em experimentar métodos novos quando há espaço para isso.', 'O', false),
  (5, 'Imaginar possibilidades alternativas costuma me ajudar a pensar.', 'O', false),
  (6, 'Prefiro evitar assuntos novos ou desconhecidos.', 'O', true),
  (7, 'Organizo minhas tarefas para não depender apenas da memória.', 'C', false),
  (8, 'Costumo cumprir os combinados dentro do prazo.', 'C', false),
  (9, 'Confiro detalhes importantes antes de concluir um trabalho.', 'C', false),
  (10, 'Divido tarefas grandes em etapas menores.', 'C', false),
  (11, 'Mantenho o foco quando uma atividade exige esforço prolongado.', 'C', false),
  (12, 'Frequentemente deixo tarefas importantes para a última hora.', 'C', true),
  (13, 'Tenho facilidade para iniciar conversas em grupos.', 'E', false),
  (14, 'Costumo compartilhar minhas ideias em reuniões.', 'E', false),
  (15, 'Interações frequentes geralmente me dão energia.', 'E', false),
  (16, 'Sinto-me confortável ao me apresentar a pessoas novas.', 'E', false),
  (17, 'Procuro participar ativamente de atividades em grupo.', 'E', false),
  (18, 'Prefiro permanecer em silêncio em grupos, mesmo tendo algo relevante a contribuir.', 'E', true),
  (19, 'Procuro entender o ponto de vista de alguém antes de discordar.', 'A', false),
  (20, 'Em desacordos, tento encontrar uma solução respeitosa.', 'A', false),
  (21, 'Ofereço ajuda quando percebo alguém sobrecarregado.', 'A', false),
  (22, 'Consigo dar feedback com respeito, mesmo ao abordar um problema.', 'A', false),
  (23, 'Considero como minhas decisões afetam outras pessoas.', 'A', false),
  (24, 'Desconsidero preocupações alheias para encerrar logo uma discussão.', 'A', true),
  (25, 'Quando algo dá errado, consigo recuperar o foco depois de algum tempo.', 'N', true),
  (26, 'Em situações exigentes, consigo administrar minhas reações.', 'N', true),
  (27, 'Uma crítica costuma permanecer na minha cabeça por muito tempo.', 'N', false),
  (28, 'Diante de incertezas, frequentemente fico preocupado com o que pode dar errado.', 'N', false),
  (29, 'Em períodos de pressão, tenho dificuldade para relaxar após o expediente.', 'N', false),
  (30, 'Quando enfrento um imprevisto, consigo pensar nos próximos passos.', 'N', true);

insert into aval_disc_itens (n, pergunta, dimensao) values
  (1, 'Quando surge um problema, gosto de agir rapidamente para destravá-lo.', 'D'),
  (2, 'Sinto-me confortável para decidir com informações incompletas quando necessário.', 'D'),
  (3, 'Defendo uma posição com firmeza quando considero importante.', 'D'),
  (4, 'Gosto de desafios que exigem iniciativa e urgência.', 'D'),
  (5, 'Em uma situação difícil, tendo a assumir a frente.', 'D'),
  (6, 'Tenho facilidade para envolver pessoas por meio da conversa.', 'I'),
  (7, 'Costumo expressar minhas ideias com entusiasmo.', 'I'),
  (8, 'Sinto-me confortável em apresentar propostas a um grupo.', 'I'),
  (9, 'Procuro criar proximidade e manter um clima positivo.', 'I'),
  (10, 'Gosto de mobilizar pessoas em torno de uma ideia.', 'I'),
  (11, 'Prefiro construir confiança antes de promover mudanças importantes.', 'S'),
  (12, 'Ouço as pessoas com paciência antes de responder.', 'S'),
  (13, 'Valorizo rotina previsível e combinados claros.', 'S'),
  (14, 'Procuro manter a cooperação mesmo quando há tensão.', 'S'),
  (15, 'Gosto de entender como uma mudança afetará as pessoas.', 'S'),
  (16, 'Verifico dados e detalhes antes de concluir.', 'C'),
  (17, 'Prefiro processos, critérios e responsabilidades claros.', 'C'),
  (18, 'Identifico inconsistências que podem passar despercebidas.', 'C'),
  (19, 'Comparo alternativas antes de escolher uma solução.', 'C'),
  (20, 'Tenho cuidado para seguir padrões e requisitos importantes.', 'C');

-- Conferência: deve mostrar 30 e 20 (7 itens reversos).
select (select count(*) from aval_bigfive_itens) as bigfive,
       (select count(*) from aval_disc_itens) as disc,
       (select count(*) from aval_bigfive_itens where reverso) as bigfive_reversos;
