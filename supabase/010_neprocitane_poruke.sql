-- =====================================================================
--  010: Nepročitane poruke u chatu termina
--  Pokreni u Supabase: SQL Editor -> New query -> zalijepi cijeli fajl -> Run
-- =====================================================================

-- Kad je ko zadnji put otvorio chat kojeg termina
create table if not exists public.game_chat_reads (
  game_id      uuid not null references public.games(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

alter table public.game_chat_reads enable row level security;

drop policy if exists "chat_reads_own" on public.game_chat_reads;
create policy "chat_reads_own" on public.game_chat_reads
  for select to authenticated using (user_id = auth.uid());

-- Označi chat kao pročitan (vrijeme sa servera, da sat na telefonu ne smeta)
create or replace function public.mark_chat_read(p_game_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_chat(p_game_id) then return; end if;
  insert into public.game_chat_reads (game_id, user_id, last_read_at)
  values (p_game_id, auth.uid(), now())
  on conflict (game_id, user_id) do update set last_read_at = now();
end;
$$;

-- Broj nepročitanih poruka po terminu (samo termini u kojima si organizator ili odobren igrač)
create or replace function public.chat_unread()
returns table (game_id uuid, unread int)
language sql stable security definer set search_path = '' as $$
  select m.game_id, count(*)::int
  from public.game_messages m
  join public.games g on g.id = m.game_id
  left join public.game_chat_reads cr on cr.game_id = m.game_id and cr.user_id = auth.uid()
  where m.user_id <> auth.uid()
    and m.created_at > coalesce(cr.last_read_at, '-infinity'::timestamptz)
    and g.starts_at > now() - interval '7 days'
    and (
      g.organizer_id = auth.uid()
      or exists (select 1 from public.join_requests r
                 where r.game_id = g.id and r.player_id = auth.uid() and r.status = 'approved')
    )
  group by m.game_id;
$$;
