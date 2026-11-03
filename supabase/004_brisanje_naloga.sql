-- =====================================================================
--  004: Brisanje naloga
--  Pokreni u Supabase: SQL Editor -> New query -> Run
--
--  Briše korisnika iz auth.users. Zbog "on delete cascade" automatski se
--  brišu i profil, kontakti, oglasi, prijave, obavijesti i push tokeni.
--  Prije brisanja obavještavamo ljude na koje to utiče.
-- =====================================================================

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Niste prijavljeni';
  end if;

  -- 1) Moji aktivni oglasi: igrači koji su prijavljeni dobijaju "termin otkazan"
  insert into public.notifications (user_id, type, payload)
  select r.player_id, 'game_cancelled', '{}'::jsonb
  from public.join_requests r
  join public.games g on g.id = r.game_id
  where g.organizer_id = v_uid
    and g.status in ('open', 'full')
    and g.starts_at > now()
    and r.status in ('pending', 'approved');

  -- 2) Tuđi termini u kojima sam odobren: organizator dobija "igrač otkazao",
  --    a popunjen oglas se ponovo otvara
  insert into public.notifications (user_id, type, payload)
  select g.organizer_id, 'player_left', jsonb_build_object('game_id', g.id)
  from public.join_requests r
  join public.games g on g.id = r.game_id
  where r.player_id = v_uid
    and r.status = 'approved'
    and g.status in ('open', 'full')
    and g.starts_at > now();

  update public.games g set status = 'open'
  where g.status = 'full'
    and g.starts_at > now()
    and exists (
      select 1 from public.join_requests r
      where r.game_id = g.id and r.player_id = v_uid and r.status = 'approved'
    );

  -- 3) Brisanje (sve ostalo briše se kaskadno)
  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
