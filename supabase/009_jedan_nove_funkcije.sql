-- =====================================================================
--  009: JEDAN – nove funkcije
--  Pokreni u Supabase: SQL Editor -> New query -> zalijepi cijeli fajl -> Run
--
--  - Hitno: termin koji počinje za manje od 2 sata, a fali igrač, šalje
--    obavijest "🔥 Hitno" pratiocima sporta u gradu i slobodnim igračima
--  - "Slobodan sam": igrač označi kad je slobodan; organizator ga može pozvati
--  - Pozivi: organizator poziva slobodne igrače i one s kojima je već igrao
--  - Chat za termin: organizator i odobreni igrači
--  - Ponavljanje: termin "svake sedmice" se sam objavi za sljedeću sedmicu
--  - Pozicija: "Tražimo golmana", a igrač u profilu ima nivo i poziciju po sportu
--  - Lista čekanja: kad se oslobodi mjesto u popunjenom terminu, stiže obavijest
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. NOVE KOLONE
-- ---------------------------------------------------------------------
alter table public.games
  add column if not exists urgent_notified boolean not null default false,
  add column if not exists repeat_weekly   boolean not null default false,
  add column if not exists repeat_parent   uuid references public.games(id) on delete set null,
  add column if not exists wanted_position text check (char_length(wanted_position) <= 40);

create index if not exists games_repeat_parent_idx on public.games (repeat_parent);

alter table public.user_sports
  add column if not exists position text check (char_length(position) <= 40);

-- ---------------------------------------------------------------------
-- 2. NOVE TABELE
-- ---------------------------------------------------------------------

-- "Slobodan sam"
create table if not exists public.availability (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  sport_id       smallint not null references public.sports(id),
  city           text not null,
  available_from timestamptz not null,
  available_to   timestamptz not null,
  created_at     timestamptz not null default now(),
  check (available_to > available_from)
);
create index if not exists availability_match_idx on public.availability (sport_id, available_to);

