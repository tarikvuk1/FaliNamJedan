-- =====================================================================
--  005: Prijava i blokiranje korisnika
--  Pokreni u Supabase: SQL Editor -> New query -> Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabele
-- ---------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  game_id     uuid references public.games(id) on delete set null,
  reason      text not null check (reason in ('no_show', 'abuse', 'fake', 'spam', 'other')),
  details     text check (char_length(details) <= 500),
  status      text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at  timestamptz not null default now(),
  check (reporter_id is distinct from reported_id)
);

create index reports_open_idx on public.reports (status, created_at desc);

alter table public.blocks  enable row level security;
alter table public.reports enable row level security;

-- Svoje blokade vidiš (za listu "Blokirani korisnici"); upis ide kroz funkcije
create policy "blocks_read_own" on public.blocks
  for select to authenticated using (blocker_id = auth.uid());

-- Prijavu možeš poslati, ali ne i čitati (prijave pregledaš ti u Supabaseu)
create policy "reports_insert_own" on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());

-- ---------------------------------------------------------------------
-- Pomoćna funkcija: da li je bilo ko od dvojice blokirao drugog
-- ---------------------------------------------------------------------
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- ---------------------------------------------------------------------
-- Blokiranje / odblokiranje
-- ---------------------------------------------------------------------
create or replace function public.block_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_user_id is null or p_user_id = auth.uid() then
    raise exception 'Neispravan zahtjev';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (auth.uid(), p_user_id)
  on conflict do nothing;

  -- Njegove prijave na čekanju na moje termine -> odbijene
  update public.join_requests r
  set status = 'rejected', updated_at = now()
  from public.games g
  where g.id = r.game_id and g.organizer_id = auth.uid()
    and r.player_id = p_user_id and r.status = 'pending';

  -- Moje prijave na čekanju na njegove termine -> povučene
  update public.join_requests r
  set status = 'cancelled', updated_at = now()
  from public.games g
  where g.id = r.game_id and g.organizer_id = p_user_id
    and r.player_id = auth.uid() and r.status = 'pending';
end;
$$;

create or replace function public.unblock_user(p_user_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = p_user_id;
$$;

-- ---------------------------------------------------------------------
-- Blokirani se međusobno ne vide
-- ---------------------------------------------------------------------

-- Oglasi blokiranih korisnika se ne prikazuju (ni u detaljima)
drop policy "games_read" on public.games;
create policy "games_read" on public.games
  for select to authenticated using (not public.is_blocked(organizer_id, auth.uid()));

-- Pretraga: isključi oglase blokiranih
create or replace function public.search_games(
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
    and not public.is_blocked(g.organizer_id, auth.uid())
  order by g.starts_at
  limit 100;
$$;

-- Prijava na termin: blokirani se ne mogu prijaviti
create or replace function public.request_to_join(p_game_id uuid, p_message text default null)
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
  if public.is_blocked(v_game.organizer_id, auth.uid()) then
    raise exception 'Ne možete se prijaviti na ovaj termin';
  end if;
  if v_game.status <> 'open' or v_game.starts_at <= now() then
    raise exception 'Termin više nije otvoren';
  end if;

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
