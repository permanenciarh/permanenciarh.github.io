-- =============================================================================
-- Permanência RH — atualização 008: assinatura da agenda no formato que o celular lê
-- Rodar UMA vez no SQL Editor, depois do 007.
--
-- O app de agenda do celular pede o link sem dizer o formato. Com o 007 a resposta saía
-- como texto JSON; aqui a função passa a responder sempre como calendário (text/calendar).
-- =============================================================================

-- Tipo "qualquer formato" do PostgREST: a própria função define o Content-Type da resposta
create domain "*/*" as bytea;

drop function if exists agenda_ics(text);

create or replace function agenda_ics(t text) returns "*/*"
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
  out := out || 'END:VCALENDAR' || chr(13) || chr(10);
  perform set_config('response.headers', '[{"Content-Type": "text/calendar; charset=utf-8"}, {"Content-Disposition": "inline; filename=\"permanencia-rh.ics\""}, {"Cache-Control": "no-store"}]', true);
  return convert_to(out, 'UTF8');
end $$;

revoke all on function agenda_ics(text) from public;
grant execute on function agenda_ics(text) to anon, authenticated;
drop domain if exists "text/calendar";

-- Conferência: deve mostrar 1.
select count(*) as funcao_agenda from pg_proc where proname = 'agenda_ics';
