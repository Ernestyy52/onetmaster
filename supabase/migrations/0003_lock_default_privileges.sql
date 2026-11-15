-- Hardening from the M2 security review.
-- Supabase grants anon/authenticated full access to NEW tables in `public` by default. 0001 only
-- revoked rights on the tables that existed then, so a table added by a later migration would be
-- writable by clients unless that migration remembered to revoke. Remove the default instead:
-- every future table starts with no client access, and a migration must grant select explicitly.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- reward_events uses an identity column; clients never insert, so they need no sequence rights.
revoke all on all sequences in schema public from anon, authenticated;
