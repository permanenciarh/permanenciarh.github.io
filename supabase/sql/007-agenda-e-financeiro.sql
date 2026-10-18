-- =============================================================================
-- Permanência RH — atualização 007: agenda (entrevistas e reuniões) e financeiro
-- Rodar UMA vez no SQL Editor, depois do 006.
--
-- O que cria:
--  - compromissos: entrevistas, reuniões, devolutivas, aplicação de testes.
--  - agenda_feed + agenda_ics(): link secreto de assinatura da agenda para o celular
--    (iPhone, Google Agenda, Outlook), com os lembretes de cada compromisso.
--  - lancamentos: entradas e saídas (fluxo de caixa), com vencimento, pagamento e parcelas.
-- =============================================================================

-- ---------------------------------------------------------------- agenda
create table compromissos (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null default 'entrevista' check (tipo in ('entrevista', 'reuniao', 'devolutiva', 'aplicacao_teste', 'outro')),
  titulo         text not null check (char_length(titulo) between 2 and 160),
  inicio         timestamptz not null,
  fim            timestamptz not null,
  modalidade     text not null default 'presencial' check (modalidade in ('presencial', 'online', 'telefone')),
  local          text check (char_length(local) <= 300),          -- endereço, link da chamada ou telefone
  candidato_id   uuid references candidatos(id) on delete cascade,
  empresa_id     uuid references empresas(id) on delete set null,
  vaga_id        uuid references vagas(id) on delete set null,
  lembretes      smallint[] not null default '{1440,60}' check (lembretes <@ array[5, 10, 15, 30, 60, 120, 1440, 2880]::smallint[]),
  status         text not null default 'agendado' check (status in ('agendado', 'realizado', 'cancelado', 'faltou')),
  observacoes    text check (char_length(observacoes) <= 2000),
  criado_por     uuid default auth.uid() references equipe(user_id),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  check (fim > inicio and fim <= inicio + interval '24 hours')
);
create index compromissos_inicio on compromissos (inicio);
create index compromissos_cand on compromissos (candidato_id) where candidato_id is not null;
create trigger trg_compromissos_atualizado before update on compromissos for each row execute function tocar_atualizado_em();

alter table compromissos enable row level security;
revoke all on compromissos from anon;
create policy comp_ler    on compromissos for select to authenticated using (papel_atual() in ('admin', 'recrutador'));
create policy comp_criar  on compromissos for insert to authenticated with check (papel_atual() in ('admin', 'recrutador'));
create policy comp_editar on compromissos for update to authenticated using (papel_atual() in ('admin', 'recrutador')) with check (papel_atual() in ('admin', 'recrutador'));
create policy comp_apagar on compromissos for delete to authenticated using (papel_atual() in ('admin', 'recrutador'));

-- ---------------------------------------------------------------- assinatura da agenda (link secreto por pessoa da equipe)
create table agenda_feed (
  user_id    uuid primary key references equipe(user_id) on delete cascade,
  token      text unique not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  criado_em  timestamptz not null default now()
);
alter table agenda_feed enable row level security;
revoke all on agenda_feed from anon, authenticated;

