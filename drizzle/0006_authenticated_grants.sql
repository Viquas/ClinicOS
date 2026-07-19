-- Table access for the application role — PRD §10, prd-real-auth.md Phase A.
--
-- 0001 defined 19 RLS policies but never granted `authenticated` access to the
-- tables they protect, on the assumption (stated in drizzle/tests/rls.sql) that
-- "Supabase grants these by default via ALTER DEFAULT PRIVILEGES in public".
-- That is true of a real Supabase project and false of every other environment,
-- including this repo's local dev cluster. The RLS test suite papered over the
-- difference by issuing the grants itself, so the policies were only ever
-- exercised under conditions the application could not reproduce.
--
-- Granting explicitly here makes local dev match production, and makes the
-- grant reviewable in migration history rather than implied by a platform
-- default. On Supabase these are no-ops.
--
-- Note the division of labour: GRANT decides which tables the role may touch
-- at all; RLS decides which ROWS within them. Both are required — a role with
-- no grant gets "permission denied" regardless of policy, which is what the
-- first attempt at running the app as `authenticated` hit.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end
$$;

grant usage on schema public to authenticated;

grant select, insert, update, delete
  on all tables in schema public
  to authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- Tables added by later migrations must inherit the same access, or a new
-- table silently becomes unreachable to the application.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant usage, select on sequences to authenticated;
