# M2 change log: accounts and server-side saves

**For:** ChatGPT/Codex or any other agent continuing this repo. **Branch:** `m2-accounts-server` (on top of `m1-characters-jobs`). **Date:** 15 Nov 2026.
**Supabase project (dev):** `https://torkznvzanwoniqxuttc.supabase.co` (ref `torkznvzanwoniqxuttc`).

> **Status (15 Nov 2026):** **deployed to the dev project, but not yet verified with signed-in users.**
> - Done (CLI 2.122.0 via `npx`): `supabase init` + `link` (no DB password needed), `db push` (0001 + 0002), `functions deploy game`, secret `ALLOW_REVIEW_QUESTIONS=true`. `.env.local` holds the URL + publishable key (`sb_publishable_…`, public by design).
> - Checked without a session: `POST /functions/v1/game` → `401 {"error":"not signed in"}`; REST reads of `question_versions` and `player_state` → `42501 permission denied`.
> - **Not done:** `npm run test:online` with two test accounts (cross-device, RLS between users, concurrent duplicates). Do not describe the game as online until it passes.
> - 16 Nov 2026: migration `0003_lock_default_privileges.sql` pushed and the function (8000-char body limit) redeployed; the anonymous checks above still pass.

## 1. Architecture

```
browser (online build)                      Supabase
  SupabaseGameApi ── functions.invoke('game', {op,args}) ──► Edge Function `game` (Deno)
     │  (JWT from Supabase Auth)                                 │ handleRequest()  ← src/server/gameHandler.ts
     │                                                           │   = the SAME rules as offline LocalGameApi
     └─ RLS read-only: own player_state / mastery / rewards      ▼
                                                       Postgres (one transaction per write):
                                                         lock player_state row (FOR UPDATE)
                                                         → request_log hit? return stored response
                                                         → run op on the save document
                                                         → write save, reward_events, mastery, request_log
```

- **One authoritative save per account:** `player_state.save` uses the same `SaveV2` JSON as offline mode (characters, account-wide mastery, runs). Only the Edge Function writes it.
- **Idempotency and races:** the row lock serialises one account's writes. `request_log (user_id, request_id)` is permanent, so a retried or duplicated request returns the first response and never runs twice. Write ops need UUID request ids, and the server rejects anything else.
- **Answer keys:** live only in `question_versions.item`. Students have no RLS access to that table. The Edge Function loads it with the database connection. In production only `approved`/`published` items are served. The `ALLOW_REVIEW_QUESTIONS=true` secret also allows `review` items, for dev only; all 24 current items are `review`.
- **Online builds contain no answer keys:** `src/api/index.ts` and the App test helper branch on `import.meta.env.VITE_SUPABASE_*`, so Vite removes the offline bank from online builds. `npm run check:online-bundle` builds with dummy settings and fails if `answer_key`, `distractor_rationale` or explanation text appears. CI runs it.
- **Offline mode still works:** with no Supabase env, the game uses `LocalGameApi` + localStorage exactly as before (all e2e tests run offline).

## 2. Files

| File | Purpose |
|---|---|
| `supabase/migrations/0001_init.sql` | rewritten: `profiles` (auto-created on sign-up, role changeable only by service role), `classrooms`, `memberships`, `player_state`, `request_log`, `reward_events`, `mastery` (teacher projection), `question_versions` (jsonb item); RLS read-only policies; no client insert/update/delete |
| `supabase/migrations/0002_seed_questions.sql` | **generated** by `npm run supabase:seed` from `src/shared/data/questions.ts` |
| `src/server/gameHandler.ts` | pure server logic: `parseRequest` (op allowlist, UUID request ids, size limits; `reset` is not available online), `runOp` (runs the op with `LocalGameApi` on the save), `handleRequest` (transaction flow over a `StateStore` interface), `toBank` |
| `supabase/functions/game/index.ts` | Deno Edge Function: auth via `getUser()`, Postgres via `SUPABASE_DB_URL` (`postgres` driver), implements `StateStore` with `FOR UPDATE` + `request_log` |
| `supabase/functions/game/engine.bundle.js` | **generated** (gitignored) by `npm run supabase:build` (esbuild bundle of `gameHandler.ts`) |
| `src/api/index.ts` | `initApi()` lazy-loads `SupabaseGameApi` (online) or `LocalGameApi` + bank (offline); `ONLINE` flag; UUID `requestId()` |
| `src/api/supabaseGameApi.ts` | online `GameApi`; retries network/5xx failures up to 3 times **with the same request id**; 401 → back to sign-in |
| `src/api/supabaseClient.ts`, `src/api/auth.ts` | browser client (anon key), sign in / sign up / sign out |
| `src/ui/screens.tsx` `AuthScreen`; `actions.boot()` | online builds show sign-in before the title; menu shows "ออกจากระบบ" instead of delete-save |
| `src/api/localGameApi.ts` | `bank` is now a required constructor argument, plus `allowedStatuses`, so the server never uses the bundled bank |
| `tests/unit/server.test.ts` | in-memory `StateStore` with per-user lock and rollback: full prologue via server path, second device, isolation, 10 concurrent duplicates → one reward, rollback on invalid move, no keys before answering, production refuses draft questions |
| `tests/integration/online.test.ts` | real-backend tests (skipped unless env + 2 test accounts are set): cross-device, RLS isolation, concurrent duplicates, no keys, 401 without session |
| `tools/check-online-bundle.ts` | online build leak check |

