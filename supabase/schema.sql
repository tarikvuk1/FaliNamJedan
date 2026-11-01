-- =====================================================================
--  FALI NAM JEDAN – Supabase backend v1
--  Pokreni cijeli fajl u Supabase: SQL Editor -> New query -> Run
--  Prije toga uključi ekstenziju pg_cron (Database -> Extensions)
-- =====================================================================

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------
-- 1. TIPOVI
-- ---------------------------------------------------------------------
create type public.game_status    as enum ('open', 'full', 'cancelled', 'finished');
create type public.request_status as enum ('pending', 'approved', 'rejected', 'cancelled', 'expired');
create type public.skill_level    as enum ('any', 'beginner', 'intermediate', 'advanced');

-- ---------------------------------------------------------------------
-- 2. TABELE
-- ---------------------------------------------------------------------

-- Sportovi (fiksna lista, da filteri rade pouzdano)
create table public.sports (
  id   smallint generated always as identity primary key,
  slug text unique not null,
  name text not null
);

insert into public.sports (slug, name) values
  ('football',     'Mali fudbal'),
  ('volleyball',   'Odbojka'),
  ('basketball',   'Košarka'),
  ('tennis',       'Tenis'),
  ('padel',        'Padel'),
  ('handball',     'Rukomet'),
  ('table_tennis', 'Stoni tenis');

-- Javni dio profila (vide ga svi prijavljeni korisnici)
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  first_name      text check (char_length(first_name) <= 50),
  last_name       text check (char_length(last_name)  <= 50),
  avatar_url      text,
  city            text,
  bio             text check (char_length(bio) <= 300),
  games_attended  int not null default 0,   -- pouzdanost: došao
  games_no_show   int not null default 0,   -- pouzdanost: nije došao
  created_at      timestamptz not null default now()
);

-- Kontakti – odvojeno, vidljivi samo nakon odobrenja
create table public.profile_contacts (
  user_id   uuid primary key references public.profiles(id) on delete cascade,
  phone     text,
  instagram text,
  facebook  text,
  other     text,
  constraint at_least_one_contact check (
    num_nonnulls(nullif(trim(phone), ''), nullif(trim(instagram), ''),
                 nullif(trim(facebook), ''), nullif(trim(other), '')) >= 1
  )
);

-- Sportovi koje korisnik igra
create table public.user_sports (
  user_id  uuid references public.profiles(id) on delete cascade,
  sport_id smallint references public.sports(id),
  level    public.skill_level not null default 'any',
  primary key (user_id, sport_id)
);

-- Oglasi ("fali nam jedan")
create table public.games (
  id                uuid primary key default gen_random_uuid(),
  organizer_id      uuid not null references public.profiles(id) on delete cascade,
  sport_id          smallint not null references public.sports(id),
  city              text not null,
  venue_name        text not null check (char_length(venue_name) <= 100),
  address           text,
  location          extensions.geography(point, 4326),
  starts_at         timestamptz not null,
  duration_minutes  int not null default 60 check (duration_minutes between 15 and 480),
  players_needed    int not null check (players_needed between 1 and 20),
  price_per_person  numeric(6,2) check (price_per_person >= 0),
  level             public.skill_level not null default 'any',
  note              text check (char_length(note) <= 500),
  status            public.game_status not null default 'open',
  created_at        timestamptz not null default now(),
  check (starts_at > created_at)
);

create index games_search_idx   on public.games (sport_id, city, starts_at) where status = 'open';
create index games_location_idx on public.games using gist (location);

-- Prijave na oglas
create table public.join_requests (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games(id) on delete cascade,
  player_id   uuid not null references public.profiles(id) on delete cascade,
  status      public.request_status not null default 'pending',
  message     text check (char_length(message) <= 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (game_id, player_id)
);

create index join_requests_game_idx on public.join_requests (game_id, status);

-- Praćenje (npr. odbojka + Sarajevo) za obavijesti o novim oglasima
create table public.follows (
  user_id  uuid references public.profiles(id) on delete cascade,
  sport_id smallint references public.sports(id),
  city     text not null,
  primary key (user_id, sport_id, city)
);

-- Evidencija dolaska nakon termina (organizator označava)
create table public.attendance (
  game_id    uuid references public.games(id) on delete cascade,
  player_id  uuid references public.profiles(id) on delete cascade,
  showed_up  boolean not null,
  marked_at  timestamptz not null default now(),
  primary key (game_id, player_id)
);

-- Obavijesti u aplikaciji (kasnije ih šaljemo i kao push)
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null,   -- new_request, request_approved, request_rejected,
                               -- game_full, request_expired, player_left,
                               -- game_cancelled, new_game
  payload     jsonb not null default '{}',
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, read, created_at desc);

