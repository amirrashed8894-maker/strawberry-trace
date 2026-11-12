-- Carton traceability for Al-Rashed Trading Co.
-- Prefixed st_* / schema st_private so existing erp_* objects are untouched.

create schema if not exists st_private;
revoke all on schema st_private from public;
grant usage on schema st_private to anon, authenticated;

create table if not exists public.st_settings (
  id int primary key default 1 check (id = 1),
  company_name text not null default 'شركة الراشد للتجارة',
  company_name_en text not null default 'Al-Rashed Trading Co.',
  serial_prefix text not null default 'RS',
  public_base_url text not null default 'https://strawberry-trace.onrender.com',
  public_fields jsonb not null default '{
    "supplier": true,
    "packing_factory": true,
    "container_number": true,
    "loading_date": true,
    "variety": true,
    "size_grade": true,
    "packing_date": true,
    "production_date": true,
    "lot_number": true,
    "customer": true,
    "destination": true,
    "carton_net_weight": true,
    "receipt_date": false
  }'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.st_settings (id) values (1)
  on conflict (id) do nothing;

create table if not exists public.st_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.st_parties (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('supplier','customer','factory')),
  name text not null,
  created_at timestamptz not null default now(),
  unique (kind, name)
);

create table if not exists public.st_seq (
  name text primary key,
  value int not null
);
insert into public.st_seq(name, value) values ('carton', 0)
  on conflict (name) do nothing;

