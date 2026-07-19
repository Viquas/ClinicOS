\set ON_ERROR_STOP on
\pset pager off

-- Supabase grants these by default via ALTER DEFAULT PRIVILEGES in public.
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;

--------------------------------------------------------------------------------
-- Fixtures (as postgres, which owns the tables; FORCE RLS is bypassed only by
-- roles with BYPASSRLS, so we insert before enabling any session claims).
--------------------------------------------------------------------------------

alter table public.clinics disable row level security;
insert into public.clinics (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Clinic A'),
  ('22222222-2222-2222-2222-222222222222', 'Clinic B');
alter table public.clinics enable row level security;

alter table public.patients disable row level security;
insert into public.patients (id, clinic_id, name, phone, sex) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Patient A1', '9990001111', 'male'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Patient A2', '9990002222', 'female'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Patient B1', '9990003333', 'male');
alter table public.patients enable row level security;

alter table public.audit_log disable row level security;
insert into public.audit_log (id, clinic_id, action, entity_table) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'dispense', 'batches');
alter table public.audit_log enable row level security;

--------------------------------------------------------------------------------
-- Helper: assert
--------------------------------------------------------------------------------

create or replace function pg_temp.assert(label text, actual anyelement, expected anyelement)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL: % — expected %, got %', label, expected, actual;
  end if;
  raise notice 'pass: %', label;
end $$;

--------------------------------------------------------------------------------
-- 1. Tenant isolation on SELECT
--------------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"clinic_id":"11111111-1111-1111-1111-111111111111","staff_id":"dddddddd-0000-0000-0000-000000000001","staff_roles":["front_desk"]}';

select pg_temp.assert(
  'clinic A sees only its own 2 patients',
  (select count(*)::int from public.patients),
  2
);

select pg_temp.assert(
  'clinic A cannot see clinic B patient by direct id',
  (select count(*)::int from public.patients where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  0
);

select pg_temp.assert(
  'clinic A sees only its own clinic row',
  (select count(*)::int from public.clinics),
  1
);

--------------------------------------------------------------------------------
-- 2. Cross-tenant write is blocked
--------------------------------------------------------------------------------

do $$
begin
  insert into public.patients (clinic_id, name, phone, sex)
  values ('22222222-2222-2222-2222-222222222222', 'Smuggled', '9990009999', 'male');
  raise exception 'FAIL: cross-tenant insert was permitted';
exception
  when insufficient_privilege then
    raise notice 'pass: cross-tenant insert blocked by WITH CHECK';
end $$;

--------------------------------------------------------------------------------
-- 3. Medical records cannot be deleted (§9.6)
--------------------------------------------------------------------------------

do $$
declare
  deleted int;
begin
  delete from public.patients where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics deleted = row_count;
  if deleted <> 0 then
    raise exception 'FAIL: patient delete removed % row(s)', deleted;
  end if;
  raise notice 'pass: patient DELETE affects no rows';
end $$;

--------------------------------------------------------------------------------
-- 4. Audit log is append-only (§7.8)
--------------------------------------------------------------------------------

do $$
declare
  affected int;
begin
  update public.audit_log set action = 'tampered';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'FAIL: audit_log update affected % row(s)', affected;
  end if;

  delete from public.audit_log;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'FAIL: audit_log delete affected % row(s)', affected;
  end if;

  raise notice 'pass: audit_log is append-only';
end $$;

--------------------------------------------------------------------------------
-- 5. Pharmacy cannot author a prescription (§7.8)
--------------------------------------------------------------------------------

reset role;
alter table public.doctors disable row level security;
alter table public.staff disable row level security;
alter table public.visits disable row level security;
insert into public.staff (id, clinic_id, name, phone, roles) values
  ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Dr A', '9991110000', '{doctor}');
insert into public.doctors (id, clinic_id, staff_id, specialty) values
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'dddddddd-0000-0000-0000-000000000001', 'pediatrics');
insert into public.visits (id, clinic_id, patient_id, doctor_id, visit_date) values
  ('ffffffff-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', current_date);
alter table public.doctors enable row level security;
alter table public.staff enable row level security;
alter table public.visits enable row level security;

set role authenticated;
set request.jwt.claims = '{"clinic_id":"11111111-1111-1111-1111-111111111111","staff_id":"dddddddd-0000-0000-0000-000000000002","staff_roles":["pharmacy"]}';

do $$
begin
  insert into public.prescriptions (clinic_id, visit_id, doctor_id, issued_snapshot)
  values ('11111111-1111-1111-1111-111111111111', 'ffffffff-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', '{}');
  raise exception 'FAIL: pharmacy was permitted to author a prescription';
exception
  when insufficient_privilege then
    raise notice 'pass: pharmacy blocked from writing prescriptions';
end $$;

--------------------------------------------------------------------------------
-- 6. Doctor CAN author a prescription (the guard is not just blanket-deny)
--------------------------------------------------------------------------------

set request.jwt.claims = '{"clinic_id":"11111111-1111-1111-1111-111111111111","staff_id":"dddddddd-0000-0000-0000-000000000001","staff_roles":["doctor"]}';

insert into public.prescriptions (clinic_id, visit_id, doctor_id, issued_snapshot)
values ('11111111-1111-1111-1111-111111111111', 'ffffffff-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', '{}');

select pg_temp.assert('doctor can author a prescription', (select count(*)::int from public.prescriptions), 1);

--------------------------------------------------------------------------------
-- 7. Owner passes every role check (wildcard)
--------------------------------------------------------------------------------

set request.jwt.claims = '{"clinic_id":"11111111-1111-1111-1111-111111111111","staff_id":"dddddddd-0000-0000-0000-000000000003","staff_roles":["owner"]}';

select pg_temp.assert('owner has_role(pharmacy)', public.has_role('pharmacy'), true);
select pg_temp.assert('owner has_role(doctor)', public.has_role('doctor'), true);

--------------------------------------------------------------------------------
-- 8. A token with no clinic_id claim sees nothing
--------------------------------------------------------------------------------

set request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999"}';

select pg_temp.assert('no clinic claim sees no patients', (select count(*)::int from public.patients), 0);
select pg_temp.assert('no clinic claim sees no clinics', (select count(*)::int from public.clinics), 0);
select pg_temp.assert('current_clinic_id is null', public.current_clinic_id(), null::uuid);

--------------------------------------------------------------------------------
-- 9. Clinic B sees its own side of the wall
--------------------------------------------------------------------------------

set request.jwt.claims = '{"clinic_id":"22222222-2222-2222-2222-222222222222","staff_id":"dddddddd-0000-0000-0000-000000000004","staff_roles":["front_desk"]}';

select pg_temp.assert('clinic B sees only its own 1 patient', (select count(*)::int from public.patients), 1);
select pg_temp.assert('clinic B sees no prescriptions from clinic A', (select count(*)::int from public.prescriptions), 0);

reset role;
\echo '--- ALL RLS ASSERTIONS PASSED ---'
