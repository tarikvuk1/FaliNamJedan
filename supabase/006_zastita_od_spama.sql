-- =====================================================================
--  006: Zaštita od spama
--  Pokreni u Supabase: SQL Editor -> New query -> Run
--
--  Ograničenja (lako se mijenjaju brojevima ispod):
--    Oglasi:  najviše 5 aktivnih, 10 novih u 24 sata, najviše 60 dana unaprijed
--    Prijave: najviše 10 na čekanju, 30 u 24 sata
--    Prijave korisnika (reports): najviše 10 u 24 sata, isti korisnik jednom u 24 sata
-- =====================================================================

-- ---------------------------------------------------------------------
-- Oglasi
-- ---------------------------------------------------------------------
create or replace function public.check_game_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.starts_at > now() + interval '60 days' then
    raise exception 'Termin može biti najviše 60 dana unaprijed.';
  end if;

  if tg_op = 'INSERT' then
    if (select count(*) from public.games
        where organizer_id = new.organizer_id
          and status in ('open', 'full')
          and starts_at > now()) >= 5 then
      raise exception 'Možeš imati najviše 5 aktivnih oglasa. Obriši ili otkaži neki od postojećih.';
    end if;

    if (select count(*) from public.games
        where organizer_id = new.organizer_id
          and created_at > now() - interval '24 hours') >= 10 then
      raise exception 'Objavio si previše oglasa u zadnja 24 sata. Pokušaj kasnije.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists games_limits on public.games;
create trigger games_limits
  before insert or update of starts_at on public.games
  for each row execute function public.check_game_limits();

-- ---------------------------------------------------------------------
-- Prijave na termine
-- ---------------------------------------------------------------------
create or replace function public.check_request_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Provjeravamo samo kad prijava postaje "na čekanju" (nova ili ponovna)
  if new.status <> 'pending' or (tg_op = 'UPDATE' and old.status = 'pending') then
    return new;
  end if;

  if (select count(*) from public.join_requests
      where player_id = new.player_id and status = 'pending') >= 10 then
    raise exception 'Imaš previše prijava na čekanju (najviše 10). Sačekaj odgovor ili otkaži neku.';
  end if;

  if (select count(*) from public.join_requests
      where player_id = new.player_id
        and updated_at > now() - interval '24 hours') >= 30 then
    raise exception 'Previše prijava u zadnja 24 sata. Pokušaj kasnije.';
  end if;

  return new;
end;
$$;

drop trigger if exists join_requests_limits on public.join_requests;
create trigger join_requests_limits
  before insert or update of status on public.join_requests
  for each row execute function public.check_request_limits();

-- ---------------------------------------------------------------------
-- Prijave korisnika (reports)
-- ---------------------------------------------------------------------
create or replace function public.check_report_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.reports
             where reporter_id = new.reporter_id
               and reported_id = new.reported_id
               and created_at > now() - interval '24 hours') then
    raise exception 'Već si prijavio ovog korisnika. Pregledat ćemo prijavu.';
  end if;

  if (select count(*) from public.reports
      where reporter_id = new.reporter_id
        and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'Poslao si previše prijava u zadnja 24 sata.';
  end if;

  return new;
end;
$$;

drop trigger if exists reports_limits on public.reports;
create trigger reports_limits
  before insert on public.reports
  for each row execute function public.check_report_limits();