create table if not exists public.st_batches (
  id uuid primary key default gen_random_uuid(),
  batch_code text unique not null,
  prefix text not null default 'RS',
  start_seq int not null,
  end_seq int not null,
  count int not null,
  label_size text not null,
  label_config jsonb not null default '{}'::jsonb,
  notes text,
  printed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.st_lots (
  id uuid primary key default gen_random_uuid(),
  lot_number text unique not null,
  supplier text,
  receipt_date date,
  weight_kg numeric,
  packing_factory text,
  packing_date date,
  production_date date,
  variety text,
  size_grade text,
  carton_weight_kg numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.st_containers (
  id uuid primary key default gen_random_uuid(),
  container_number text unique not null,
  loading_date date,
  customer text,
  destination text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.st_cartons (
  id uuid primary key default gen_random_uuid(),
  serial text unique not null,
  seq int unique not null,
  check_code text not null,
  batch_id uuid references public.st_batches(id),
  lot_id uuid references public.st_lots(id),
  container_id uuid references public.st_containers(id),
  carton_net_weight_kg numeric,
  assigned_lot_at timestamptz,
  assigned_container_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists st_cartons_lot_idx on public.st_cartons(lot_id);
create index if not exists st_cartons_container_idx on public.st_cartons(container_id);
create index if not exists st_cartons_serial_upper_idx on public.st_cartons (upper(serial));

create table if not exists public.st_scan_logs (
  id uuid primary key default gen_random_uuid(),
  carton_id uuid references public.st_cartons(id),
  serial_attempt text,
  scanned_at timestamptz not null default now(),
  is_admin boolean not null default false,
  user_agent text
);
create index if not exists st_scan_logs_carton_idx on public.st_scan_logs(carton_id, scanned_at desc);
create index if not exists st_scan_logs_time_idx on public.st_scan_logs(scanned_at desc);

alter table public.st_settings enable row level security;
alter table public.st_admins enable row level security;
alter table public.st_parties enable row level security;
alter table public.st_seq enable row level security;
alter table public.st_batches enable row level security;
alter table public.st_lots enable row level security;
alter table public.st_containers enable row level security;
alter table public.st_cartons enable row level security;
alter table public.st_scan_logs enable row level security;

revoke all on table
  public.st_settings, public.st_admins, public.st_parties, public.st_seq,
  public.st_batches, public.st_lots, public.st_containers, public.st_cartons,
  public.st_scan_logs
from anon, public;

grant select, insert, update, delete on table
  public.st_settings, public.st_admins, public.st_parties, public.st_seq,
  public.st_batches, public.st_lots, public.st_containers, public.st_cartons,
  public.st_scan_logs
to authenticated;

create or replace function st_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
      or exists (select 1 from public.st_admins a where a.user_id = auth.uid());
$$;

revoke all on function st_private.is_admin() from public, anon, authenticated;

drop policy if exists st_settings_admin on public.st_settings;
drop policy if exists st_admins_admin on public.st_admins;
drop policy if exists st_parties_admin on public.st_parties;
drop policy if exists st_seq_admin on public.st_seq;
drop policy if exists st_batches_admin on public.st_batches;
drop policy if exists st_lots_admin on public.st_lots;
drop policy if exists st_containers_admin on public.st_containers;
drop policy if exists st_cartons_admin on public.st_cartons;
drop policy if exists st_scan_logs_admin on public.st_scan_logs;

create policy st_settings_admin on public.st_settings for all to authenticated
  using (st_private.is_admin()) with check (st_private.is_admin());
create policy st_admins_admin on public.st_admins for all to authenticated
  using (st_private.is_admin()) with check (st_private.is_admin());
create policy st_parties_admin on public.st_parties for all to authenticated
  using (st_private.is_admin()) with check (st_private.is_admin());
create policy st_seq_admin on public.st_seq for all to authenticated
  using (st_private.is_admin()) with check (st_private.is_admin());
create policy st_batches_admin on public.st_batches for all to authenticated
  using (st_private.is_admin()) with check (st_private.is_admin());
create policy st_lots_admin on public.st_lots for all to authenticated
  using (st_private.is_admin()) with check (st_private.is_admin());
create policy st_containers_admin on public.st_containers for all to authenticated
  using (st_private.is_admin()) with check (st_private.is_admin());
create policy st_cartons_admin on public.st_cartons for all to authenticated
  using (st_private.is_admin()) with check (st_private.is_admin());
create policy st_scan_logs_admin on public.st_scan_logs for all to authenticated
  using (st_private.is_admin()) with check (st_private.is_admin());

create or replace function st_private.normalize_serial(p_serial text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  s text;
  m text[];
begin
  if p_serial is null then
    return null;
  end if;
  s := upper(trim(p_serial));
  s := replace(replace(s, ' ', ''), '_', '');
  if s ~ '^RS-[0-9]{6}-[A-HJ-NP-Z2-9]{4}$' then
    return s;
  end if;
  m := regexp_match(s, 'RS-?([0-9]{6})-?([A-HJ-NP-Z2-9]{4})$');
  if m is not null then
    return 'RS-' || m[1] || '-' || m[2];
  end if;
  return s;
end;
$$;

create or replace function st_private.random_check()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
  out text := '';
  b bytea;
begin
  b := extensions.gen_random_bytes(4);
  for i in 0..3 loop
    out := out || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return out;
end;
$$;

create or replace function st_private.lookup_carton(p_serial text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_serial text;
  v_admin boolean;
  v_carton public.st_cartons%rowtype;
  v_lot public.st_lots%rowtype;
  v_con public.st_containers%rowtype;
  v_fields jsonb;
  v_ua text;
  v_out jsonb;
  v_hdr text;
begin
  v_serial := st_private.normalize_serial(p_serial);
  v_admin := st_private.is_admin();

  v_ua := null;
  begin
    v_hdr := current_setting('request.headers', true);
    if v_hdr is not null and left(trim(v_hdr), 1) = '{' then
      v_ua := left(coalesce(v_hdr::json->>'user-agent', ''), 300);
    end if;
  exception when others then
    v_ua := null;
  end;

  if v_serial is null or length(v_serial) < 8 then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into v_carton from public.st_cartons c where c.serial = v_serial;
  if not found then
    insert into public.st_scan_logs(carton_id, serial_attempt, is_admin, user_agent)
      values (null, left(v_serial, 40), v_admin, v_ua);
    return jsonb_build_object('status', 'unknown', 'serial', v_serial);
  end if;

  insert into public.st_scan_logs(carton_id, serial_attempt, is_admin, user_agent)
    values (v_carton.id, v_serial, v_admin, v_ua);

  if v_carton.lot_id is not null then
    select * into v_lot from public.st_lots l where l.id = v_carton.lot_id;
  end if;
  if v_carton.container_id is not null then
    select * into v_con from public.st_containers x where x.id = v_carton.container_id;
  end if;

  if v_carton.lot_id is null and v_carton.container_id is null then
    v_out := jsonb_build_object('status', 'unassigned', 'serial', v_serial);
    if v_admin then
      v_out := v_out || jsonb_build_object(
        'batch_id', v_carton.batch_id,
        'seq', v_carton.seq,
        'created_at', v_carton.created_at
      );
    end if;
    return v_out;
  end if;

  select public_fields into v_fields from public.st_settings where id = 1;

  v_out := jsonb_strip_nulls(jsonb_build_object(
    'status', 'ok',
    'serial', v_serial,
    'supplier', v_lot.supplier,
    'packing_factory', v_lot.packing_factory,
    'container_number', v_con.container_number,
    'loading_date', v_con.loading_date,
    'variety', v_lot.variety,
    'size_grade', v_lot.size_grade,
    'packing_date', v_lot.packing_date,
    'production_date', coalesce(v_lot.production_date, v_lot.packing_date),
    'lot_number', v_lot.lot_number,
    'customer', v_con.customer,
    'destination', v_con.destination,
    'carton_net_weight', coalesce(v_carton.carton_net_weight_kg, v_lot.carton_weight_kg),
    'receipt_date', v_lot.receipt_date
  ));

  if not v_admin then
    v_out := (
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
      from jsonb_each(v_out) e
      where e.key in ('status', 'serial')
         or coalesce((v_fields->>e.key)::boolean, false)
    );
  else
    v_out := v_out || jsonb_build_object(
      'batch_id', v_carton.batch_id,
      'seq', v_carton.seq,
      'lot_id', v_carton.lot_id,
      'container_id', v_carton.container_id,
      'scan_count', (select count(*)::int from public.st_scan_logs sl where sl.carton_id = v_carton.id),
      'scan_history', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'scanned_at', t.scanned_at,
                 'is_admin', t.is_admin
               ) order by t.scanned_at desc), '[]'::jsonb)
        from (
          select sl.scanned_at, sl.is_admin
          from public.st_scan_logs sl
          where sl.carton_id = v_carton.id
          order by sl.scanned_at desc
          limit 50
        ) t
      )
    );
  end if;

  return v_out;
end;
$$;

create or replace function public.st_lookup_carton(p_serial text)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select st_private.lookup_carton(p_serial);
$$;

revoke all on function st_private.lookup_carton(text) from public;
revoke all on function public.st_lookup_carton(text) from public;
grant execute on function st_private.lookup_carton(text) to anon, authenticated;
grant execute on function public.st_lookup_carton(text) to anon, authenticated;

create or replace function st_private.generate_batch(
  p_count int,
  p_label_size text,
  p_label_config jsonb,
  p_notes text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start int;
  v_end int;
  v_prefix text;
  v_id uuid;
  v_code text;
  v_today text;
  v_first text;
  v_last text;
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_count is null or p_count < 1 or p_count > 10000 then
    raise exception 'عدد غير صالح. الحد الأقصى 10000 في الدفعة.';
  end if;

  select serial_prefix into v_prefix from public.st_settings where id = 1;
  v_prefix := coalesce(nullif(trim(v_prefix), ''), 'RS');

  update public.st_seq
    set value = value + p_count
    where name = 'carton'
    returning value - p_count + 1, value into v_start, v_end;

  if v_start is null then
    raise exception 'sequence missing';
  end if;

  v_id := gen_random_uuid();
  v_today := to_char((timezone('Africa/Cairo', now()))::date, 'YYMMDD');
  v_code := 'B-' || v_today || '-' || lpad(v_start::text, 6, '0');

  insert into public.st_batches(
    id, batch_code, prefix, start_seq, end_seq, count, label_size, label_config, notes, created_by
  ) values (
    v_id, v_code, v_prefix, v_start, v_end, p_count,
    coalesce(nullif(p_label_size, ''), '50x30'),
    coalesce(p_label_config, '{}'::jsonb),
    p_notes,
    auth.uid()
  );

  insert into public.st_cartons(serial, seq, check_code, batch_id)
  select
    v_prefix || '-' || lpad(gs.s::text, 6, '0') || '-' || gs.chk,
    gs.s,
    gs.chk,
    v_id
  from (
    select s, st_private.random_check() as chk
    from generate_series(v_start, v_end) as s
  ) gs;

  select serial into v_first from public.st_cartons where seq = v_start;
  select serial into v_last from public.st_cartons where seq = v_end;

  return jsonb_build_object(
    'batch_id', v_id,
    'batch_code', v_code,
    'start_seq', v_start,
    'end_seq', v_end,
    'count', p_count,
    'first_serial', v_first,
    'last_serial', v_last
  );
end;
$$;

create or replace function public.st_generate_batch(
  p_count int,
  p_label_size text default '50x30',
  p_label_config jsonb default '{}'::jsonb,
  p_notes text default null
) returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select st_private.generate_batch(p_count, p_label_size, p_label_config, p_notes);
$$;

create or replace function st_private.resolve_seq(p_serial text, out o_id uuid, out o_seq int, out o_serial text)
language plpgsql
stable
set search_path = ''
as $$
begin
  o_serial := st_private.normalize_serial(p_serial);
  select c.id, c.seq, c.serial into o_id, o_seq, o_serial
    from public.st_cartons c
    where c.serial = o_serial;
  if o_id is null then
    raise exception 'الرقم غير موجود: %', o_serial;
  end if;
end;
$$;

create or replace function st_private.assign_range(
  p_from text,
  p_to text,
  p_lot_id uuid,
  p_container_id uuid,
  p_only_free boolean,
  p_carton_weight numeric
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a_id uuid; a_seq int; a_ser text;
  b_id uuid; b_seq int; b_ser text;
  v_lo int; v_hi int;
  v_total int;
  v_conflict jsonb;
  v_updated int := 0;
  v_skipped int := 0;
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_lot_id is null and p_container_id is null and p_carton_weight is null then
    raise exception 'حدد لوت أو حاوية أو وزن.';
  end if;
  if p_lot_id is not null and not exists (select 1 from public.st_lots where id = p_lot_id) then
    raise exception 'اللوت غير موجود';
  end if;
  if p_container_id is not null and not exists (select 1 from public.st_containers where id = p_container_id) then
    raise exception 'الحاوية غير موجودة';
  end if;

  select * into a_id, a_seq, a_ser from st_private.resolve_seq(p_from);
  select * into b_id, b_seq, b_ser from st_private.resolve_seq(p_to);
  v_lo := least(a_seq, b_seq);
  v_hi := greatest(a_seq, b_seq);
  v_total := v_hi - v_lo + 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'serial', c.serial,
           'lot_id', c.lot_id,
           'container_id', c.container_id
         ) order by c.seq), '[]'::jsonb)
    into v_conflict
    from public.st_cartons c
    where c.seq between v_lo and v_hi
      and (
        (p_lot_id is not null and c.lot_id is not null and c.lot_id <> p_lot_id)
        or (p_container_id is not null and c.container_id is not null and c.container_id <> p_container_id)
      );

  if jsonb_array_length(v_conflict) > 0 and not coalesce(p_only_free, false) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'conflict',
      'total', v_total,
      'conflicts', v_conflict,
      'from_serial', case when a_seq <= b_seq then a_ser else b_ser end,
      'to_serial', case when a_seq <= b_seq then b_ser else a_ser end
    );
  end if;

  with upd as (
    update public.st_cartons c
       set lot_id = case
             when p_lot_id is null then c.lot_id
             when c.lot_id is not null and c.lot_id <> p_lot_id then c.lot_id
             else p_lot_id
           end,
           assigned_lot_at = case
             when p_lot_id is null then c.assigned_lot_at
             when c.lot_id is not null and c.lot_id <> p_lot_id then c.assigned_lot_at
             when c.lot_id is null then now()
             else c.assigned_lot_at
           end,
           container_id = case
             when p_container_id is null then c.container_id
             when c.container_id is not null and c.container_id <> p_container_id then c.container_id
             else p_container_id
           end,
           assigned_container_at = case
             when p_container_id is null then c.assigned_container_at
             when c.container_id is not null and c.container_id <> p_container_id then c.assigned_container_at
             when c.container_id is null then now()
             else c.assigned_container_at
           end,
           carton_net_weight_kg = case
             when p_carton_weight is null then c.carton_net_weight_kg
             when (c.lot_id is not null and c.lot_id <> p_lot_id and p_lot_id is not null)
               or (c.container_id is not null and c.container_id <> p_container_id and p_container_id is not null)
               then c.carton_net_weight_kg
             else p_carton_weight
           end
     where c.seq between v_lo and v_hi
       and (
         coalesce(p_only_free, false) = false
         or (
           (p_lot_id is null or c.lot_id is null or c.lot_id = p_lot_id)
           and (p_container_id is null or c.container_id is null or c.container_id = p_container_id)
         )
       )
    returning c.seq
  )
  select count(*)::int into v_updated from upd;

  v_skipped := v_total - v_updated;

  return jsonb_build_object(
    'ok', true,
    'total', v_total,
    'updated', v_updated,
    'skipped', v_skipped,
    'conflicts', coalesce(v_conflict, '[]'::jsonb),
    'from_serial', case when a_seq <= b_seq then a_ser else b_ser end,
    'to_serial', case when a_seq <= b_seq then b_ser else a_ser end
  );
