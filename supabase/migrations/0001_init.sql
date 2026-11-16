-- หอคอยสี่วิชา — M2 schema (accounts + server-authoritative saves).
-- Model: one authoritative save document per account (`player_state.save`, same SaveV2 format as the
-- offline LocalGameApi), changed ONLY by the `game` Edge Function inside a transaction that locks the
-- row (`select … for update`) and records the request id in `request_log`. Students can read their
-- own rows through RLS but can never insert/update/delete anything directly.
-- Answer keys live only in question_versions, which students cannot read at all.

-- ───────── accounts ─────────
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null default 'student' check (role in ('student', 'teacher')),
  created_at timestamptz not null default now()
);

-- every new auth user gets a student profile (role changes are done by staff with the service role)
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id),
  name text not null,
  join_code text not null unique,
  created_at timestamptz not null default now()
);

create table public.memberships (
  classroom_id uuid references public.classrooms(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (classroom_id, student_id)
);

-- ───────── game state ─────────
create table public.player_state (
  user_id uuid primary key references auth.users on delete cascade,
  save jsonb not null,               -- SaveV2 (characters, account mastery, runs, recent requests)
  save_version int not null default 2,
  revision bigint not null default 0, -- +1 on every committed write
  updated_at timestamptz not null default now()
);

-- permanent idempotency record: the same (user, request id) never runs twice
create table public.request_log (
  user_id uuid not null references auth.users on delete cascade,
  request_id uuid not null,
  op text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

-- audit of XP / items granted (written in the same transaction as the save)
create table public.reward_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  character_slot int not null,
  op text not null,
  request_id uuid,
  xp int not null default 0,
  job_xp int not null default 0,
  items jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- teacher-facing projection of the account's Subject Mastery (copied from the save on every write)
create table public.mastery (
  user_id uuid not null references auth.users on delete cascade,
  skill_id text not null,
  subject text not null check (subject in ('thai', 'english', 'math', 'science')),
  attempts int not null default 0,
  correct int not null default 0,
  correct_with_hint int not null default 0,
  independent_families text[] not null default '{}',
  level text not null default 'practising',
  updated_at timestamptz not null default now(),
  primary key (user_id, skill_id)
);

-- ───────── question bank (server only) ─────────
create table public.question_versions (
  id text not null,
  version int not null,
  subject text not null check (subject in ('thai', 'english', 'math', 'science')),
  skill_id text not null,
  review_status text not null check (review_status in ('draft', 'review', 'approved', 'published', 'retired')),
  item jsonb not null,               -- full QuestionItem incl. answer_key / explanation
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (id, version)
);

-- ───────── row level security ─────────
alter table public.profiles enable row level security;
alter table public.classrooms enable row level security;
alter table public.memberships enable row level security;
alter table public.player_state enable row level security;
alter table public.request_log enable row level security;
alter table public.reward_events enable row level security;
alter table public.mastery enable row level security;
alter table public.question_versions enable row level security;

create function public.is_teacher() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher');
$$;

create function public.teaches(student uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m join public.classrooms c on c.id = m.classroom_id
    where m.student_id = student and c.teacher_id = auth.uid()
  );
$$;

-- read-only policies; there are deliberately NO insert/update/delete policies for clients
-- (profiles.role in particular can only be changed with the service role)
create policy "own or taught profile" on public.profiles for select using (id = auth.uid() or public.teaches(id));
create policy "teacher classrooms" on public.classrooms for select using (teacher_id = auth.uid());
create policy "member sees classroom" on public.classrooms for select using (
  exists (select 1 from public.memberships m where m.classroom_id = id and m.student_id = auth.uid()));
create policy "own membership" on public.memberships for select using (student_id = auth.uid() or public.teaches(student_id));
create policy "own save" on public.player_state for select using (user_id = auth.uid());
create policy "own rewards" on public.reward_events for select using (user_id = auth.uid() or public.teaches(user_id));
create policy "own mastery" on public.mastery for select using (user_id = auth.uid() or public.teaches(user_id));
create policy "teachers review questions" on public.question_versions for select using (public.is_teacher());
-- request_log: no policy → no client access at all

revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
grant select on public.profiles, public.classrooms, public.memberships, public.player_state,
  public.reward_events, public.mastery, public.question_versions to authenticated;
