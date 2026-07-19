-- record_revisions is a new table added after the main RLS migration
-- (0001_rls_policies.sql) — it needs the same tenant isolation every other
-- clinic table gets, plus the append-only guarantee already given to
-- audit_log, since a revision that could itself be edited or deleted would
-- defeat the entire point of keeping one.

alter table public.record_revisions enable row level security;
alter table public.record_revisions force row level security;

create policy record_revisions_tenant_isolation on public.record_revisions
  for all
  to authenticated
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

create policy record_revisions_append_only on public.record_revisions
  as restrictive
  for update
  to authenticated
  using (false);

create policy record_revisions_no_delete on public.record_revisions
  as restrictive
  for delete
  to authenticated
  using (false);