-- Pozivi na termin (da se isti igrač ne poziva dvaput)
create table if not exists public.game_invites (
  game_id    uuid not null references public.games(id) on delete cascade,
  player_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

-- Lista čekanja za popunjene termine
create table if not exists public.game_waitlist (
  game_id    uuid not null references public.games(id) on delete cascade,
  player_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

-- Chat termina
create table if not exists public.game_messages (
  id         bigint generated always as identity primary key,
  game_id    uuid not null references public.games(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists game_messages_game_idx on public.game_messages (game_id, created_at);

alter table public.availability  enable row level security;
alter table public.game_invites  enable row level security;
alter table public.game_waitlist enable row level security;
alter table public.game_messages enable row level security;

-- ---------------------------------------------------------------------
-- 3. POMOĆNE FUNKCIJE
-- ---------------------------------------------------------------------

-- Može li korisnik u chat termina: organizator ili odobreni igrač
create or replace function public.can_chat(p_game_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.games g
    where g.id = p_game_id
      and (
        g.organizer_id = auth.uid()
        or exists (select 1 from public.join_requests r
                   where r.game_id = g.id and r.player_id = auth.uid() and r.status = 'approved')
      )
  );
$$;

-- Ko treba dobiti obavijest o terminu: pratioci sporta u gradu + slobodni igrači u to vrijeme
create or replace function public.game_audience(p_game_id uuid)
returns table (user_id uuid, available boolean)
language sql stable security definer set search_path = '' as $$
  select u.user_id, bool_or(u.available)
  from (
    select f.user_id, false as available
    from public.follows f
    join public.games g on g.id = p_game_id
    where f.sport_id = g.sport_id and lower(f.city) = lower(g.city)
    union all
    select a.user_id, true
    from public.availability a
    join public.games g on g.id = p_game_id
    where a.sport_id = g.sport_id and lower(a.city) = lower(g.city)
      and a.available_from <= g.starts_at and a.available_to >= g.starts_at
  ) u
  join public.games g on g.id = p_game_id
  where u.user_id <> g.organizer_id
    and not public.is_blocked(u.user_id, g.organizer_id)
    and not exists (select 1 from public.join_requests r
                    where r.game_id = p_game_id and r.player_id = u.user_id
                      and r.status in ('pending', 'approved'))
  group by u.user_id;
$$;

revoke execute on function public.game_audience(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------
drop policy if exists "availability_own" on public.availability;
create policy "availability_own" on public.availability
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "invites_read" on public.game_invites;
create policy "invites_read" on public.game_invites
  for select to authenticated using (
    player_id = auth.uid()
    or exists (select 1 from public.games g where g.id = game_id and g.organizer_id = auth.uid())
  );

drop policy if exists "waitlist_read" on public.game_waitlist;
create policy "waitlist_read" on public.game_waitlist
  for select to authenticated using (
    player_id = auth.uid()
    or exists (select 1 from public.games g where g.id = game_id and g.organizer_id = auth.uid())
  );
drop policy if exists "waitlist_insert_own" on public.game_waitlist;
create policy "waitlist_insert_own" on public.game_waitlist
  for insert to authenticated with check (
    player_id = auth.uid()
    and exists (select 1 from public.games g
                where g.id = game_id and g.status = 'full' and g.starts_at > now()
                  and g.organizer_id <> auth.uid()
                  and not public.is_blocked(g.organizer_id, auth.uid()))
  );
drop policy if exists "waitlist_delete_own" on public.game_waitlist;
create policy "waitlist_delete_own" on public.game_waitlist
  for delete to authenticated using (player_id = auth.uid());

drop policy if exists "messages_read" on public.game_messages;
create policy "messages_read" on public.game_messages
  for select to authenticated using (public.can_chat(game_id));
drop policy if exists "messages_insert" on public.game_messages;
create policy "messages_insert" on public.game_messages
  for insert to authenticated with check (user_id = auth.uid() and public.can_chat(game_id));

-- Chat stiže uživo (Realtime)
do $$
begin
  alter publication supabase_realtime add table public.game_messages;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- 5. OGRANIČENJA (zaštita od spama)
-- ---------------------------------------------------------------------
create or replace function public.check_availability_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.available_to <= now() then
    raise exception 'Vrijeme do kad si slobodan mora biti u budućnosti.';
  end if;
  if new.available_from > now() + interval '7 days' then
    raise exception 'Možeš se označiti kao slobodan najviše 7 dana unaprijed.';
  end if;
  if new.available_to - new.available_from > interval '16 hours' then
    raise exception 'Period u kojem si slobodan može trajati najviše 16 sati.';
  end if;
  if (select count(*) from public.availability
      where user_id = new.user_id and available_to > now()) >= 6 then
    raise exception 'Možeš imati najviše 6 aktivnih oznaka "slobodan sam".';
  end if;
  return new;
end;
$$;

drop trigger if exists availability_limits on public.availability;
create trigger availability_limits
  before insert on public.availability
  for each row execute function public.check_availability_limits();

create or replace function public.check_message_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.game_messages
      where user_id = new.user_id and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Šalješ poruke prebrzo. Sačekaj malo.';
  end if;
  return new;
end;
$$;

drop trigger if exists game_messages_limits on public.game_messages;
create trigger game_messages_limits
  before insert on public.game_messages
  for each row execute function public.check_message_limits();

-- ---------------------------------------------------------------------
-- 6. NOVI TERMIN: hitno ili obično
-- ---------------------------------------------------------------------

-- Prije upisa: ako termin počinje za manje od 2 sata, odmah je "hitan"
create or replace function public.mark_urgent_on_insert()
returns trigger language plpgsql as $$
begin
  new.urgent_notified := new.starts_at <= now() + interval '2 hours';
  return new;
end;
$$;

drop trigger if exists games_mark_urgent on public.games;
create trigger games_mark_urgent
  before insert on public.games
  for each row execute function public.mark_urgent_on_insert();

-- Poslije upisa: obavijesti pratioce i slobodne igrače
create or replace function public.notify_followers()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, payload)
  select a.user_id,
         case when new.urgent_notified then 'urgent_game'
              when a.available then 'game_for_you'
              else 'new_game' end,
         jsonb_build_object('game_id', new.id)
  from public.game_audience(new.id) a;
  return new;
end;
$$;

-- Kad se popunjen termin ponovo otvori: hitna obavijest se može poslati opet,
-- a igrači s liste čekanja dobijaju obavijest da je mjesto slobodno
create or replace function public.games_before_status_change()
returns trigger language plpgsql as $$
begin
  if old.status = 'full' and new.status = 'open' then
    new.urgent_notified := false;
  end if;
  return new;
end;
$$;

drop trigger if exists games_reopen_reset on public.games;
create trigger games_reopen_reset
  before update of status on public.games
  for each row execute function public.games_before_status_change();

create or replace function public.notify_waitlist_on_reopen()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'full' and new.status = 'open' and new.starts_at > now() then
    with w as (
      delete from public.game_waitlist where game_id = new.id returning player_id
    )
    insert into public.notifications (user_id, type, payload)
    select player_id, 'spot_open', jsonb_build_object('game_id', new.id) from w;
  end if;
  return new;
end;
$$;

drop trigger if exists games_notify_waitlist on public.games;
create trigger games_notify_waitlist
  after update of status on public.games
  for each row execute function public.notify_waitlist_on_reopen();

-- ---------------------------------------------------------------------
-- 7. AKCIJE (supabase.rpc)
-- ---------------------------------------------------------------------

-- Organizator: pozicija koja se traži i ponavljanje svake sedmice
create or replace function public.update_game_extras(p_game_id uuid, p_wanted_position text, p_repeat boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.games
  set wanted_position = nullif(trim(p_wanted_position), ''),
      repeat_weekly   = coalesce(p_repeat, false)
  where id = p_game_id and organizer_id = auth.uid();
  if not found then
    raise exception 'Nemate pravo na ovu akciju';
  end if;
end;
$$;

-- Organizator: igrači koje može pozvati (slobodni u to vrijeme + oni s kojima je igrao)
create or replace function public.invitable_players(p_game_id uuid)
returns table (
  id uuid, first_name text, last_name text, games_attended int, games_no_show int,
  level public.skill_level, "position" text, is_available boolean, played_before boolean, invited boolean
)
language sql stable security definer set search_path = '' as $$
  with g as (
    select * from public.games where id = p_game_id and organizer_id = auth.uid()
  ),
  cand as (
    select a.user_id, true as avail, false as played
    from public.availability a, g
    where a.sport_id = g.sport_id and lower(a.city) = lower(g.city)
      and a.available_from <= g.starts_at and a.available_to >= g.starts_at
    union all
    select r.player_id, false, true
    from public.join_requests r
    join public.games og on og.id = r.game_id, g
    where og.organizer_id = g.organizer_id and og.id <> g.id
      and r.status = 'approved'
      and og.starts_at > now() - interval '180 days'
  )
  select p.id, p.first_name, p.last_name, p.games_attended, p.games_no_show,
         us.level, us.position,
         bool_or(c.avail), bool_or(c.played),
         exists (select 1 from public.game_invites i where i.game_id = p_game_id and i.player_id = p.id)
  from cand c
  join public.profiles p on p.id = c.user_id
  cross join g
  left join public.user_sports us on us.user_id = p.id and us.sport_id = g.sport_id
  where p.id <> g.organizer_id
    and not public.is_blocked(p.id, g.organizer_id)
    and not exists (select 1 from public.join_requests r
                    where r.game_id = p_game_id and r.player_id = p.id
                      and r.status in ('pending', 'approved'))
  group by p.id, p.first_name, p.last_name, p.games_attended, p.games_no_show, us.level, us.position
  order by bool_or(c.avail) desc, p.games_attended desc
  limit 50;
$$;

-- Organizator: pozovi igrača
create or replace function public.invite_player(p_game_id uuid, p_player_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_game public.games;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found or v_game.organizer_id is distinct from auth.uid() then
    raise exception 'Nemate pravo na ovu akciju';
  end if;
  if v_game.status <> 'open' or v_game.starts_at <= now() then
    raise exception 'Termin više nije otvoren';
  end if;
  if not exists (select 1 from public.invitable_players(p_game_id) ip where ip.id = p_player_id) then
    raise exception 'Ovog igrača ne možeš pozvati na ovaj termin';
  end if;
  if (select count(*) from public.game_invites where game_id = p_game_id) >= 30 then
    raise exception 'Poslao si najviše poziva za ovaj termin (30).';
  end if;

  insert into public.game_invites (game_id, player_id) values (p_game_id, p_player_id)
  on conflict do nothing;
  if not found then
    raise exception 'Ovaj igrač je već pozvan';
  end if;

  insert into public.notifications (user_id, type, payload)
  values (p_player_id, 'invite', jsonb_build_object('game_id', p_game_id));
end;
$$;

-- Pretraga oglasa: dodani "pozicija" i "ponavljanje" (zato se stara funkcija briše)
drop function if exists public.search_games(smallint, text, timestamptz, timestamptz, double precision, double precision, double precision);

create function public.search_games(
  p_sport_id  smallint         default null,
  p_city      text             default null,
  p_from      timestamptz      default now(),
  p_to        timestamptz      default null,
  p_lat       double precision default null,
  p_lng       double precision default null,
  p_radius_km double precision default null
)
returns table (
  id                uuid,
  sport_id          smallint,
  city              text,
  venue_name        text,
  address           text,
  starts_at         timestamptz,
  duration_minutes  int,
  players_needed    int,
  spots_left        int,
  price_per_person  numeric,
  level             public.skill_level,
  note              text,
  organizer_id      uuid,
  organizer_name    text,
  organizer_avatar  text,
  distance_km       double precision,
  wanted_position   text,
  repeat_weekly     boolean
)
language sql stable security definer set search_path = '' as $$
  select
    g.id, g.sport_id, g.city, g.venue_name, g.address, g.starts_at,
    g.duration_minutes, g.players_needed,
    (g.players_needed - (
      select count(*) from public.join_requests r
      where r.game_id = g.id and r.status = 'approved'
    ))::int,
    g.price_per_person, g.level, g.note,
    g.organizer_id,
    concat_ws(' ', p.first_name, p.last_name),
    p.avatar_url,
    case when p_lat is not null and g.location is not null then
      extensions.st_distance(
        g.location,
        extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
      ) / 1000
    end,
    g.wanted_position,
    g.repeat_weekly
  from public.games g
  join public.profiles p on p.id = g.organizer_id
  where g.status = 'open'
    and g.starts_at >= p_from
    and (p_to       is null or g.starts_at <= p_to)
    and (p_sport_id is null or g.sport_id = p_sport_id)
    and (p_city     is null or lower(g.city) = lower(p_city))
    and (p_radius_km is null or p_lat is null or extensions.st_dwithin(
          g.location,
          extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
          p_radius_km * 1000))
    and not public.is_blocked(g.organizer_id, auth.uid())
  order by g.starts_at
  limit 100;
$$;

-- ---------------------------------------------------------------------
-- 8. AUTOMATIKA svakih 10 minuta (zamjenjuje verziju iz 008)
-- ---------------------------------------------------------------------
create or replace function public.expire_stale()
returns void language plpgsql security definer set search_path = '' as $$
declare
  r       record;
  v_start timestamptz;
  v_new   uuid;
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
  select jr.player_id, 'game_reminder', jsonb_build_object('game_id', d.id)
  from due d
  join public.join_requests jr on jr.game_id = d.id and jr.status = 'approved';

  -- 2) HITNO: termin počinje za manje od 2 sata, a još fali igrač
  for r in
    update public.games
    set urgent_notified = true
    where urgent_notified = false
      and status = 'open'
      and starts_at > now() + interval '15 minutes'
      and starts_at <= now() + interval '2 hours'
    returning id
  loop
    insert into public.notifications (user_id, type, payload)
    select a.user_id, 'urgent_game', jsonb_build_object('game_id', r.id)
    from public.game_audience(r.id) a;
  end loop;

  -- 3) Prijave na čekanju ističu kad termin počne
  with exp as (
    update public.join_requests jr
    set status = 'expired', updated_at = now()
    from public.games g
    where g.id = jr.game_id
      and jr.status = 'pending'
      and g.starts_at <= now()
    returning jr.player_id, jr.game_id
  )
  insert into public.notifications (user_id, type, payload)
  select player_id, 'request_expired', jsonb_build_object('game_id', game_id) from exp;

  -- 4) Nakon termina: organizator označava dolaske
  with done as (
    update public.games g
    set attendance_reminded = true
    where g.attendance_reminded = false
      and g.status in ('open', 'full', 'finished')
      and g.starts_at + make_interval(mins => g.duration_minutes) < now()
      and g.starts_at > now() - interval '2 days'
      and exists (
        select 1 from public.join_requests jr
        where jr.game_id = g.id and jr.status = 'approved'
      )
    returning g.id, g.organizer_id
  )
  insert into public.notifications (user_id, type, payload)
  select organizer_id, 'mark_attendance', jsonb_build_object('game_id', id) from done;

  -- 5) Završeni termini dobijaju status 'finished'
  update public.games
  set status = 'finished'
  where status in ('open', 'full')
    and starts_at + make_interval(mins => duration_minutes) < now();

  -- 6) PONAVLJANJE: termin "svake sedmice" se objavi za sljedeću sedmicu
  for r in
    select g.* from public.games g
    where g.repeat_weekly
      and g.status <> 'cancelled'
      and g.starts_at <= now()
      and g.starts_at > now() - interval '21 days'
      and not exists (select 1 from public.games c where c.repeat_parent = g.id)
  loop
    v_start := r.starts_at + interval '7 days';
    while v_start <= now() + interval '1 hour' loop
      v_start := v_start + interval '7 days';
    end loop;

    begin
      insert into public.games (
        organizer_id, sport_id, city, venue_name, address, location, starts_at,
        duration_minutes, players_needed, price_per_person, level, note,
        repeat_weekly, repeat_parent, wanted_position
      ) values (
        r.organizer_id, r.sport_id, r.city, r.venue_name, r.address, r.location, v_start,
        r.duration_minutes, r.players_needed, r.price_per_person, r.level, r.note,
        true, r.id, r.wanted_position
      ) returning id into v_new;

      insert into public.notifications (user_id, type, payload)
      values (r.organizer_id, 'game_repeated', jsonb_build_object('game_id', v_new));

      -- Igrači s prošlog termina dobijaju poziv za novi
      with prev as (
        insert into public.game_invites (game_id, player_id)
        select v_new, jr.player_id
        from public.join_requests jr
        where jr.game_id = r.id and jr.status = 'approved'
          and not public.is_blocked(jr.player_id, r.organizer_id)
        on conflict do nothing
        returning player_id
      )
      insert into public.notifications (user_id, type, payload)
      select player_id, 'repeat_invite', jsonb_build_object('game_id', v_new) from prev;
    exception when others then
      -- npr. organizator već ima 5 aktivnih oglasa: ponavljanje se gasi i javlja mu se
      update public.games set repeat_weekly = false where id = r.id;
      insert into public.notifications (user_id, type, payload)
      values (r.organizer_id, 'repeat_failed', jsonb_build_object('game_id', r.id));
    end;
  end loop;

  -- 7) Stare oznake "slobodan sam" se brišu
  delete from public.availability where available_to < now() - interval '1 day';
