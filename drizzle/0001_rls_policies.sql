-- ClinicOS tenant isolation — PRD §10.
--
-- Every tenant table carries clinic_id and RLS compares it against a claim in
-- the caller's JWT. The claim is minted by the custom access token hook below,
-- so a client cannot forge it: it is signed into the token at login and the
-- database never trusts anything the client sends in the request body.

--------------------------------------------------------------------------------
-- Claim accessors
--------------------------------------------------------------------------------

-- STABLE, not IMMUTABLE: the claim is fixed within a transaction but not
-- across them. STABLE lets the planner call this once per query rather than
-- once per row, which matters on the queue and dispensing paths.
create or replace function public.current_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'clinic_id',
    ''
  )::uuid;
$$;

create or replace function public.current_staff_roles()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    array(
      select jsonb_array_elements_text(
        current_setting('request.jwt.claims', true)::jsonb -> 'staff_roles'
      )
    ),
    array[]::text[]
  );
$$;

create or replace function public.has_role(required text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Owner passes every role check. Role stacking (§7.12) means one login can
  -- hold several roles at once, so this is array membership, not equality
  -- against a single role column.
  select 'owner' = any(public.current_staff_roles())
      or required = any(public.current_staff_roles());
$$;

--------------------------------------------------------------------------------
-- Custom access token hook
--
-- Register in Supabase: Auth > Hooks > "Customize Access Token (JWT) Claims".
-- Injects clinic_id and staff_roles so RLS never has to join back to `staff`
-- on every row check.
--------------------------------------------------------------------------------

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  staff_row record;
begin
  select s.clinic_id, s.id, s.roles
    into staff_row
    from public.staff s
   where s.auth_user_id = (event ->> 'user_id')::uuid
     and s.is_active
     and s.archived_at is null
   limit 1;

  claims := coalesce(event -> 'claims', '{}'::jsonb);

  if staff_row.clinic_id is not null then
    claims := jsonb_set(claims, '{clinic_id}', to_jsonb(staff_row.clinic_id));
    claims := jsonb_set(claims, '{staff_id}', to_jsonb(staff_row.id));
    claims := jsonb_set(claims, '{staff_roles}', to_jsonb(staff_row.roles));
  else
    -- No active staff record: the token carries no clinic, so every policy
    -- below evaluates false and the user sees nothing. Deactivating a staff
    -- member is therefore an effective revocation at the next token refresh.
    claims := claims - 'clinic_id' - 'staff_id' - 'staff_roles';
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
grant all on table public.staff to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

--------------------------------------------------------------------------------
-- Tenant isolation
--------------------------------------------------------------------------------

-- Applied uniformly in a loop so the list is auditable at a glance, and so a
-- new table added without a policy fails closed: RLS enabled with no policy
-- denies everything.
--
-- FORCE applies RLS to the table owner too, so a future migration that needs
-- to backfill data must do so before this runs, or explicitly bypass. The
-- Supabase `service_role` has BYPASSRLS and is unaffected.
do $$
declare
  t text;
  tenant_tables text[] := array[
    'staff', 'doctors',
    'patients', 'patient_files',
    'visits', 'tokens', 'vitals', 'consultations',
    'prescriptions', 'prescription_items',
    'inventory_items', 'batches', 'stock_movements', 'schedule_h1_register',
    'bills', 'bill_items', 'payments',
    'procedures', 'procedure_tasks',
    'mr_companies', 'medical_reps', 'mr_visits',
    'attendance', 'audit_log', 'wa_messages'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    execute format($f$
      create policy %I on public.%I
        for all
        to authenticated
        using (clinic_id = public.current_clinic_id())
        with check (clinic_id = public.current_clinic_id())
    $f$, t || '_tenant_isolation', t);
  end loop;
end $$;

-- `clinics` is keyed by id rather than clinic_id, so it needs its own policy.
alter table public.clinics enable row level security;
alter table public.clinics force row level security;

create policy clinics_tenant_isolation on public.clinics
  for select
  to authenticated
  using (id = public.current_clinic_id());

-- Only the owner edits clinic profile and settings (§7.8).
create policy clinics_owner_writes on public.clinics
  for update
  to authenticated
  using (id = public.current_clinic_id() and public.has_role('owner'))
  with check (id = public.current_clinic_id() and public.has_role('owner'));

--------------------------------------------------------------------------------
-- Role guards
--
-- RESTRICTIVE policies AND with the isolation policy above, so these narrow
-- access rather than granting it. Only rules that must hold even when
-- application code is wrong belong here; finer permissions stay in the app.
--------------------------------------------------------------------------------

-- Pharmacy dispenses against a prescription but can never author or alter one.
create policy prescriptions_clinical_writes on public.prescriptions
  as restrictive
  for insert
  to authenticated
  with check (public.has_role('doctor'));

create policy prescriptions_no_edits on public.prescriptions
  as restrictive
  for update
  to authenticated
  using (public.has_role('doctor'));

create policy prescription_items_clinical_writes on public.prescription_items
  as restrictive
  for insert
  to authenticated
  with check (public.has_role('doctor'));

create policy prescription_items_no_edits on public.prescription_items
  as restrictive
  for update
  to authenticated
  using (public.has_role('doctor'));

-- The audit log and the H1 register are legal records: append-only, and not
-- rewritable through the API by anyone, owner included (§7.8, §9.3).
create policy audit_log_append_only on public.audit_log
  as restrictive
  for update
  to authenticated
  using (false);

create policy audit_log_no_delete on public.audit_log
  as restrictive
  for delete
  to authenticated
  using (false);

create policy h1_register_append_only on public.schedule_h1_register
  as restrictive
  for update
  to authenticated
  using (false);

create policy h1_register_no_delete on public.schedule_h1_register
  as restrictive
  for delete
  to authenticated
  using (false);

-- Stock movements are the ledger that batch quantities must reconcile against.
create policy stock_movements_append_only on public.stock_movements
  as restrictive
  for update
  to authenticated
  using (false);

create policy stock_movements_no_delete on public.stock_movements
  as restrictive
  for delete
  to authenticated
  using (false);

-- Medical records are archived, never deleted (§9.6). The archived_at column
-- is the deletion mechanism; DELETE is closed off at the database so that no
-- application bug can destroy a retained record.
create policy visits_no_delete on public.visits
  as restrictive
  for delete
  to authenticated
  using (false);

create policy patients_no_delete on public.patients
  as restrictive
  for delete
  to authenticated
  using (false);

create policy consultations_no_delete on public.consultations
  as restrictive
  for delete
  to authenticated
  using (false);

create policy vitals_no_delete on public.vitals
  as restrictive
  for delete
  to authenticated
  using (false);

create policy prescriptions_no_delete on public.prescriptions
  as restrictive
  for delete
  to authenticated
  using (false);

create policy bills_no_delete on public.bills
  as restrictive
  for delete
  to authenticated
  using (false);
