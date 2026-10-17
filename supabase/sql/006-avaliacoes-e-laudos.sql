-- =============================================================================
-- Permanência RH — atualização 006: avaliações por link e laudo do candidato
-- Rodar UMA vez no SQL Editor, depois do 005.
--
-- O que cria:
--  - aval_eneagrama_itens / aval_perfil_itens: perguntas dos dois testes (ficam só no banco;
--    o candidato só recebe as perguntas pelo link com convite válido).
--  - avaliacoes: cada link enviado a um candidato (token, testes, prazo, respostas e resultados).
--  - laudos: laudo por candidato e por processo seletivo (vaga), preenchido no painel.
--  - avaliacao_abrir / avaliacao_enviar: as duas únicas funções que o público pode chamar,
--    e só com um token válido. A pontuação é calculada aqui no banco.
-- Não altera nenhuma tabela nem função já existente.
-- =============================================================================

-- ---------------------------------------------------------------- perguntas dos testes
create table aval_eneagrama_itens (
  n         smallint primary key check (n between 1 and 36),
  pergunta  text not null,
  opcao_a   text not null,
  opcao_b   text not null,
  tipo_a    smallint not null check (tipo_a between 1 and 9),
  tipo_b    smallint not null check (tipo_b between 1 and 9)
);

create table aval_perfil_itens (
  n         smallint primary key check (n between 1 and 25),
  pergunta  text not null,
  opcoes    jsonb not null check (jsonb_typeof(opcoes) = 'array' and jsonb_array_length(opcoes) = 4)
);

-- ---------------------------------------------------------------- links de avaliação enviados
create table avaliacoes (
  id                  uuid primary key default gen_random_uuid(),
  -- 64 caracteres aleatórios (dois UUID v4): impossível de adivinhar
  token               text unique not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  candidato_id        uuid not null references candidatos(id) on delete cascade,
  candidatura_id      bigint references candidaturas(id) on delete set null,
  testes              text[] not null check (cardinality(testes) between 1 and 2 and testes <@ array['eneagrama', 'perfil']::text[]),
  status              text not null default 'pendente' check (status in ('pendente', 'concluida', 'cancelada')),
  expira_em           timestamptz not null default (now() + interval '7 days'),
  aberto_em           timestamptz,
  aceite_em           timestamptz,
  respondido_em       timestamptz,
  -- Eneagrama: 36 respostas A/B; pontos por tipo (posição 1 = tipo 1 ... posição 9 = tipo 9)
  eneagrama_respostas text check (eneagrama_respostas ~ '^[AB]{36}$'),
  eneagrama_pontos    smallint[] check (eneagrama_pontos is null or cardinality(eneagrama_pontos) = 9),
  eneagrama_tipo      smallint check (eneagrama_tipo between 1 and 9),
  -- Preferência cerebral e perfil comportamental: 25 respostas I/C/O/A; % de cada perfil (soma 100)
  perfil_respostas    text check (perfil_respostas ~ '^[ICOA]{25}$'),
  perfil_aguia        smallint check (perfil_aguia between 0 and 100),
  perfil_gato         smallint check (perfil_gato between 0 and 100),
  perfil_lobo         smallint check (perfil_lobo between 0 and 100),
  perfil_tubarao      smallint check (perfil_tubarao between 0 and 100),
  perfil_predominante text check (perfil_predominante in ('aguia', 'gato', 'lobo', 'tubarao')),
  criado_por          uuid default auth.uid() references equipe(user_id),
  criado_em           timestamptz not null default now(),
  check (status <> 'concluida' or respondido_em is not null)
);
create index avaliacoes_cand on avaliacoes (candidato_id, criado_em desc);

-- ---------------------------------------------------------------- laudo (um por candidato e processo seletivo)
create table laudos (
  id                  uuid primary key default gen_random_uuid(),
  candidato_id        uuid not null references candidatos(id) on delete cascade,
  candidatura_id      bigint references candidaturas(id) on delete cascade,   -- vazio = banco de talentos, sem vaga
  finalidade          text check (char_length(finalidade) <= 1000),
  outros_instrumentos jsonb not null default '[]'::jsonb check (jsonb_typeof(outros_instrumentos) = 'array' and char_length(outros_instrumentos::text) <= 20000),
  sintese             text check (char_length(sintese) <= 8000),
  pontos_fortes       text check (char_length(pontos_fortes) <= 3000),
  pontos_desenvolver  text check (char_length(pontos_desenvolver) <= 3000),
  conclusao           text check (conclusao in ('em_andamento', 'indicado', 'indicado_ressalvas', 'nao_indicado')),
  parecer             text check (char_length(parecer) <= 4000),
  responsavel         text check (char_length(responsavel) <= 160),
  atualizado_por      uuid default auth.uid() references equipe(user_id),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);
