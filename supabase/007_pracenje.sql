-- =====================================================================
--  007: Praćenje sporta i grada (dorada)
--  Pokreni u Supabase: SQL Editor -> New query -> Run
--
--  Tabela "follows" i obavijest "new_game" postoje od prvog dana.
--  Ovdje dodajemo: blokirani korisnici ne dobijaju obavijesti o oglasima
--  jedno drugog, i najviše 20 praćenja po korisniku.
-- =====================================================================

create or replace function public.notify_followers()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, payload)
  select f.user_id, 'new_game', jsonb_build_object('game_id', new.id)
  from public.follows f
  where f.sport_id = new.sport_id
    and lower(f.city) = lower(new.city)
    and f.user_id <> new.organizer_id
    and not public.is_blocked(f.user_id, new.organizer_id);
  return new;
end;
$$;

create or replace function public.check_follow_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.follows where user_id = new.user_id) >= 20 then
    raise exception 'Možeš pratiti najviše 20 kombinacija sporta i grada.';
  end if;
  return new;
end;
$$;

drop trigger if exists follows_limits on public.follows;
create trigger follows_limits
  before insert on public.follows
  for each row execute function public.check_follow_limits();