-- ---------------------------------------------------------------------
-- 3. POMOĆNE FUNKCIJE
-- ---------------------------------------------------------------------

-- Profil je kompletan: ime, prezime i bar jedan kontakt
create function public.is_onboarded(uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.profiles p
    join public.profile_contacts c on c.user_id = p.id
    where p.id = uid
      and nullif(trim(p.first_name), '') is not null
      and nullif(trim(p.last_name),  '') is not null
  );
$$;

-- Da li trenutni korisnik smije vidjeti kontakte osobe "target"
create function public.can_see_contacts(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select target = auth.uid() or exists (
    select 1
    from public.join_requests r
    join public.games g on g.id = r.game_id
    where r.status = 'approved'
      and g.status <> 'cancelled'
      and (
        (g.organizer_id = auth.uid() and r.player_id   = target) or
        (r.player_id   = auth.uid() and g.organizer_id = target)
      )
  );
$$;

-- Automatsko kreiranje profila pri registraciji (Google šalje ime i sliku)
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_full  text := trim(coalesce(new.raw_user_meta_data->>'full_name',
                                new.raw_user_meta_data->>'name', ''));
  v_first text := split_part(v_full, ' ', 1);
begin
  insert into public.profiles (id, first_name, last_name, avatar_url)
  values (
    new.id,
    nullif(v_first, ''),
    nullif(trim(substr(v_full, length(v_first) + 1)), ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Obavijest pratiocima kad se pojavi novi oglas
create function public.notify_followers()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, payload)
  select f.user_id, 'new_game', jsonb_build_object('game_id', new.id)
  from public.follows f
  where f.sport_id = new.sport_id
    and lower(f.city) = lower(new.city)
    and f.user_id <> new.organizer_id;
  return new;
end;
$$;

create trigger on_game_created
  after insert on public.games
  for each row execute function public.notify_followers();

-- ---------------------------------------------------------------------
-- 4. AKCIJE (aplikacija ih poziva preko supabase.rpc(...))
--    Sve promjene statusa idu isključivo kroz ove funkcije.
-- ---------------------------------------------------------------------

-- Igrač: "Pridruži se"
create function public.request_to_join(p_game_id uuid, p_message text default null)
returns public.join_requests language plpgsql security definer set search_path = '' as $$
declare
  v_game public.games;
  v_req  public.join_requests;
begin
  if auth.uid() is null then
    raise exception 'Niste prijavljeni';
  end if;
  if not public.is_onboarded(auth.uid()) then
    raise exception 'Dopunite profil: ime, prezime i bar jedan kontakt';
  end if;

  select * into v_game from public.games where id = p_game_id for update;
  if not found then
    raise exception 'Termin ne postoji';
  end if;
  if v_game.organizer_id = auth.uid() then
    raise exception 'Ne možete se prijaviti na svoj termin';
  end if;
  if v_game.status <> 'open' or v_game.starts_at <= now() then
    raise exception 'Termin više nije otvoren';
  end if;

  -- Ponovna prijava dozvoljena samo ako je ranija otkazana ili istekla
  insert into public.join_requests (game_id, player_id, message)
  values (p_game_id, auth.uid(), p_message)
  on conflict (game_id, player_id) do update
    set status = 'pending', message = excluded.message, updated_at = now()
    where public.join_requests.status in ('cancelled', 'expired')
  returning * into v_req;

  if v_req.id is null then
    raise exception 'Već postoji vaša prijava za ovaj termin';
  end if;

  insert into public.notifications (user_id, type, payload)
  values (v_game.organizer_id, 'new_request',
          jsonb_build_object('game_id', p_game_id, 'request_id', v_req.id));

  return v_req;
end;
$$;

-- Organizator: odobri / odbij
create function public.respond_to_request(p_request_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_game_id  uuid;
  v_game     public.games;
  v_req      public.join_requests;
  v_approved int;
begin
  select game_id into v_game_id from public.join_requests where id = p_request_id;
  if not found then
    raise exception 'Prijava ne postoji';
  end if;

  select * into v_game from public.games where id = v_game_id for update;
  if v_game.organizer_id is distinct from auth.uid() then
    raise exception 'Nemate pravo na ovu akciju';
  end if;

  select * into v_req from public.join_requests where id = p_request_id for update;
  if v_req.status <> 'pending' then
    raise exception 'Prijava više nije na čekanju';
  end if;

  if not p_approve then
    update public.join_requests set status = 'rejected', updated_at = now() where id = p_request_id;
    insert into public.notifications (user_id, type, payload)
    values (v_req.player_id, 'request_rejected', jsonb_build_object('game_id', v_game.id));
    return;
  end if;

  if v_game.status <> 'open' or v_game.starts_at <= now() then
    raise exception 'Termin više nije otvoren';
  end if;

  update public.join_requests set status = 'approved', updated_at = now() where id = p_request_id;
  insert into public.notifications (user_id, type, payload)
  values (v_req.player_id, 'request_approved', jsonb_build_object('game_id', v_game.id));

  -- Popunjeno? Zatvori oglas i obavijesti ostale na čekanju
  select count(*) into v_approved
  from public.join_requests where game_id = v_game.id and status = 'approved';

  if v_approved >= v_game.players_needed then
    update public.games set status = 'full' where id = v_game.id;

    with closed as (
      update public.join_requests
      set status = 'expired', updated_at = now()
      where game_id = v_game.id and status = 'pending'
      returning player_id
    )
    insert into public.notifications (user_id, type, payload)
    select player_id, 'game_full', jsonb_build_object('game_id', v_game.id) from closed;
  end if;
end;
$$;

-- Igrač: otkaži svoju prijavu (na čekanju ili već odobrenu)
create function public.cancel_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_game_id uuid;
  v_game    public.games;
  v_req     public.join_requests;
begin
  select game_id into v_game_id
  from public.join_requests where id = p_request_id and player_id = auth.uid();
  if not found then
    raise exception 'Prijava ne postoji';
  end if;

  select * into v_game from public.games where id = v_game_id for update;
  select * into v_req  from public.join_requests where id = p_request_id for update;

  if v_req.status not in ('pending', 'approved') then
    raise exception 'Ova prijava se ne može otkazati';
  end if;
  if v_game.starts_at <= now() then
    raise exception 'Termin je već počeo';
  end if;

  update public.join_requests set status = 'cancelled', updated_at = now() where id = p_request_id;

  -- Ako je odobreni igrač otkazao, oglas se ponovo otvara
  if v_req.status = 'approved' then
    if v_game.status = 'full' then
      update public.games set status = 'open' where id = v_game.id;
    end if;
    insert into public.notifications (user_id, type, payload)
    values (v_game.organizer_id, 'player_left',
            jsonb_build_object('game_id', v_game.id, 'player_id', auth.uid()));
  end if;
end;
$$;

-- Organizator: otkaži cijeli termin
create function public.cancel_game(p_game_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_game public.games;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.organizer_id is distinct from auth.uid() then
    raise exception 'Nemate pravo na ovu akciju';
  end if;
  if v_game.status not in ('open', 'full') then
    raise exception 'Termin se ne može otkazati';
  end if;

  update public.games set status = 'cancelled' where id = p_game_id;

  insert into public.notifications (user_id, type, payload)
  select player_id, 'game_cancelled', jsonb_build_object('game_id', p_game_id)
  from public.join_requests
  where game_id = p_game_id and status in ('pending', 'approved');

  update public.join_requests set status = 'expired', updated_at = now()
  where game_id = p_game_id and status = 'pending';
end;
$$;

-- Organizator: nakon termina označi da li je igrač došao
create function public.mark_attendance(p_game_id uuid, p_player_id uuid, p_showed_up boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_game public.games;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found or v_game.organizer_id is distinct from auth.uid() then
    raise exception 'Nemate pravo na ovu akciju';
  end if;
  if v_game.starts_at > now() then
    raise exception 'Termin još nije počeo';
  end if;
  if not exists (
    select 1 from public.join_requests
    where game_id = p_game_id and player_id = p_player_id and status = 'approved'
  ) then
    raise exception 'Igrač nije bio odobren za ovaj termin';
  end if;

  insert into public.attendance (game_id, player_id, showed_up)
  values (p_game_id, p_player_id, p_showed_up)
  on conflict (game_id, player_id)
    do update set showed_up = excluded.showed_up, marked_at = now();

  update public.profiles set
    games_attended = (select count(*) from public.attendance where player_id = p_player_id and showed_up),
    games_no_show  = (select count(*) from public.attendance where player_id = p_player_id and not showed_up)
  where id = p_player_id;
end;
$$;

-- Pretraga oglasa: sport, grad, period, opcionalno udaljenost
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
  distance_km       double precision
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
    end
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
  order by g.starts_at
  limit 100;
$$;

-- ---------------------------------------------------------------------
-- 5. AUTOMATIKA (pokreće se svakih 10 minuta)
--    - prijave na čekanju ističu kad termin počne
--    - završeni termini dobijaju status 'finished'
-- ---------------------------------------------------------------------
create function public.expire_stale()
returns void language plpgsql security definer set search_path = '' as $$
begin
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

  update public.games
  set status = 'finished'
  where status in ('open', 'full')
    and starts_at + make_interval(mins => duration_minutes) < now();
end;
$$;

revoke execute on function public.expire_stale() from public, anon, authenticated;

select cron.schedule('fali-nam-jedan-expire', '*/10 * * * *', $$select public.expire_stale()$$);

-- ---------------------------------------------------------------------
-- 6. SIGURNOST (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.sports           enable row level security;
alter table public.profiles         enable row level security;
alter table public.profile_contacts enable row level security;
alter table public.user_sports      enable row level security;
alter table public.games            enable row level security;
alter table public.join_requests    enable row level security;
alter table public.follows          enable row level security;
alter table public.attendance       enable row level security;
alter table public.notifications    enable row level security;

-- Sportovi: svi čitaju
create policy "sports_read" on public.sports
  for select to authenticated using (true);

-- Profili: svi prijavljeni čitaju javni dio, svako mijenja samo svoj
create policy "profiles_read" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Korisnik ne smije sam mijenjati brojače pouzdanosti
revoke update on public.profiles from authenticated;
grant update (first_name, last_name, avatar_url, city, bio) on public.profiles to authenticated;

-- Kontakti: vidi ih samo vlasnik i osoba s odobrenim terminom
create policy "contacts_read" on public.profile_contacts
  for select to authenticated using (public.can_see_contacts(user_id));
create policy "contacts_insert_own" on public.profile_contacts
  for insert to authenticated with check (user_id = auth.uid());
create policy "contacts_update_own" on public.profile_contacts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Sportovi korisnika
create policy "user_sports_read" on public.user_sports
  for select to authenticated using (true);
create policy "user_sports_write_own" on public.user_sports
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Oglasi: svi čitaju; objaviti može samo korisnik s kompletnim profilom.
-- Izmjene statusa idu samo kroz funkcije iznad.
create policy "games_read" on public.games
  for select to authenticated using (true);
create policy "games_insert" on public.games
  for insert to authenticated with check (
    organizer_id = auth.uid()
    and status = 'open'
    and starts_at > now()
    and public.is_onboarded(auth.uid())
  );

-- Prijave: vidi ih igrač i organizator tog termina. Upis samo kroz funkcije.
create policy "requests_read" on public.join_requests
  for select to authenticated using (
    player_id = auth.uid()
    or exists (select 1 from public.games g where g.id = game_id and g.organizer_id = auth.uid())
  );

-- Praćenje
create policy "follows_own" on public.follows
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Dolasci: vidi igrač i organizator
create policy "attendance_read" on public.attendance
  for select to authenticated using (
    player_id = auth.uid()
    or exists (select 1 from public.games g where g.id = game_id and g.organizer_id = auth.uid())
  );

-- Obavijesti: samo svoje; korisnik ih može označiti kao pročitane
create policy "notifications_read_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "notifications_update_own" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
--  KRAJ
-- =====================================================================