end;
$$;

create or replace function public.st_assign_range(
  p_from text,
  p_to text,
  p_lot_id uuid default null,
  p_container_id uuid default null,
  p_only_free boolean default false,
  p_carton_weight numeric default null
) returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select st_private.assign_range(p_from, p_to, p_lot_id, p_container_id, p_only_free, p_carton_weight);
$$;

create or replace function st_private.unassign_range(
  p_from text,
  p_to text,
  p_what text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a_id uuid; a_seq int; a_ser text;
  b_id uuid; b_seq int; b_ser text;
  v_lo int; v_hi int;
  v_updated int;
  v_what text;
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_what := lower(coalesce(p_what, 'both'));
  if v_what not in ('lot', 'container', 'both') then
    raise exception 'قيمة إلغاء غير صالحة';
  end if;

  select * into a_id, a_seq, a_ser from st_private.resolve_seq(p_from);
  select * into b_id, b_seq, b_ser from st_private.resolve_seq(p_to);
  v_lo := least(a_seq, b_seq);
  v_hi := greatest(a_seq, b_seq);

  with upd as (
    update public.st_cartons c
       set lot_id = case when v_what in ('lot','both') then null else c.lot_id end,
           assigned_lot_at = case when v_what in ('lot','both') then null else c.assigned_lot_at end,
           container_id = case when v_what in ('container','both') then null else c.container_id end,
           assigned_container_at = case when v_what in ('container','both') then null else c.assigned_container_at end
     where c.seq between v_lo and v_hi
    returning c.seq
  )
  select count(*)::int into v_updated from upd;

  return jsonb_build_object(
    'ok', true,
    'updated', v_updated,
    'from_serial', case when a_seq <= b_seq then a_ser else b_ser end,
    'to_serial', case when a_seq <= b_seq then b_ser else a_ser end
  );
end;
$$;

create or replace function public.st_unassign_range(
  p_from text,
  p_to text,
  p_what text default 'both'
) returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select st_private.unassign_range(p_from, p_to, p_what);
$$;

create or replace function st_private.assign_lot_to_container(
  p_lot_id uuid,
  p_container_id uuid,
  p_only_unassigned boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated int;
  v_total int;
  v_conflict int;
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_lot_id is null or p_container_id is null then
    raise exception 'حدد اللوت والحاوية';
  end if;
  if not exists (select 1 from public.st_lots where id = p_lot_id) then
    raise exception 'اللوت غير موجود';
  end if;
  if not exists (select 1 from public.st_containers where id = p_container_id) then
    raise exception 'الحاوية غير موجودة';
  end if;

  select count(*)::int into v_total from public.st_cartons where lot_id = p_lot_id;
  select count(*)::int into v_conflict
    from public.st_cartons
    where lot_id = p_lot_id
      and container_id is not null
      and container_id <> p_container_id;

  if v_conflict > 0 and not coalesce(p_only_unassigned, false) then
    return jsonb_build_object('ok', false, 'reason', 'conflict', 'total', v_total, 'conflicts', v_conflict);
  end if;

  with upd as (
    update public.st_cartons
       set container_id = p_container_id,
           assigned_container_at = coalesce(assigned_container_at, now())
     where lot_id = p_lot_id
       and (container_id is null or container_id = p_container_id)
    returning seq
  )
  select count(*)::int into v_updated from upd;

  return jsonb_build_object('ok', true, 'total', v_total, 'updated', v_updated, 'skipped', v_total - v_updated);
end;
$$;

create or replace function public.st_assign_lot_to_container(
  p_lot_id uuid,
  p_container_id uuid,
  p_only_unassigned boolean default false
) returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select st_private.assign_lot_to_container(p_lot_id, p_container_id, p_only_unassigned);
$$;

create or replace function st_private.next_lot_number()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
  v_max int;
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_prefix := 'FS-' || to_char((timezone('Africa/Cairo', now()))::date, 'YYMM') || '-';
  select coalesce(max(substring(lot_number from length(v_prefix)+1)::int), 0)
    into v_max
    from public.st_lots
    where lot_number ~ ('^' || v_prefix || '[0-9]+$');
  return v_prefix || lpad((v_max + 1)::text, 2, '0');
end;
$$;

create or replace function public.st_next_lot_number()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select st_private.next_lot_number();
$$;

create or replace function st_private.mark_batch_printed(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not st_private.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.st_batches
     set printed_at = coalesce(printed_at, now()),
         label_config = label_config
   where id = p_batch_id;
  if not found then
    raise exception 'الدفعة غير موجودة';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.st_mark_batch_printed(p_batch_id uuid)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select st_private.mark_batch_printed(p_batch_id);
$$;

revoke all on function st_private.generate_batch(int, text, jsonb, text) from public;
revoke all on function public.st_generate_batch(int, text, jsonb, text) from public;
revoke all on function st_private.assign_range(text, text, uuid, uuid, boolean, numeric) from public;
revoke all on function public.st_assign_range(text, text, uuid, uuid, boolean, numeric) from public;
revoke all on function st_private.unassign_range(text, text, text) from public;
revoke all on function public.st_unassign_range(text, text, text) from public;
revoke all on function st_private.assign_lot_to_container(uuid, uuid, boolean) from public;
revoke all on function public.st_assign_lot_to_container(uuid, uuid, boolean) from public;
revoke all on function st_private.next_lot_number() from public;
revoke all on function public.st_next_lot_number() from public;
revoke all on function st_private.mark_batch_printed(uuid) from public;
revoke all on function public.st_mark_batch_printed(uuid) from public;

grant execute on function st_private.generate_batch(int, text, jsonb, text) to authenticated;
grant execute on function public.st_generate_batch(int, text, jsonb, text) to authenticated;
grant execute on function st_private.assign_range(text, text, uuid, uuid, boolean, numeric) to authenticated;
grant execute on function public.st_assign_range(text, text, uuid, uuid, boolean, numeric) to authenticated;
grant execute on function st_private.unassign_range(text, text, text) to authenticated;
grant execute on function public.st_unassign_range(text, text, text) to authenticated;
grant execute on function st_private.assign_lot_to_container(uuid, uuid, boolean) to authenticated;
grant execute on function public.st_assign_lot_to_container(uuid, uuid, boolean) to authenticated;
grant execute on function st_private.next_lot_number() to authenticated;
grant execute on function public.st_next_lot_number() to authenticated;
grant execute on function st_private.mark_batch_printed(uuid) to authenticated;
grant execute on function public.st_mark_batch_printed(uuid) to authenticated;

grant execute on function st_private.normalize_serial(text) to anon, authenticated;
grant execute on function st_private.resolve_seq(text) to authenticated;