create unique index laudos_um_por_processo on laudos (candidato_id, coalesce(candidatura_id, 0));
create trigger trg_laudos_atualizado before update on laudos for each row execute function tocar_atualizado_em();

-- ---------------------------------------------------------------- RLS e permissões
alter table aval_eneagrama_itens enable row level security;
alter table aval_perfil_itens    enable row level security;
alter table avaliacoes           enable row level security;
alter table laudos               enable row level security;

-- Perguntas: ninguém lê direto pela API (só as funções abaixo)
revoke all on aval_eneagrama_itens, aval_perfil_itens from anon, authenticated;

-- Avaliações: admin e recrutador criam, veem e cancelam/prorrogam. Respostas só entram pela função pública.
revoke all on avaliacoes from anon, authenticated;
grant select on avaliacoes to authenticated;
grant insert (candidato_id, candidatura_id, testes, expira_em) on avaliacoes to authenticated;
grant update (status, expira_em) on avaliacoes to authenticated;
grant delete on avaliacoes to authenticated;
create policy aval_ler     on avaliacoes for select to authenticated using (papel_atual() in ('admin', 'recrutador'));
create policy aval_criar   on avaliacoes for insert to authenticated with check (papel_atual() in ('admin', 'recrutador') and status = 'pendente');
create policy aval_editar  on avaliacoes for update to authenticated using (papel_atual() in ('admin', 'recrutador')) with check (papel_atual() in ('admin', 'recrutador'));
create policy aval_apagar  on avaliacoes for delete to authenticated using (papel_atual() = 'admin');

-- Laudos: admin e recrutador
revoke all on laudos from anon;
create policy laudo_ler    on laudos for select to authenticated using (papel_atual() in ('admin', 'recrutador'));
create policy laudo_criar  on laudos for insert to authenticated with check (papel_atual() in ('admin', 'recrutador'));
create policy laudo_editar on laudos for update to authenticated using (papel_atual() in ('admin', 'recrutador')) with check (papel_atual() in ('admin', 'recrutador'));
create policy laudo_apagar on laudos for delete to authenticated using (papel_atual() = 'admin');

-- ---------------------------------------------------------------- auditoria
create or replace function auditar_avaliacoes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into auditoria (ator_id, acao, entidade, entidade_id, detalhes)
    values (auth.uid(), 'avaliacao_enviada', 'candidatos', new.candidato_id::text, jsonb_build_object('testes', new.testes));
  elsif new.status is distinct from old.status then
    insert into auditoria (ator_id, acao, entidade, entidade_id, detalhes)
    values (auth.uid(), 'avaliacao_' || new.status, 'candidatos', new.candidato_id::text, jsonb_build_object('testes', new.testes));
  end if;
  return new;
end $$;
create trigger trg_auditar_avaliacoes after insert or update on avaliacoes for each row execute function auditar_avaliacoes();

