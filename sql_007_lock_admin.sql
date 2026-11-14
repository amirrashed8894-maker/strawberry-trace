-- v1.2.0 (14/11/2026): lock the admin side again.
-- Public (anon): only st_lookup_carton and st_serial_status (customer page + photo/OCR lookup).
-- Admin RPCs: SECURITY DEFINER wrappers that require st_private.is_admin()
-- (Supabase Auth user listed in public.st_admins, or app_metadata.role = 'admin'),
-- executable by "authenticated" only. st_private.* admin/helper functions are no
-- longer executable by any client role; only the wrappers (running as owner) reach them.
-- No data rows are touched.

-- 1) Who am I: used by the app after sign-in.
create or replace function public.st_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select st_private.is_admin(); $$;
revoke all on function public.st_is_admin() from public, anon;
grant execute on function public.st_is_admin() to authenticated;

-- 2) Guarded admin wrappers (same names/signatures as before; body now checks is_admin).
create or replace function public.st_add_party(p_kind text, p_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.add_party(p_kind, p_name);
end;
$$;
revoke all on function public.st_add_party(p_kind text, p_name text) from public, anon;
grant execute on function public.st_add_party(p_kind text, p_name text) to authenticated, service_role;

create or replace function public.st_allocate_lot(p_lot_id uuid, p_container_id uuid, p_carton_count integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.allocate_lot(p_lot_id, p_container_id, p_carton_count);
end;
$$;
revoke all on function public.st_allocate_lot(p_lot_id uuid, p_container_id uuid, p_carton_count integer) from public, anon;
grant execute on function public.st_allocate_lot(p_lot_id uuid, p_container_id uuid, p_carton_count integer) to authenticated, service_role;

create or replace function public.st_assign_lot_to_container(p_lot_id uuid, p_container_id uuid, p_only_unassigned boolean DEFAULT false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.assign_lot_to_container(p_lot_id, p_container_id, p_only_unassigned);
end;
$$;
revoke all on function public.st_assign_lot_to_container(p_lot_id uuid, p_container_id uuid, p_only_unassigned boolean) from public, anon;
grant execute on function public.st_assign_lot_to_container(p_lot_id uuid, p_container_id uuid, p_only_unassigned boolean) to authenticated, service_role;

create or replace function public.st_assign_range(p_from text, p_to text, p_lot_id uuid DEFAULT NULL::uuid, p_container_id uuid DEFAULT NULL::uuid, p_only_free boolean DEFAULT false, p_carton_weight numeric DEFAULT NULL::numeric)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.assign_range(p_from, p_to, p_lot_id, p_container_id, p_only_free, p_carton_weight);
end;
$$;
revoke all on function public.st_assign_range(p_from text, p_to text, p_lot_id uuid, p_container_id uuid, p_only_free boolean, p_carton_weight numeric) from public, anon;
grant execute on function public.st_assign_range(p_from text, p_to text, p_lot_id uuid, p_container_id uuid, p_only_free boolean, p_carton_weight numeric) to authenticated, service_role;

create or replace function public.st_batch_cartons(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.batch_cartons(p_batch_id);
end;
$$;
revoke all on function public.st_batch_cartons(p_batch_id uuid) from public, anon;
grant execute on function public.st_batch_cartons(p_batch_id uuid) to authenticated, service_role;

create or replace function public.st_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.dashboard();
end;
$$;
revoke all on function public.st_dashboard() from public, anon;
grant execute on function public.st_dashboard() to authenticated, service_role;

create or replace function public.st_generate_batch(p_count integer, p_label_size text DEFAULT '50x30'::text, p_label_config jsonb DEFAULT '{}'::jsonb, p_notes text DEFAULT NULL::text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.generate_batch(p_count, p_label_size, p_label_config, p_notes);
end;
$$;
revoke all on function public.st_generate_batch(p_count integer, p_label_size text, p_label_config jsonb, p_notes text) from public, anon;
grant execute on function public.st_generate_batch(p_count integer, p_label_size text, p_label_config jsonb, p_notes text) to authenticated, service_role;

create or replace function public.st_get_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.get_settings();
end;
$$;
revoke all on function public.st_get_settings() from public, anon;
grant execute on function public.st_get_settings() to authenticated, service_role;

create or replace function public.st_list_batches()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.list_batches();
end;
$$;
revoke all on function public.st_list_batches() from public, anon;
grant execute on function public.st_list_batches() to authenticated, service_role;

create or replace function public.st_list_containers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.list_containers();
end;
$$;
revoke all on function public.st_list_containers() from public, anon;
grant execute on function public.st_list_containers() to authenticated, service_role;

create or replace function public.st_list_lots()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.list_lots();
end;
$$;
revoke all on function public.st_list_lots() from public, anon;
grant execute on function public.st_list_lots() to authenticated, service_role;

create or replace function public.st_list_parties(p_kind text DEFAULT NULL::text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.list_parties(p_kind);
end;
$$;
revoke all on function public.st_list_parties(p_kind text) from public, anon;
grant execute on function public.st_list_parties(p_kind text) to authenticated, service_role;

create or replace function public.st_lot_sticker_stats(p_lot_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.lot_sticker_stats(p_lot_id);
end;
$$;
revoke all on function public.st_lot_sticker_stats(p_lot_id uuid) from public, anon;
grant execute on function public.st_lot_sticker_stats(p_lot_id uuid) to authenticated, service_role;

create or replace function public.st_lot_trace(p_lot_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.lot_trace(p_lot_id);
end;
$$;
revoke all on function public.st_lot_trace(p_lot_id uuid) from public, anon;
grant execute on function public.st_lot_trace(p_lot_id uuid) to authenticated, service_role;

create or replace function public.st_mark_batch_printed(p_batch_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.mark_batch_printed(p_batch_id);
end;
$$;
revoke all on function public.st_mark_batch_printed(p_batch_id uuid) from public, anon;
grant execute on function public.st_mark_batch_printed(p_batch_id uuid) to authenticated, service_role;

create or replace function public.st_mark_lot_printed(p_lot_id uuid, p_add integer, p_label_size text DEFAULT NULL::text, p_label_config jsonb DEFAULT '{}'::jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.mark_lot_printed(p_lot_id, p_add, p_label_size, p_label_config);
end;
$$;
revoke all on function public.st_mark_lot_printed(p_lot_id uuid, p_add integer, p_label_size text, p_label_config jsonb) from public, anon;
grant execute on function public.st_mark_lot_printed(p_lot_id uuid, p_add integer, p_label_size text, p_label_config jsonb) to authenticated, service_role;

create or replace function public.st_next_lot_number()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.next_lot_number();
end;
$$;
revoke all on function public.st_next_lot_number() from public, anon;
grant execute on function public.st_next_lot_number() to authenticated, service_role;

create or replace function public.st_save_container(p_row jsonb, p_id uuid DEFAULT NULL::uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.save_container(p_row, p_id);
end;
$$;
revoke all on function public.st_save_container(p_row jsonb, p_id uuid) from public, anon;
grant execute on function public.st_save_container(p_row jsonb, p_id uuid) to authenticated, service_role;

create or replace function public.st_save_lot(p_row jsonb, p_id uuid DEFAULT NULL::uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.save_lot(p_row, p_id);
end;
$$;
revoke all on function public.st_save_lot(p_row jsonb, p_id uuid) from public, anon;
grant execute on function public.st_save_lot(p_row jsonb, p_id uuid) to authenticated, service_role;

create or replace function public.st_save_settings(p_patch jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.save_settings(p_patch);
end;
$$;
revoke all on function public.st_save_settings(p_patch jsonb) from public, anon;
grant execute on function public.st_save_settings(p_patch jsonb) to authenticated, service_role;

create or replace function public.st_search_all(p_q text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.search_all(p_q);
end;
$$;
revoke all on function public.st_search_all(p_q text) from public, anon;
grant execute on function public.st_search_all(p_q text) to authenticated, service_role;

create or replace function public.st_search_cartons(p_q text DEFAULT NULL::text, p_lot_id uuid DEFAULT NULL::uuid, p_container_id uuid DEFAULT NULL::uuid, p_supplier text DEFAULT NULL::text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.search_cartons(p_q, p_lot_id, p_container_id, p_supplier);
end;
$$;
revoke all on function public.st_search_cartons(p_q text, p_lot_id uuid, p_container_id uuid, p_supplier text) from public, anon;
grant execute on function public.st_search_cartons(p_q text, p_lot_id uuid, p_container_id uuid, p_supplier text) to authenticated, service_role;

create or replace function public.st_unassign_range(p_from text, p_to text, p_what text DEFAULT 'both'::text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501', hint = 'admin sign-in required';
  end if;
  return st_private.unassign_range(p_from, p_to, p_what);
end;
$$;
revoke all on function public.st_unassign_range(p_from text, p_to text, p_what text) from public, anon;
grant execute on function public.st_unassign_range(p_from text, p_to text, p_what text) to authenticated, service_role;

-- 3) st_private: no client role may call anything except the two public lookups.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'st_private'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.fn);
    if r.proname in ('lookup_carton', 'serial_status') then
      execute format('grant execute on function %s to anon, authenticated', r.fn);
    end if;
  end loop;
end $$;

-- 4) Public lookups stay open (invoker wrappers -> SECURITY DEFINER private functions).
revoke all on function public.st_lookup_carton(text) from public;
revoke all on function public.st_serial_status(text) from public;
grant execute on function public.st_lookup_carton(text) to anon, authenticated;
grant execute on function public.st_serial_status(text) to anon, authenticated;

-- 5) New functions in st_private are not executable by clients unless granted explicitly.
alter default privileges in schema st_private revoke execute on functions from public, anon, authenticated;
