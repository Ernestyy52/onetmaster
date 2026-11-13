-- หอคอยสี่วิชา — initial schema DRAFT (handoff §6). Not yet applied to any project.
-- Answer keys live only in question_versions and are never exposed through RLS to students;
-- Edge Functions (service role) grade answers and grant rewards inside transactions.

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 16),
  appearance text not null default 'swordsman',
  role text not null default 'student' check (role in ('student', 'teacher')),
  created_at timestamptz not null default now()
);

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

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  quest_id text not null,
  goal jsonb not null default '{}',
  opens_at timestamptz, closes_at timestamptz
);

create table public.skills (
  id text primary key,            -- e.g. math.fraction_of_quantity
  subject text not null check (subject in ('thai', 'english', 'math', 'science')),
  name_th text not null,
  indicator text
);

create table public.question_versions (
  id text not null,
  version int not null,
  subject text not null,
  blueprint_version text not null,
  indicator text,
  skill_id text references public.skills(id),
  difficulty smallint not null check (difficulty between 1 and 3),
  item_type text not null,
  stem text not null,
  stimulus jsonb,
  options jsonb not null,           -- [{id, text}] stable ids
  answer_key text not null,         -- server only
  explanation text not null,
  distractor_rationale jsonb not null,
  variant_family_id text not null,
  source_refs text[] not null default '{}',
  review_status text not null check (review_status in ('draft', 'review', 'approved', 'published', 'retired')),
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (id, version)
);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id),
  enemy_id text not null,
  assignment_id uuid references public.assignments(id),
  state jsonb not null,
  pinned_questions jsonb not null default '[]', -- [{id, version}] fixed for this run
  result jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.attempts (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.runs(id) on delete cascade,
  turn_id text not null,
  question_id text not null,
  question_version int not null,
  chosen_option text not null,
  correct boolean not null,
  used_hint boolean not null default false,
  response_ms int,
  request_id uuid not null unique,  -- idempotency
  created_at timestamptz not null default now(),
  unique (run_id, turn_id)
);

create table public.mastery (
  player_id uuid references public.profiles(id) on delete cascade,
  skill_id text references public.skills(id),
  attempts int not null default 0,
  correct int not null default 0,
  correct_with_hint int not null default 0,
  independent_families text[] not null default '{}',
  level text not null default 'practising',
  primary key (player_id, skill_id)
);

create table public.reward_events (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.profiles(id),
  source text not null,             -- run:<id> | quest:<id>
  xp int not null default 0,
  items jsonb not null default '[]',
  request_id uuid not null unique,  -- replaying the same request never grants twice
  created_at timestamptz not null default now(),
  unique (player_id, source)
);

alter table public.profiles enable row level security;
alter table public.classrooms enable row level security;
alter table public.memberships enable row level security;
alter table public.assignments enable row level security;
alter table public.skills enable row level security;
alter table public.question_versions enable row level security;
alter table public.runs enable row level security;
alter table public.attempts enable row level security;
alter table public.mastery enable row level security;
alter table public.reward_events enable row level security;

create function public.teaches(student uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m join classrooms c on c.id = m.classroom_id
    where m.student_id = student and c.teacher_id = auth.uid()
  );
$$;

create policy "own profile" on public.profiles for select using (id = auth.uid() or public.teaches(id));
create policy "update own profile" on public.profiles for update using (id = auth.uid());
create policy "teacher classrooms" on public.classrooms for all using (teacher_id = auth.uid());
create policy "member sees classroom" on public.classrooms for select using (
  exists (select 1 from memberships m where m.classroom_id = id and m.student_id = auth.uid()));
create policy "own membership" on public.memberships for select using (student_id = auth.uid() or public.teaches(student_id));
create policy "skills readable" on public.skills for select using (true);
-- question_versions: no student policy at all → only the service role (Edge Functions) can read keys.
create policy "teachers review questions" on public.question_versions for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'teacher'));
create policy "own runs" on public.runs for select using (player_id = auth.uid() or public.teaches(player_id));
create policy "own attempts" on public.attempts for select using (
  exists (select 1 from runs r where r.id = run_id and (r.player_id = auth.uid() or public.teaches(r.player_id))));
create policy "own mastery" on public.mastery for select using (player_id = auth.uid() or public.teaches(player_id));
create policy "own rewards" on public.reward_events for select using (player_id = auth.uid() or public.teaches(player_id));
-- No insert/update policies for runs/attempts/mastery/reward_events: writes go through Edge Functions only.