end;
$$;

revoke execute on function public.expire_stale() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. PUSH
-- ---------------------------------------------------------------------

-- Tekstovi obavijesti (dodani novi tipovi)
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
    ('request_approved', 'Odobren si ✅',           'Organizator te prihvatio. Kontakt i chat su u detaljima termina.'),
    ('request_rejected', 'Prijava odbijena',        'Organizator je odbio tvoju prijavu.'),
    ('game_full',        'Termin popunjen 🔒',      'Termin na koji si se prijavio je popunjen.'),
    ('request_expired',  'Prijava istekla ⌛',      'Termin je počeo prije nego je prijava odobrena.'),
    ('player_left',      'Igrač otkazao 🚶',        'Mjesto u tvom terminu je ponovo slobodno.'),
    ('game_cancelled',   'Termin otkazan 🚫',       'Organizator je otkazao termin.'),
    ('game_updated',     'Termin izmijenjen ✏️',    'Organizator je promijenio detalje termina. Provjeri vrijeme i mjesto.'),
    ('new_game',         'Novi termin 📣',          'Pojavio se termin za sport koji pratiš.'),
    ('game_reminder',    'Termin uskoro ⏰',        'Tvoj termin počinje za manje od 2 sata. Vidimo se na terenu!'),
    ('mark_attendance',  'Ko je došao? 📝',         'Označi ko je došao na termin. To pomaže pouzdanosti igrača.'),
    ('urgent_game',      '🔥 Hitno: fali jedan!',   'Termin počinje uskoro, a fali im igrač. Uskoči!'),
    ('game_for_you',     'Termin baš za tebe 🎯',   'Pojavio se termin u vrijeme kad si slobodan.'),
    ('invite',           'Pozvan si na termin 🙌',  'Organizator te zove da uskočiš. Pogledaj termin.'),
    ('repeat_invite',    'Opet igrate? 🔁',         'Termin na kojem si igrao ponavlja se i sljedeće sedmice. Prijavi se.'),
    ('game_repeated',    'Termin ponovljen 🔁',     'Tvoj sedmični termin je objavljen i za sljedeću sedmicu.'),
    ('repeat_failed',    'Ponavljanje zaustavljeno', 'Sedmični termin nije mogao biti ponovljen (možda imaš previše aktivnih oglasa).'),
    ('spot_open',        'Oslobodilo se mjesto! 🟢', 'Termin za koji si na listi čekanja ponovo ima slobodno mjesto. Brzo!')
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

-- Push za novu poruku u chatu (ide direktno, ne puni listu obavijesti)
create or replace function public.send_push_for_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_game   public.games;
  v_sender text;
  t        record;
begin
  select * into v_game from public.games where id = new.game_id;
  select coalesce(nullif(trim(first_name), ''), 'Igrač') into v_sender
  from public.profiles where id = new.user_id;

  for t in
    select pt.token
    from public.push_tokens pt
    where pt.user_id <> new.user_id
      and (
        pt.user_id = v_game.organizer_id
        or exists (select 1 from public.join_requests jr
                   where jr.game_id = new.game_id and jr.player_id = pt.user_id and jr.status = 'approved')
      )
  loop
    perform net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      body    := jsonb_build_object(
                   'to', t.token,
                   'title', '💬 ' || v_sender || ' · ' || v_game.venue_name,
                   'body', left(new.body, 140),
                   'sound', 'default',
                   'data', jsonb_build_object('game_id', new.game_id, 'chat', true)),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists game_messages_push on public.game_messages;
create trigger game_messages_push
  after insert on public.game_messages
  for each row execute function public.send_push_for_message();

-- =====================================================================
--  KRAJ
-- =====================================================================