-- Devolve (e cria, se ainda não existir) o token de assinatura de quem está logado
create or replace function agenda_feed_token(p_renovar boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if papel_atual() not in ('admin', 'recrutador') then raise exception 'sem_permissao'; end if;
  if p_renovar then delete from agenda_feed where user_id = auth.uid(); end if;
  insert into agenda_feed (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select token into v from agenda_feed where user_id = auth.uid();
  insert into auditoria (ator_id, acao, entidade, entidade_id) values (auth.uid(), case when p_renovar then 'agenda_link_renovado' else 'agenda_link_visto' end, 'equipe', auth.uid()::text);
  return v;
end $$;
revoke all on function agenda_feed_token(boolean) from public, anon;
grant execute on function agenda_feed_token(boolean) to authenticated;

-- Calendário no formato iCalendar, lido pelo app de agenda do celular.
-- Endereço: https://<projeto>.supabase.co/rest/v1/rpc/agenda_ics?t=<token>&apikey=<chave anon>
create domain "text/calendar" as text;

create or replace function agenda_ics(t text) returns "text/calendar"
language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid;
  r record;
  m smallint;
  out text;
  fmt constant text := 'YYYYMMDD"T"HH24MISS"Z"';
begin
  if t is null or t !~ '^[0-9a-f]{64}$' then raise exception 'link_invalido'; end if;
  select f.user_id into v_user from agenda_feed f join equipe e on e.user_id = f.user_id
   where f.token = t and e.ativo and e.papel in ('admin', 'recrutador');
  if v_user is null then raise exception 'link_invalido'; end if;

  out := 'BEGIN:VCALENDAR' || chr(13) || chr(10) ||
         'VERSION:2.0' || chr(13) || chr(10) ||
         'PRODID:-//Permanencia RH//Painel//PT' || chr(13) || chr(10) ||
         'CALSCALE:GREGORIAN' || chr(13) || chr(10) ||
         'METHOD:PUBLISH' || chr(13) || chr(10) ||
         'X-WR-CALNAME:Permanência RH' || chr(13) || chr(10) ||
         'X-WR-TIMEZONE:America/Sao_Paulo' || chr(13) || chr(10) ||
         'REFRESH-INTERVAL;VALUE=DURATION:PT1H' || chr(13) || chr(10) ||
         'X-PUBLISHED-TTL:PT1H' || chr(13) || chr(10);

  for r in
    select c.*, k.nome as cand_nome, k.telefone as cand_tel, e.nome as emp_nome, v.titulo as vaga_titulo
      from compromissos c
      left join candidatos k on k.id = c.candidato_id and k.excluido_em is null
      left join empresas e on e.id = c.empresa_id
      left join vagas v on v.id = c.vaga_id
     where c.inicio >= now() - interval '60 days' and c.inicio <= now() + interval '365 days'
     order by c.inicio
  loop
    out := out || 'BEGIN:VEVENT' || chr(13) || chr(10) ||
      'UID:' || r.id || '@permanenciarh.com.br' || chr(13) || chr(10) ||
      'DTSTAMP:' || to_char(r.atualizado_em at time zone 'UTC', fmt) || chr(13) || chr(10) ||
      'DTSTART:' || to_char(r.inicio at time zone 'UTC', fmt) || chr(13) || chr(10) ||
      'DTEND:' || to_char(r.fim at time zone 'UTC', fmt) || chr(13) || chr(10) ||
      ics_linha('SUMMARY', case when r.status = 'cancelado' then 'CANCELADO: ' else '' end || r.titulo) ||
      case when r.local is not null then ics_linha('LOCATION', r.local) else '' end ||
      ics_linha('DESCRIPTION', concat_ws(E'\n',
          case r.tipo when 'entrevista' then 'Entrevista' when 'reuniao' then 'Reunião' when 'devolutiva' then 'Devolutiva'
                      when 'aplicacao_teste' then 'Aplicação de testes' else 'Compromisso' end ||
          ' · ' || case r.modalidade when 'online' then 'online' when 'telefone' then 'por telefone' else 'presencial' end,
          case when r.cand_nome is not null then 'Candidato: ' || r.cand_nome || coalesce(' · ' || r.cand_tel, '') end,
          case when r.vaga_titulo is not null then 'Vaga: ' || r.vaga_titulo end,
          case when r.emp_nome is not null then 'Empresa: ' || r.emp_nome end,
          r.observacoes)) ||
      'STATUS:' || case when r.status = 'cancelado' then 'CANCELLED' else 'CONFIRMED' end || chr(13) || chr(10);
    if r.status = 'agendado' then
      foreach m in array r.lembretes loop
        out := out || 'BEGIN:VALARM' || chr(13) || chr(10) || 'ACTION:DISPLAY' || chr(13) || chr(10) ||
          ics_linha('DESCRIPTION', r.titulo) ||
          'TRIGGER:-PT' || m || 'M' || chr(13) || chr(10) || 'END:VALARM' || chr(13) || chr(10);
      end loop;
    end if;
    out := out || 'END:VEVENT' || chr(13) || chr(10);
  end loop;
  return out || 'END:VCALENDAR' || chr(13) || chr(10);
end $$;

-- Escapa texto para o formato iCalendar (vírgula, ponto e vírgula, barra e quebra de linha)
create or replace function ics_texto(s text) returns text
language sql immutable set search_path = public as $$
  select replace(replace(replace(replace(replace(coalesce(s, ''), '\', '\\'), ';', '\;'), ',', '\,'), chr(13), ''), chr(10), '\n')
$$;

-- Uma propriedade por linha, quebrada a cada 70 caracteres como pede o padrão
create or replace function ics_linha(k text, v text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(k || ':' || ics_texto(v), '(.{70})(?=.)', E'\\1\r\n ', 'g') || chr(13) || chr(10)
$$;

revoke all on function agenda_ics(text) from public;
grant execute on function agenda_ics(text) to anon, authenticated;
revoke all on function ics_texto(text), ics_linha(text, text) from public, anon;
grant execute on function ics_texto(text), ics_linha(text, text) to authenticated;

-- ---------------------------------------------------------------- financeiro (fluxo de caixa)
create table lancamentos (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in ('entrada', 'saida')),
  descricao      text not null check (char_length(descricao) between 2 and 200),
  categoria      text not null check (char_length(categoria) between 2 and 60),
  valor          numeric(12, 2) not null check (valor > 0),
  vencimento     date not null,
  pago_em        date,
  forma          text check (forma in ('pix', 'dinheiro', 'transferencia', 'boleto', 'cartao', 'outro')),
  empresa_id     uuid references empresas(id) on delete set null,
  candidato_id   uuid references candidatos(id) on delete set null,
  grupo          uuid,                                              -- parcelas e repetições do mesmo lançamento
  parcela        text check (parcela ~ '^[0-9]{1,3}/[0-9]{1,3}$'),
  observacoes    text check (char_length(observacoes) <= 1000),
  criado_por     uuid default auth.uid() references equipe(user_id),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index lancamentos_venc on lancamentos (vencimento);
create index lancamentos_pago on lancamentos (pago_em) where pago_em is not null;
create trigger trg_lancamentos_atualizado before update on lancamentos for each row execute function tocar_atualizado_em();

alter table lancamentos enable row level security;
revoke all on lancamentos from anon;
create policy fin_admin on lancamentos for all to authenticated using (papel_atual() = 'admin') with check (papel_atual() = 'admin');

create or replace function auditar_lancamentos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into auditoria (ator_id, acao, entidade, entidade_id, detalhes)
  values (auth.uid(), lower(tg_op), 'lancamentos', coalesce(new.id, old.id)::text,
          jsonb_build_object('tipo', coalesce(new.tipo, old.tipo), 'valor', coalesce(new.valor, old.valor)));
  return coalesce(new, old);
end $$;
create trigger trg_auditar_lancamentos after insert or update or delete on lancamentos for each row execute function auditar_lancamentos();
revoke all on function auditar_lancamentos() from public, anon, authenticated;

-- ---------------------------------------------------------------- exclusão do candidato
-- Apaga avaliações, laudos e compromissos; nos lançamentos só desfaz o vínculo (o registro financeiro fica).
create or replace function limpar_avaliacoes_excluido() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from avaliacoes   where candidato_id = new.id;
  delete from laudos       where candidato_id = new.id;
  delete from compromissos where candidato_id = new.id;
  update lancamentos set candidato_id = null where candidato_id = new.id;
  return new;
end $$;

-- Conferência: deve mostrar as três tabelas novas.
select to_regclass('public.compromissos') as agenda, to_regclass('public.agenda_feed') as assinatura, to_regclass('public.lancamentos') as financeiro;
