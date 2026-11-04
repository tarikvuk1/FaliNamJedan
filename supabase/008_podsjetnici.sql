-- =====================================================================
--  008: Podsjetnici
--  Pokreni u Supabase: SQL Editor -> New query -> Run
--
--  - 2 sata prije termina: podsjetnik organizatoru i odobrenim igračima
--  - nakon termina: podsjetnik organizatoru da označi ko je došao
--  Automatika se već pokreće svakih 10 minuta (pg_cron iz prve skripte).
-- =====================================================================

alter table public.games
  add column if not exists reminder_sent       boolean not null default false,
  add column if not exists attendance_reminded boolean not null default false;

-- Ako organizator promijeni vrijeme termina, podsjetnik se šalje ponovo
create or replace function public.reset_game_reminder()
returns trigger language plpgsql as $$
begin
  if new.starts_at is distinct from old.starts_at then
    new.reminder_sent := false;
    new.attendance_reminded := false;
  end if;
  return new;
end;
$$;

drop trigger if exists games_reset_reminder on public.games;
create trigger games_reset_reminder
  before update of starts_at on public.games
  for each row execute function public.reset_game_reminder();

-- Automatika svakih 10 minuta (zamjenjuje staru verziju)
create or replace function public.expire_stale()
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- 1) Podsjetnik 2 sata prije termina
  with due as (
    update public.games
    set reminder_sent = true
    where reminder_sent = false
      and status in ('open', 'full')
      and starts_at > now()
      and starts_at <= now() + interval '2 hours'
    returning id, organizer_id
  )
  insert into public.notifications (user_id, type, payload)
  select organizer_id, 'game_reminder', jsonb_build_object('game_id', id) from due
  union all
  select r.player_id, 'game_reminder', jsonb_build_object('game_id', d.id)
  from due d
  join public.join_requests r on r.game_id = d.id and r.status = 'approved';

  -- 2) Prijave na čekanju ističu kad termin počne
  with exp as (
    update public.join_requests r
    set status = 'expired', updated_at = now()
    from public.games g
    where g.id = r.game_id
      and r.status = 'pending'
      and g.starts_at <= now()
    returning r.player_id, r.game_id
  )
  insert into public.notifications (user_id, type, payload)
  select player_id, 'request_expired', jsonb_build_object('game_id', game_id) from exp;

  -- 3) Nakon termina: organizator označava dolaske (samo ako je imao odobrene igrače)
  with done as (
    update public.games g
    set attendance_reminded = true
    where g.attendance_reminded = false
      and g.status in ('open', 'full', 'finished')
      and g.starts_at + make_interval(mins => g.duration_minutes) < now()
      and g.starts_at > now() - interval '2 days'
      and exists (
        select 1 from public.join_requests r
        where r.game_id = g.id and r.status = 'approved'
      )
    returning g.id, g.organizer_id
  )
  insert into public.notifications (user_id, type, payload)
  select organizer_id, 'mark_attendance', jsonb_build_object('game_id', id) from done;

  -- 4) Završeni termini dobijaju status 'finished'
  update public.games
  set status = 'finished'
  where status in ('open', 'full')
    and starts_at + make_interval(mins => duration_minutes) < now();
end;
$$;

revoke execute on function public.expire_stale() from public, anon, authenticated;

-- Push tekstovi: dodani podsjetnici
create or replace function public.send_push_for_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_title text;
  v_body  text;
  t record;
begin
  select m.title, m.body into v_title, v_body
  from (values
    ('new_request',      'Nova prijava 🙋',        'Neko se prijavio na tvoj termin. Odobri ili odbij.'),
    ('request_approved', 'Odobren si ✅',           'Organizator te prihvatio. Kontakt je u detaljima termina.'),
    ('request_rejected', 'Prijava odbijena',        'Organizator je odbio tvoju prijavu.'),
    ('game_full',        'Termin popunjen 🔒',      'Termin na koji si se prijavio je popunjen.'),
    ('request_expired',  'Prijava istekla ⌛',      'Termin je počeo prije nego je prijava odobrena.'),
    ('player_left',      'Igrač otkazao 🚶',        'Mjesto u tvom terminu je ponovo slobodno.'),
    ('game_cancelled',   'Termin otkazan 🚫',       'Organizator je otkazao termin.'),
    ('game_updated',     'Termin izmijenjen ✏️',    'Organizator je promijenio detalje termina. Provjeri vrijeme i mjesto.'),
    ('new_game',         'Novi termin 📣',          'Pojavio se termin za sport koji pratiš.'),
    ('game_reminder',    'Termin uskoro ⏰',        'Tvoj termin počinje za manje od 2 sata. Vidimo se na terenu!'),
    ('mark_attendance',  'Ko je došao? 📝',         'Označi ko je došao na termin. To pomaže pouzdanosti igrača.')
  ) as m(type, title, body)
  where m.type = new.type;

  if v_title is null then return new; end if;

  for t in select token from public.push_tokens where user_id = new.user_id loop
    perform net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      body    := jsonb_build_object(
                   'to', t.token, 'title', v_title, 'body', v_body,
                   'sound', 'default', 'data', new.payload),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  end loop;
  return new;
end;
$$;
