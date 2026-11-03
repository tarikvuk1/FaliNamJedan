-- =====================================================================
--  003: Izmjena i brisanje oglasa
--  Pokreni u Supabase: SQL Editor -> New query -> Run
-- =====================================================================

-- Organizator mijenja oglas
create or replace function public.update_game(
  p_game_id        uuid,
  p_sport_id       smallint,
  p_city           text,
  p_venue_name     text,
  p_address        text,
  p_lat            double precision,
  p_lng            double precision,
  p_starts_at      timestamptz,
  p_duration       int,
  p_players_needed int,
  p_price          numeric,
  p_level          public.skill_level,
  p_note           text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_game     public.games;
  v_approved int;
  v_full     boolean;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.organizer_id is distinct from auth.uid() then
    raise exception 'Nemate pravo na ovu akciju';
  end if;
  if v_game.status not in ('open', 'full') or v_game.starts_at <= now() then
    raise exception 'Termin se više ne može mijenjati';
  end if;
  if p_starts_at <= now() then
    raise exception 'Termin mora biti u budućnosti';
  end if;

  select count(*) into v_approved
  from public.join_requests where game_id = p_game_id and status = 'approved';

  if p_players_needed < v_approved then
    raise exception 'Već si odobrio % igrača, pa broj igrača ne može biti manji od toga', v_approved;
  end if;

  v_full := v_approved >= p_players_needed;

  update public.games set
    sport_id         = p_sport_id,
    city             = p_city,
    venue_name       = p_venue_name,
    address          = p_address,
    location         = case
                         when p_lat is null or p_lng is null then null
                         else extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
                       end,
    starts_at        = p_starts_at,
    duration_minutes = p_duration,
    players_needed   = p_players_needed,
    price_per_person = p_price,
    level            = p_level,
    note             = p_note,
    status           = case when v_full then 'full'::public.game_status else 'open'::public.game_status end
  where id = p_game_id;

  -- Ako je oglas sada popunjen, prijave na čekanju se zatvaraju
  if v_full then
    with closed as (
      update public.join_requests
      set status = 'expired', updated_at = now()
      where game_id = p_game_id and status = 'pending'
      returning player_id
    )
    insert into public.notifications (user_id, type, payload)
    select player_id, 'game_full', jsonb_build_object('game_id', p_game_id) from closed;
  end if;

  -- Obavijesti sve koji su prijavljeni da je termin izmijenjen
  insert into public.notifications (user_id, type, payload)
  select player_id, 'game_updated', jsonb_build_object('game_id', p_game_id)
  from public.join_requests
  where game_id = p_game_id and status in ('pending', 'approved');
end;
$$;

-- Organizator briše oglas
-- Aktivan termin s odobrenim igračima se ne briše, nego otkazuje (da igrači dobiju obavijest).
create or replace function public.delete_game(p_game_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_game public.games;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.organizer_id is distinct from auth.uid() then
    raise exception 'Nemate pravo na ovu akciju';
  end if;

  if v_game.status in ('open', 'full') and v_game.starts_at > now() and exists (
    select 1 from public.join_requests where game_id = p_game_id and status = 'approved'
  ) then
    raise exception 'Termin ima odobrene igrače. Otkaži ga umjesto brisanja, da dobiju obavijest.';
  end if;

  -- Igrači koji još čekaju odobrenje dobijaju obavijest
  if v_game.status in ('open', 'full') and v_game.starts_at > now() then
    insert into public.notifications (user_id, type, payload)
    select player_id, 'game_cancelled', '{}'::jsonb
    from public.join_requests
    where game_id = p_game_id and status = 'pending';
  end if;

  delete from public.games where id = p_game_id;
end;
$$;

-- Push tekstovi: dodan "game_updated"
create or replace function public.send_push_for_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_title text;
  v_body  text;
  t record;
begin
  select m.title, m.body into v_title, v_body
  from (values
    ('new_request',      'Nova prijava 🙋',      'Neko se prijavio na tvoj termin. Odobri ili odbij.'),
    ('request_approved', 'Odobren si ✅',         'Organizator te prihvatio. Kontakt je u detaljima termina.'),
    ('request_rejected', 'Prijava odbijena',      'Organizator je odbio tvoju prijavu.'),
    ('game_full',        'Termin popunjen 🔒',    'Termin na koji si se prijavio je popunjen.'),
    ('request_expired',  'Prijava istekla ⌛',    'Termin je počeo prije nego je prijava odobrena.'),
    ('player_left',      'Igrač otkazao 🚶',      'Mjesto u tvom terminu je ponovo slobodno.'),
    ('game_cancelled',   'Termin otkazan 🚫',     'Organizator je otkazao termin.'),
    ('game_updated',     'Termin izmijenjen ✏️',  'Organizator je promijenio detalje termina. Provjeri vrijeme i mjesto.'),
    ('new_game',         'Novi termin 📣',        'Pojavio se termin za sport koji pratiš.')
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