create or replace function registrar_acesso_laudo(p_candidato uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if papel_atual() not in ('admin', 'recrutador') then raise exception 'sem_permissao'; end if;
  insert into auditoria (ator_id, acao, entidade, entidade_id) values (auth.uid(), 'ver_laudo', 'candidatos', p_candidato::text);
end $$;
revoke all on function registrar_acesso_laudo(uuid) from public, anon;
grant execute on function registrar_acesso_laudo(uuid) to authenticated;

-- ---------------------------------------------------------------- exclusão do candidato apaga avaliações e laudos
-- (não mexe na função anonimizar_candidato: age quando o registro é marcado como excluído)
create or replace function limpar_avaliacoes_excluido() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from avaliacoes where candidato_id = new.id;
  delete from laudos     where candidato_id = new.id;
  return new;
end $$;
create trigger trg_limpar_avaliacoes after update of excluido_em on candidatos
  for each row when (new.excluido_em is not null and old.excluido_em is null)
  execute function limpar_avaliacoes_excluido();

-- ---------------------------------------------------------------- funções públicas (link do candidato)
-- Abre o convite: devolve o primeiro nome, os testes e as perguntas. Nada além disso.
create or replace function avaliacao_abrir(p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare a avaliacoes; v_nome text; v_vaga text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return json_build_object('estado', 'invalido'); end if;
  select * into a from avaliacoes where token = p_token;
  if not found or a.status = 'cancelada' then return json_build_object('estado', 'invalido'); end if;
  if a.status = 'concluida' then return json_build_object('estado', 'concluida'); end if;
  if a.expira_em < now() then return json_build_object('estado', 'expirada', 'expira_em', a.expira_em); end if;
  select split_part(trim(c.nome), ' ', 1) into v_nome from candidatos c where c.id = a.candidato_id and c.excluido_em is null;
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

-- Recebe as respostas, calcula os resultados e encerra o convite (uso único).
create or replace function avaliacao_enviar(p_token text, p_aceite boolean, p_eneagrama text default null, p_perfil text default null) returns json
language plpgsql security definer set search_path = public as $$
declare
  a avaliacoes;
  v_pontos smallint[]; v_tipo smallint;
  v_i int; v_c int; v_o int; v_a int; v_pred text;
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

  update avaliacoes set
    status = 'concluida', aceite_em = now(), respondido_em = now(),
    eneagrama_respostas = case when 'eneagrama' = any(a.testes) then p_eneagrama end,
    eneagrama_pontos = v_pontos, eneagrama_tipo = v_tipo,
    perfil_respostas = case when 'perfil' = any(a.testes) then p_perfil end,
    perfil_aguia = v_i, perfil_gato = v_c, perfil_lobo = v_o, perfil_tubarao = v_a, perfil_predominante = v_pred
  where id = a.id;
  return json_build_object('ok', true);
end $$;

revoke all on function avaliacao_abrir(text), avaliacao_enviar(text, boolean, text, text) from public;
grant execute on function avaliacao_abrir(text), avaliacao_enviar(text, boolean, text, text) to anon, authenticated;
revoke all on function auditar_avaliacoes(), limpar_avaliacoes_excluido() from public, anon, authenticated;

-- ---------------------------------------------------------------- perguntas
-- Textos da planilha "Etapa 2 - Testes comportamentais", com erros de digitação corrigidos.
-- Eneagrama, questão 6: vale o gabarito da planilha (A = tipo 8, B = tipo 9).
insert into aval_eneagrama_itens (n, pergunta, opcao_a, opcao_b, tipo_a, tipo_b) values
  (1, 'Eu tenho um temperamento mais:', 'Romântico e imaginativo.', 'Prático e pé-no-chão.', 4, 6),
  (2, 'Eu normalmente:', 'Não evito confrontos.', 'Evito confrontos.', 8, 9),
  (3, 'Normalmente eu sou:', 'Diplomático, charmoso e ambicioso.', 'Direto, formal e idealista.', 3, 1),
  (4, 'Eu tenho tendência de ser:', 'Direto, concentrado e intenso.', 'Espontâneo, alegre e divertido.', 5, 7),
  (5, 'Eu me considero:', 'Hospitaleiro e me sinto feliz por fazer novos amigos na vida.', 'Uma pessoa meio fechada e não me misturo facilmente com os outros.', 2, 4),
  (6, 'Normalmente:', 'É fácil eu "PERDER A CABEÇA", extrapolar.', 'É difícil eu "PERDER A CABEÇA", extrapolar.', 8, 9),
  (7, 'Eu acho que tenho vivido mais como:', 'Um sobrevivente esperto, astuto.', 'Um pensador idealista, intelectual.', 7, 1),
  (8, 'Eu:', 'Normalmente demonstro afeição às pessoas.', 'Prefiro manter as pessoas a uma certa distância.', 2, 5),
  (9, 'Quando diante de uma nova experiência, eu normalmente me pergunto se ela:', 'Poderá ser útil para mim.', 'Será agradável ou não.', 3, 7),
  (10, 'Eu penso mais, focalizo mais minha atenção:', 'Em mim mesmo.', 'Nos outros.', 4, 6),
  (11, 'As pessoas confiam mais:', 'Na minha força e capacidade de decisão.', 'Na minha capacidade intelectual.', 5, 8),
  (12, 'Ao longo do tempo eu tenho me sentido mais vezes:', 'Inseguro de mim.', 'Seguro de mim.', 6, 1),
  (13, 'Eu tenho sido mais:', 'Orientado para os relacionamentos do que orientado para os objetivos.', 'Orientado para objetivos do que orientado para os relacionamentos.', 2, 3),
  (14, 'Eu tenho:', 'Certa dificuldade para falar o que eu penso.', 'Muita facilidade de dizer coisas que outros gostariam de dizer.', 4, 7),
  (15, 'É difícil para mim:', 'Parar de considerar alternativas e agir.', 'Relaxar e ser mais flexível.', 5, 1),
  (16, 'Eu:', 'Muitas vezes sou hesitante (tenho dúvidas) e adio as coisas.', 'Geralmente sou firme e determinado.', 9, 8),
  (17, 'Minha:', 'Relutância (resistência) em me envolver demais me traz problemas com as pessoas.', 'Facilidade em ter pessoas dependendo de mim me traz problemas com elas.', 6, 2),
  (18, 'Normalmente, eu:', 'Sou capaz de colocar meus sentimentos de lado para realizar o trabalho que me compete.', 'Preciso organizar meus sentimentos antes de agir.', 3, 4),
  (19, 'Geralmente eu tenho sido:', 'Metódico e cauteloso.', 'Aventureiro e arriscado.', 6, 7),
  (20, 'Eu tenho tendência a:', 'Ser atencioso, generoso e apreciar a companhia dos outros.', 'Uma pessoa séria, reservada e que gosta de discutir ideias.', 2, 1),
  (21, 'Eu frequentemente necessito de:', 'Ser um "MODELO DE SOLIDEZ".', 'Atuar com perfeição.', 8, 3),
  (22, 'Eu normalmente estou interessado em:', 'Fazer perguntas difíceis e de manter minha independência.', 'Manter a minha estabilidade e paz de espírito.', 5, 9),
  (23, 'Eu me considero:', 'Teimoso e cético (descrente).', 'Sentimental e "coração mole".', 6, 2),
  (24, 'Me preocupo:', 'De talvez estar perdendo alguma coisa melhor.', 'Se, eu baixar a guarda, alguém pode tentar tirar vantagem de mim.', 7, 8),
  (25, 'Meu hábito de:', 'Não me envolver, de ser reservado, aborrece as pessoas.', 'Dizer às pessoas o que fazer, as aborrece.', 4, 1),
  (26, 'Normalmente, quando tenho problemas:', 'Sou capaz de me desligar, desconectar-me deles.', 'Sou capaz de extrair o melhor possível da situação.', 9, 7),
  (27, 'Normalmente eu:', 'Conto com os meus amigos e eles sabem que podem contar comigo.', 'Não conto com ninguém, eu faço as coisas por mim mesmo.', 6, 3),
  (28, 'Eu tenho tendência a ser:', 'Desligado com o mundo ao redor e preocupado com as minhas ideias.', 'Desiludido com o mundo ao redor e voltado para mim mesmo.', 5, 4),
  (29, 'Eu gosto:', 'De desafiar pessoas, de tirá-las do sério.', 'Confortar e acalmar as pessoas.', 8, 2),
  (30, 'Eu sou geralmente:', 'Uma pessoa sociável e extrovertida.', 'Uma pessoa autodisciplinada e metódica.', 7, 1),
  (31, 'Geralmente:', 'Eu fico meio acanhado (a) quando tenho que demonstrar minhas habilidades.', 'Eu gosto que as pessoas saibam o que eu posso fazer bem.', 9, 3),
  (32, 'Ultimamente:', 'Lutar pelos meus interesses pessoais tem sido mais importante para mim do que ter conforto e segurança.', 'Ter conforto e segurança tem sido mais importante para mim do que lutar por meus interesses pessoais.', 5, 6),
  (33, 'Numa discussão eu:', 'Tenho tendência a contemporizar (ganhar tempo).', 'Raramente eu dou o braço a torcer.', 4, 8),
  (34, 'De forma geral eu:', 'Concordo com facilidade e me deixo levar para não criar problemas.', 'Eu não concordo facilmente e sou muito exigente com os outros e comigo mesmo.', 9, 1),
  (35, 'Eu acho que sou mais admirado pelo meu:', 'Espírito positivo, alto astral e grande senso de humor.', 'Caráter generoso e minha disposição para ajudar.', 7, 2),
  (36, 'Muito do meu sucesso é:', 'Devido ao meu talento em causar boa impressão.', 'Conseguido apesar de não me interessar em desenvolver habilidades interpessoais.', 3, 5);

insert into aval_perfil_itens (n, pergunta, opcoes) values
  (1, 'Eu sou...', '[{"k": "I", "t": "Idealista, criativo e visionário"}, {"k": "C", "t": "Divertido, espiritual e benéfico"}, {"k": "O", "t": "Confiável, meticuloso e previsível"}, {"k": "A", "t": "Focado, determinado e persistente"}]'::jsonb),
  (2, 'Eu gosto de...', '[{"k": "A", "t": "Ser piloto"}, {"k": "C", "t": "Conversar com os passageiros"}, {"k": "O", "t": "Planejar a viagem"}, {"k": "I", "t": "Explorar novas rotas"}]'::jsonb),
  (3, 'Se você quiser se dar bem comigo...', '[{"k": "I", "t": "Me dê liberdade"}, {"k": "O", "t": "Me deixe saber sua expectativa"}, {"k": "A", "t": "Lidere, siga ou saia do caminho"}, {"k": "C", "t": "Seja amigável, carinhoso e compreensivo"}]'::jsonb),
  (4, 'Para conseguir obter bons resultados é preciso...', '[{"k": "I", "t": "Ter incertezas"}, {"k": "O", "t": "Controlar o essencial"}, {"k": "C", "t": "Diversão e celebração"}, {"k": "A", "t": "Planejar e obter recursos"}]'::jsonb),
  (5, 'Eu me divirto quando...', '[{"k": "A", "t": "Estou me exercitando"}, {"k": "I", "t": "Tenho novidades"}, {"k": "C", "t": "Estou com outros"}, {"k": "O", "t": "Determino as regras"}]'::jsonb),
  (6, 'Eu penso que...', '[{"k": "C", "t": "Unidos venceremos, divididos perderemos"}, {"k": "A", "t": "O ataque é melhor que a defesa"}, {"k": "I", "t": "É bom ser manso, mas andar com um porrete"}, {"k": "O", "t": "Um homem prevenido vale por dois"}]'::jsonb),
  (7, 'Minha preocupação é...', '[{"k": "I", "t": "Gerar a ideia global"}, {"k": "C", "t": "Fazer com que as pessoas gostem"}, {"k": "O", "t": "Fazer com que funcione"}, {"k": "A", "t": "Fazer com que aconteça"}]'::jsonb),
  (8, 'Eu prefiro...', '[{"k": "I", "t": "Perguntas a respostas"}, {"k": "O", "t": "Ter todos os detalhes"}, {"k": "A", "t": "Vantagens a meu favor"}, {"k": "C", "t": "Que todos tenham a chance de ser ouvidos"}]'::jsonb),
  (9, 'Eu gosto de...', '[{"k": "A", "t": "Fazer progresso"}, {"k": "C", "t": "Construir memórias"}, {"k": "O", "t": "Fazer sentido"}, {"k": "I", "t": "Tornar as pessoas confortáveis"}]'::jsonb),
  (10, 'Eu gosto de chegar...', '[{"k": "A", "t": "Na frente"}, {"k": "C", "t": "Junto"}, {"k": "O", "t": "Na hora"}, {"k": "I", "t": "Em outro lugar"}]'::jsonb),
  (11, 'Um ótimo dia para mim é quando...', '[{"k": "A", "t": "Consigo fazer muitas coisas"}, {"k": "C", "t": "Me divirto com meus amigos"}, {"k": "O", "t": "Tudo segue conforme planejado"}, {"k": "I", "t": "Desfruto de coisas novas e estimulantes"}]'::jsonb),
  (12, 'Eu vejo a morte como...', '[{"k": "I", "t": "Uma grande aventura misteriosa"}, {"k": "C", "t": "Oportunidade para rever os falecidos"}, {"k": "O", "t": "Um modo de receber recompensas"}, {"k": "A", "t": "Algo que sempre chega muito cedo"}]'::jsonb),
  (13, 'Minha filosofia de vida é...', '[{"k": "A", "t": "Há ganhadores e perdedores, e eu acredito ser um ganhador"}, {"k": "C", "t": "Para eu ganhar, ninguém precisa perder"}, {"k": "O", "t": "Para ganhar é preciso seguir as regras"}, {"k": "I", "t": "Para ganhar, é necessário inventar novas regras"}]'::jsonb),
  (14, 'Eu sempre gostei de...', '[{"k": "I", "t": "Explorar"}, {"k": "O", "t": "Evitar surpresas"}, {"k": "A", "t": "Focalizar a meta"}, {"k": "C", "t": "Realizar uma abordagem natural"}]'::jsonb),
  (15, 'Eu gosto de mudanças se...', '[{"k": "A", "t": "Me der uma vantagem competitiva"}, {"k": "C", "t": "For divertido e puder ser compartilhado"}, {"k": "I", "t": "Me der mais liberdade e variedade"}, {"k": "O", "t": "Melhorar ou me der mais controle"}]'::jsonb),
  (16, 'Não existe nada de errado em...', '[{"k": "A", "t": "Se colocar na frente"}, {"k": "C", "t": "Colocar os outros na frente"}, {"k": "I", "t": "Mudar de ideia"}, {"k": "O", "t": "Ser consistente"}]'::jsonb),
  (17, 'Eu gosto de buscar conselhos de...', '[{"k": "A", "t": "Pessoas bem sucedidas"}, {"k": "C", "t": "Anciões e conselheiros"}, {"k": "O", "t": "Autoridades no assunto"}, {"k": "I", "t": "Lugares, os mais estranhos"}]'::jsonb),
  (18, 'Meu lema é...', '[{"k": "I", "t": "Fazer o que precisa ser feito"}, {"k": "O", "t": "Fazer bem feito"}, {"k": "C", "t": "Fazer junto com o grupo"}, {"k": "A", "t": "Simplesmente fazer"}]'::jsonb),
  (19, 'Eu gosto de...', '[{"k": "I", "t": "Complexidade, mesmo se confuso"}, {"k": "O", "t": "Ordem e sistematização"}, {"k": "C", "t": "Calor humano e animação"}, {"k": "A", "t": "Coisas claras e simples"}]'::jsonb),
  (20, 'Tempo para mim é...', '[{"k": "A", "t": "Algo que detesto desperdiçar"}, {"k": "C", "t": "Um grande ciclo"}, {"k": "O", "t": "Uma flecha que leva ao inevitável"}, {"k": "I", "t": "Irrelevante"}]'::jsonb),
  (21, 'Se eu fosse bilionário...', '[{"k": "C", "t": "Faria doações para muitas entidades"}, {"k": "O", "t": "Criaria uma poupança avantajada"}, {"k": "I", "t": "Faria o que desse na cabeça"}, {"k": "A", "t": "Exibiria bastante com algumas pessoas"}]'::jsonb),
  (22, 'Eu acredito que...', '[{"k": "A", "t": "O destino é mais importante que a jornada"}, {"k": "C", "t": "A jornada é mais importante que o destino"}, {"k": "O", "t": "Um centavo economizado é um centavo ganho"}, {"k": "I", "t": "Bastam um navio e uma estrela para navegar"}]'::jsonb),
  (23, 'Eu acredito também que...', '[{"k": "A", "t": "Aquele que hesita está perdido"}, {"k": "O", "t": "De grão em grão a galinha enche o papo"}, {"k": "C", "t": "O que vai, volta"}, {"k": "I", "t": "Um sorriso ou uma careta é o mesmo para quem é cego"}]'::jsonb),
  (24, 'Eu acredito ainda que...', '[{"k": "O", "t": "É melhor prudência do que arrependimento"}, {"k": "I", "t": "A autoridade deve ser desafiada"}, {"k": "A", "t": "Ganhar é fundamental"}, {"k": "C", "t": "O coletivo é mais importante do que o individual"}]'::jsonb),
  (25, 'Eu penso que...', '[{"k": "I", "t": "Não é fácil ficar encurralado"}, {"k": "O", "t": "É preferível olhar, antes de pular"}, {"k": "C", "t": "Duas cabeças pensam melhor do que uma"}, {"k": "A", "t": "Se você não tem condições de competir, não compita"}]'::jsonb);

-- Conferência: deve mostrar 36 e 25.
select (select count(*) from aval_eneagrama_itens) as eneagrama, (select count(*) from aval_perfil_itens) as perfil;