## 3. Data and migration notes

- `player_state.save` is created empty on the first write. Local (offline) progress is **not** uploaded yet. Planned: an `importLocalSave` op that clamps values server-side (ADR D5.3); not built.
- `profiles.role` defaults to `student`. Make a teacher with the service role / SQL editor: `update profiles set role='teacher' where id='…'`.
- `mastery` and `reward_events` are projections and audit rows written in the same transaction as the save. The save stays the source of truth.

## 4. Security review status

Opus review of auth, RLS and reward transactions, done 15 Nov 2026 (code review; the signed-in parts still need `test:online`):

| Area | Finding | Action |
|---|---|---|
| Auth | Function calls `auth.getUser()` with the caller's bearer token and uses only `data.user.id`; client-supplied ids are never trusted. No session → 401 (checked live). | OK |
| DB role | `SUPABASE_DB_URL` is a function secret, never sent to the browser; the function is the only writer. | OK |
| RLS / grants | Read-only `select` policies, no client insert/update/delete; `request_log` has no policy; anon has no table rights (checked live). `is_teacher`/`teaches` are `security definer` with a fixed `search_path`. | OK |
| Future tables | Supabase gives anon/authenticated full rights on **new** `public` tables by default; 0001 only revoked existing ones. | **Fixed:** `0003_lock_default_privileges.sql` |
| Reward transactions | Row lock (`for update`) is taken before the `request_log` lookup; save, rewards, mastery and log commit in one transaction; any error rolls everything back. Unit-tested with 10 concurrent duplicates. | OK |
| Request size | `req.json()` read the whole body before `parseRequest` limits applied. | **Fixed:** body > 8000 chars → 413 |
| Answer keys | Served only after an answer; production bank = approved/published; `ALLOW_REVIEW_QUESTIONS` must stay unset in production. | OK (dev secret is set) |
| CORS | `ALLOWED_ORIGIN` defaults to `*`. Bearer tokens (not cookies) are used, so this is not a CSRF risk, but set it to the real site in production. | Open (production) |
| Teacher role | Teachers can read `question_versions` (answer keys). Role changes need the service role. | OK; keep teacher accounts staff-only |

## 5. What the project owner must do to go live (dev)

The owner must do these steps, because they need their own login, database password and keys:

1. Install the Supabase CLI: `brew install supabase/tap/supabase`. Then run `supabase login`, which opens the browser.
2. From the repo root, run `supabase link --project-ref torkznvzanwoniqxuttc` (it asks for the database password). If it complains about a missing config, run `supabase init` first.
3. Apply the schema and seed: `supabase db push`.
4. Deploy the function:
   ```
   npm run supabase:build
   supabase functions deploy game
   supabase secrets set ALLOW_REVIEW_QUESTIONS=true
   ```
   The secret is for dev only; leave it unset in production.
5. Dashboard → Authentication → Providers → Email: enabled. For quick dev testing you may turn off "Confirm email".
6. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_ANON_KEY` (Dashboard → Project Settings → API → anon public key). Never use the service_role key in the client.
7. Create two test accounts, then run:
   ```
   TEST_A_EMAIL=… TEST_A_PASSWORD=… TEST_B_EMAIL=… TEST_B_PASSWORD=… npm run test:online
   ```
8. `npm run dev` now runs the online build. Sign in on two browsers and confirm the same character shows up on both.

## 6. Not done / open

- Real-backend verification (§5 step 7), the security review (§4), and local-save import.
- Child accounts by email/password are a dev stopgap. Production should use teacher-issued class accounts or codes (M6).
- `e2e` runs offline only; an online e2e needs a deployed backend and test accounts.
