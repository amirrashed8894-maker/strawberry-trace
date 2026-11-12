-- v1.1.0: one lot number per truck. Identical stickers, carton-count
-- allocations, spare stickers, public lot page. Legacy carton batches kept.

-- ---------- schema ----------
alter table public.st_settings
  add column if not exists default_spare_pct numeric not null default 10;

do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'st_settings_default_spare_pct_check'
  ) then
    alter table public.st_settings
      add constraint st_settings_default_spare_pct_check
      check (default_spare_pct >= 0 and default_spare_pct <= 100);
  end if;
end $$;

alter table public.st_lots
  add column if not exists spare_pct numeric not null default 10,
  add column if not exists printed_count int not null default 0,
  add column if not exists printed_at timestamptz,
  add column if not exists label_size text,
  add column if not exists label_config jsonb not null default '{}'::jsonb;

do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'st_lots_spare_pct_check'
  ) then
    alter table public.st_lots
      add constraint st_lots_spare_pct_check
      check (spare_pct >= 0 and spare_pct <= 100);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'st_lots_printed_count_check'
  ) then
    alter table public.st_lots
      add constraint st_lots_printed_count_check
      check (printed_count >= 0);
  end if;
end $$;

create table if not exists public.st_lot_loads (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.st_lots(id) on delete cascade,
  container_id uuid not null references public.st_containers(id) on delete cascade,
  carton_count int not null check (carton_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lot_id, container_id)
);

create index if not exists st_lot_loads_lot_idx on public.st_lot_loads(lot_id);
create index if not exists st_lot_loads_container_idx on public.st_lot_loads(container_id);

alter table public.st_lot_loads enable row level security;

revoke all on table public.st_lot_loads from public, anon, authenticated;
grant all on table public.st_lot_loads to postgres, service_role;

drop policy if exists st_lot_loads_admin on public.st_lot_loads;
create policy st_lot_loads_admin on public.st_lot_loads for all to authenticated
  using (st_private.is_admin()) with check (st_private.is_admin());

-- ---------- helpers ----------
create or replace function st_private.base_cartons(p_weight numeric, p_carton numeric)
returns int
language sql
immutable
set search_path = ''
as $$
  select case
    when p_weight is null or p_carton is null or p_weight <= 0 or p_carton <= 0 then null
    else ceil((p_weight / p_carton) - 0.000000001)::int
  end;
$$;

create or replace function st_private.required_stickers(p_weight numeric, p_carton numeric, p_spare numeric)
returns int
language sql
immutable
set search_path = ''
as $$
  select case
    when st_private.base_cartons(p_weight, p_carton) is null then null
    else ceil((
      st_private.base_cartons(p_weight, p_carton)::numeric
      * (1 + coalesce(p_spare, 10) / 100.0)
    ) - 0.000000001)::int
  end;
$$;

create or replace function st_private.normalize_lot_number(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  s text;
  m text[];
begin
  if p is null then
    return null;
  end if;
  s := upper(trim(p));
  s := replace(replace(replace(s, ' ', ''), '_', ''), E'\u2013', '-');
  if s ~ '^FS-[0-9]{4}-[0-9]{2,}$' then
    return s;
  end if;
  m := regexp_match(s, 'FS-?([0-9]{4})-?([0-9]{2,})$');
  if m is not null then
    return 'FS-' || m[1] || '-' || lpad(m[2], 2, '0');
  end if;
  if length(s) >= 3 then
    return s;
  end if;
  return s;
end;
$$;

-- ---------- settings (spare %) ----------
create or replace function st_private.save_settings(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.st_settings;
  v_fields jsonb;
  v_spare numeric;
begin
  if p_patch is null or p_patch = '{}'::jsonb then
    raise exception 'لا توجد إعدادات للحفظ';
  end if;
  v_fields := coalesce(p_patch->'public_fields', null);
  if p_patch ? 'default_spare_pct' then
    begin
      v_spare := (p_patch->>'default_spare_pct')::numeric;
    exception when others then
      raise exception 'نسبة الاحتياطي غير صالحة';
    end;
    if v_spare is null or v_spare < 0 or v_spare > 100 then
      raise exception 'نسبة الاحتياطي بين 0 و 100';
    end if;
  end if;
  update public.st_settings
     set company_name = case when p_patch ? 'company_name' then nullif(trim(p_patch->>'company_name'), '') else company_name end,
         company_name_en = case when p_patch ? 'company_name_en' then nullif(trim(p_patch->>'company_name_en'), '') else company_name_en end,
         serial_prefix = case when p_patch ? 'serial_prefix' then coalesce(nullif(trim(p_patch->>'serial_prefix'), ''), 'RS') else serial_prefix end,
         public_base_url = case when p_patch ? 'public_base_url' then nullif(trim(p_patch->>'public_base_url'), '') else public_base_url end,
         public_fields = case when v_fields is not null and jsonb_typeof(v_fields) = 'object' then v_fields else public_fields end,
         default_spare_pct = case when p_patch ? 'default_spare_pct' then v_spare else default_spare_pct end,
         updated_at = now()
   where id = 1
   returning * into v_row;
  if not found then
    raise exception 'الإعدادات غير موجودة';
  end if;
  return to_jsonb(v_row);
end;
$$;

-- ---------- sticker stats ----------
create or replace function st_private.lot_sticker_stats(p_lot_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lot public.st_lots;
  v_base int;
  v_required int;
  v_on_con int;
begin
  select * into v_lot from public.st_lots where id = p_lot_id;
  if not found then
    raise exception 'اللوت غير موجود';
  end if;
  v_base := st_private.base_cartons(v_lot.weight_kg, v_lot.carton_weight_kg);
  v_required := st_private.required_stickers(v_lot.weight_kg, v_lot.carton_weight_kg, v_lot.spare_pct);
  select coalesce(sum(carton_count), 0)::int into v_on_con
    from public.st_lot_loads where lot_id = p_lot_id;
  return jsonb_build_object(
    'lot_id', v_lot.id,
    'lot_number', v_lot.lot_number,
    'weight_kg', v_lot.weight_kg,
    'carton_weight_kg', v_lot.carton_weight_kg,
    'spare_pct', v_lot.spare_pct,
    'base_cartons', v_base,
    'required', v_required,
    'printed', coalesce(v_lot.printed_count, 0),
    'assigned', coalesce(v_lot.printed_count, 0),
    'on_container', v_on_con,
    'available', case when v_base is null then null else v_base - v_on_con end,
    'difference', case when v_required is null then null else v_required - coalesce(v_lot.printed_count, 0) end
  );
end;
$$;

-- ---------- list / save lots ----------
create or replace function st_private.list_lots()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
    from (
      select l.*,
             st_private.base_cartons(l.weight_kg, l.carton_weight_kg) as base_cartons,
             st_private.required_stickers(l.weight_kg, l.carton_weight_kg, l.spare_pct) as required_stickers,
             coalesce((select sum(ld.carton_count)::int from public.st_lot_loads ld where ld.lot_id = l.id), 0) as on_container,
             coalesce((
               select jsonb_agg(jsonb_build_object(
                 'container_id', c.id,
                 'container_number', c.container_number,
                 'customer', c.customer,
                 'destination', c.destination,
                 'loading_date', c.loading_date,
                 'carton_count', ld.carton_count
               ) order by c.container_number)
               from public.st_lot_loads ld
               join public.st_containers c on c.id = ld.container_id
               where ld.lot_id = l.id
             ), '[]'::jsonb) as loads
        from public.st_lots l
       order by l.created_at desc
       limit 200
    ) x;
$$;

create or replace function st_private.save_lot(p_row jsonb, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_num text := nullif(trim(p_row->>'lot_number'), '');
  v_row public.st_lots;
  v_spare numeric;
  v_def numeric;
begin
  if v_num is null then
    raise exception 'رقم اللوت مطلوب';
  end if;
  v_num := st_private.normalize_lot_number(v_num);
  select default_spare_pct into v_def from public.st_settings where id = 1;
  if p_row ? 'spare_pct' and nullif(trim(p_row->>'spare_pct'), '') is not null then
    begin
      v_spare := (p_row->>'spare_pct')::numeric;
    exception when others then
      raise exception 'نسبة الاحتياطي غير صالحة';
    end;
    if v_spare < 0 or v_spare > 100 then
      raise exception 'نسبة الاحتياطي بين 0 و 100';
    end if;
  else
    v_spare := null;
  end if;
  if p_id is not null then
    update public.st_lots
       set lot_number = v_num,
           supplier = nullif(trim(p_row->>'supplier'), ''),
           receipt_date = nullif(p_row->>'receipt_date', '')::date,
           weight_kg = nullif(p_row->>'weight_kg', '')::numeric,
           packing_factory = nullif(trim(p_row->>'packing_factory'), ''),
           packing_date = nullif(p_row->>'packing_date', '')::date,
           production_date = nullif(p_row->>'production_date', '')::date,
           variety = nullif(trim(p_row->>'variety'), ''),
           size_grade = nullif(trim(p_row->>'size_grade'), ''),
           carton_weight_kg = nullif(p_row->>'carton_weight_kg', '')::numeric,
           notes = nullif(trim(p_row->>'notes'), ''),
           spare_pct = coalesce(v_spare, spare_pct),
           updated_at = now()
     where id = p_id
     returning * into v_row;
    if not found then
      raise exception 'اللوت غير موجود';
    end if;
  else
    insert into public.st_lots(
      lot_number, supplier, receipt_date, weight_kg, packing_factory,
      packing_date, production_date, variety, size_grade, carton_weight_kg,
      notes, spare_pct, created_by
    ) values (
      v_num,
      nullif(trim(p_row->>'supplier'), ''),
      nullif(p_row->>'receipt_date', '')::date,
      nullif(p_row->>'weight_kg', '')::numeric,
      nullif(trim(p_row->>'packing_factory'), ''),
      nullif(p_row->>'packing_date', '')::date,
      nullif(p_row->>'production_date', '')::date,
      nullif(trim(p_row->>'variety'), ''),
      nullif(trim(p_row->>'size_grade'), ''),
      nullif(p_row->>'carton_weight_kg', '')::numeric,
      nullif(trim(p_row->>'notes'), ''),
      coalesce(v_spare, v_def, 10),
      auth.uid()
    ) returning * into v_row;
  end if;
  return to_jsonb(v_row) || st_private.lot_sticker_stats(v_row.id);
end;
$$;

create or replace function st_private.mark_lot_printed(p_lot_id uuid, p_add int, p_label_size text, p_label_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.st_lots;
begin
  if p_add is null or p_add < 1 then
    raise exception 'عدد الطباعة غير صالح';
  end if;
  update public.st_lots
     set printed_count = printed_count + p_add,
         printed_at = now(),
         label_size = coalesce(nullif(trim(p_label_size), ''), label_size),
         label_config = case when p_label_config is not null and jsonb_typeof(p_label_config) = 'object' then p_label_config else label_config end,
         updated_at = now()
   where id = p_lot_id
   returning * into v_row;
  if not found then
    raise exception 'اللوت غير موجود';
  end if;
  return jsonb_build_object('ok', true, 'printed_count', v_row.printed_count)
         || st_private.lot_sticker_stats(v_row.id);
end;
$$;

create or replace function public.st_mark_lot_printed(p_lot_id uuid, p_add int, p_label_size text default null, p_label_config jsonb default '{}'::jsonb)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select st_private.mark_lot_printed(p_lot_id, p_add, p_label_size, p_label_config);
$$;

-- ---------- containers list + allocations ----------
create or replace function st_private.list_containers()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
    from (
      select c.*,
             coalesce((select sum(ld.carton_count)::int from public.st_lot_loads ld where ld.container_id = c.id), 0) as carton_count,
             coalesce((
               select jsonb_agg(jsonb_build_object(
                 'lot_id', l.id,
                 'lot_number', l.lot_number,
                 'supplier', l.supplier,
                 'carton_count', ld.carton_count
               ) order by l.lot_number)
               from public.st_lot_loads ld
               join public.st_lots l on l.id = ld.lot_id
               where ld.container_id = c.id
             ), '[]'::jsonb) as loads
        from public.st_containers c
       order by c.created_at desc
       limit 200
    ) x;
$$;

create or replace function st_private.allocate_lot(p_lot_id uuid, p_container_id uuid, p_carton_count int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot public.st_lots;
  v_con public.st_containers;
  v_base int;
  v_other int;
  v_new int;
begin
  if p_lot_id is null or p_container_id is null then
    raise exception 'اللوت والحاوية مطلوبين';
  end if;
  select * into v_lot from public.st_lots where id = p_lot_id;
  if not found then
    raise exception 'اللوت غير موجود';
  end if;
  select * into v_con from public.st_containers where id = p_container_id;
  if not found then
    raise exception 'الحاوية غير موجودة';
  end if;
  v_base := st_private.base_cartons(v_lot.weight_kg, v_lot.carton_weight_kg);
  if v_base is null then
    raise exception 'حدّد ميزان العربية ووزن الكرتونة في اللوت أولاً';
  end if;
  select coalesce(sum(carton_count), 0)::int into v_other
    from public.st_lot_loads
   where lot_id = p_lot_id and container_id <> p_container_id;

  if p_carton_count is null or p_carton_count <= 0 then
    delete from public.st_lot_loads
     where lot_id = p_lot_id and container_id = p_container_id;
    return jsonb_build_object('ok', true, 'removed', true)
           || st_private.lot_sticker_stats(p_lot_id);
  end if;

  v_new := v_other + p_carton_count;
  if v_new > v_base then
    raise exception 'التحميل أكبر من عدد كراتين اللوت (%). المطلوب تحميله % + المتحمّل على حاويات تانية % = %، والمتاح من اللوت %.',
      v_base, p_carton_count, v_other, v_new, (v_base - v_other);
  end if;

  insert into public.st_lot_loads(lot_id, container_id, carton_count)
    values (p_lot_id, p_container_id, p_carton_count)
  on conflict (lot_id, container_id)
  do update set carton_count = excluded.carton_count, updated_at = now();

  return jsonb_build_object('ok', true, 'carton_count', p_carton_count, 'container_number', v_con.container_number)
         || st_private.lot_sticker_stats(p_lot_id);
end;
$$;

create or replace function public.st_allocate_lot(p_lot_id uuid, p_container_id uuid, p_carton_count int)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select st_private.allocate_lot(p_lot_id, p_container_id, p_carton_count);
$$;

-- ---------- dashboard ----------
create or replace function st_private.dashboard()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'lots', (select count(*)::int from public.st_lots),
    'containers', (select count(*)::int from public.st_containers),
    'printedStickers', (select coalesce(sum(printed_count),0)::int from public.st_lots),
    'baseCartons', (
      select coalesce(sum(st_private.base_cartons(weight_kg, carton_weight_kg)),0)::int
        from public.st_lots
    ),
    'allocatedCartons', (select coalesce(sum(carton_count),0)::int from public.st_lot_loads),
    'unloadedLots', (
      select count(*)::int from public.st_lots l
       where not exists (select 1 from public.st_lot_loads ld where ld.lot_id = l.id)
    ),
    'legacyCartons', (select count(*)::int from public.st_cartons),
    'legacyFree', (select count(*)::int from public.st_cartons where lot_id is null and container_id is null),
    'legacyBatches', (select count(*)::int from public.st_batches),
    -- keep old keys so older clients do not break
    'total', (select count(*)::int from public.st_cartons),
    'withLot', (select count(*)::int from public.st_cartons where lot_id is not null),
    'loaded', (select coalesce(sum(carton_count),0)::int from public.st_lot_loads),
    'free', (select count(*)::int from public.st_cartons where lot_id is null and container_id is null),
    'batches', (select count(*)::int from public.st_batches),
    'printedCartons', (select coalesce(sum(printed_count),0)::int from public.st_lots),
    'recentScans', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id,
               'serial_attempt', s.serial_attempt,
               'scanned_at', s.scanned_at,
               'is_admin', s.is_admin,
               'carton_id', s.carton_id
             ) order by s.scanned_at desc), '[]'::jsonb)
        from (
          select * from public.st_scan_logs order by scanned_at desc limit 12
        ) s
    )
  );
$$;

-- ---------- search ----------
create or replace function st_private.search_all(p_q text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_term text := nullif(trim(p_q), '');
  v_lots jsonb;
  v_cons jsonb;
  v_cartons jsonb := '[]'::jsonb;
  v_pat text;
  v_norm text;
begin
  if v_term is null then
    return jsonb_build_object('lots','[]'::jsonb,'containers','[]'::jsonb,'cartons','[]'::jsonb);
  end if;
  v_pat := st_private.like_pat(v_term);
  v_norm := st_private.normalize_serial(v_term);
  v_lots := (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
      from (
        select l.lot_number, l.supplier, l.variety, l.size_grade, l.packing_factory,
               l.weight_kg, l.carton_weight_kg, l.id, l.created_at,
               st_private.base_cartons(l.weight_kg, l.carton_weight_kg) as base_cartons,
               coalesce((select sum(ld.carton_count)::int from public.st_lot_loads ld where ld.lot_id = l.id), 0) as on_container
          from public.st_lots l
         where l.lot_number ilike v_pat escape '\'
            or coalesce(l.supplier,'') ilike v_pat escape '\'
            or coalesce(l.variety,'') ilike v_pat escape '\'
            or coalesce(l.packing_factory,'') ilike v_pat escape '\'
            or upper(l.lot_number) = upper(coalesce(st_private.normalize_lot_number(v_term), ''))
         order by l.created_at desc
         limit 80
      ) x
  );
  v_cons := (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
      from (
        select c.*,
               coalesce((select sum(ld.carton_count)::int from public.st_lot_loads ld where ld.container_id = c.id), 0) as carton_count
          from public.st_containers c
         where c.container_number ilike v_pat escape '\'
            or coalesce(c.customer,'') ilike v_pat escape '\'
            or coalesce(c.destination,'') ilike v_pat escape '\'
         order by c.created_at desc
         limit 80
      ) x
  );
  if v_norm ~ '^RS-[0-9]{6}-[A-HJ-NP-Z2-9]{4}$' or v_term ~* 'RS' then
    v_cartons := (
      select coalesce(jsonb_agg(st_private.carton_embed(c) order by c.seq), '[]'::jsonb)
        from (
          select * from public.st_cartons
           where serial = v_norm
              or serial ilike v_pat escape '\'
           order by seq
           limit 80
        ) c
    );
  end if;
  return jsonb_build_object('lots', v_lots, 'containers', v_cons, 'cartons', v_cartons);
end;
$$;

create or replace function public.st_search_all(p_q text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select st_private.search_all(p_q);
$$;

-- ---------- lookup (lot or legacy carton) + status ----------
create or replace function st_private.serial_status(p_serial text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_serial text;
  v_lot text;
  v_has_lot uuid;
  v_has_con uuid;
  v_lot_id uuid;
  v_loaded int;
begin
  v_serial := st_private.normalize_serial(p_serial);
  v_lot := st_private.normalize_lot_number(p_serial);
  if (v_serial is null or length(v_serial) < 3) and (v_lot is null or length(v_lot) < 3) then
    return 'invalid';
  end if;
  if v_serial is not null then
    select lot_id, container_id into v_has_lot, v_has_con
      from public.st_cartons c where c.serial = v_serial;
    if found then
      if v_has_lot is null and v_has_con is null then
        return 'unassigned';
      end if;
      return 'ok';
    end if;
  end if;
  if v_lot is not null then
    select id into v_lot_id from public.st_lots l
     where upper(l.lot_number) = upper(v_lot);
    if found then
      select count(*)::int into v_loaded from public.st_lot_loads where lot_id = v_lot_id;
      if v_loaded = 0 then
        return 'unloaded';
      end if;
      return 'ok';
    end if;
  end if;
  return 'unknown';
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
  v_lotnum text;
  v_admin boolean;
  v_carton public.st_cartons%rowtype;
  v_lot public.st_lots%rowtype;
  v_con public.st_containers%rowtype;
  v_fields jsonb;
  v_ua text;
  v_out jsonb;
  v_hdr text;
  v_cons jsonb;
  v_looks_carton boolean := false;
begin
  v_serial := st_private.normalize_serial(p_serial);
  v_lotnum := st_private.normalize_lot_number(p_serial);
  v_admin := st_private.is_admin();
  v_looks_carton := v_serial is not null and v_serial ~ '^RS-[0-9]{6}-[A-HJ-NP-Z2-9]{4}$';

  v_ua := null;
  begin
    v_hdr := current_setting('request.headers', true);
    if v_hdr is not null and left(trim(v_hdr), 1) = '{' then
      v_ua := left(coalesce(v_hdr::json->>'user-agent', ''), 300);
    end if;
  exception when others then
    v_ua := null;
  end;

  if v_looks_carton then
    select * into v_carton from public.st_cartons c where c.serial = v_serial;
    if found then
      insert into public.st_scan_logs(carton_id, serial_attempt, is_admin, user_agent)
        values (v_carton.id, v_serial, v_admin, v_ua);
      if v_carton.lot_id is not null then
        select * into v_lot from public.st_lots l where l.id = v_carton.lot_id;
      end if;
      if v_carton.container_id is not null then
        select * into v_con from public.st_containers x where x.id = v_carton.container_id;
      end if;
      if v_carton.lot_id is null and v_carton.container_id is null then
        v_out := jsonb_build_object('status', 'unassigned', 'kind', 'carton', 'serial', v_serial);
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
        'kind', 'carton',
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
          where e.key in ('status', 'serial', 'kind')
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
    end if;
  end if;

  -- lot path
  if v_lotnum is not null and length(v_lotnum) >= 3 then
    select * into v_lot from public.st_lots l where upper(l.lot_number) = upper(v_lotnum);
    if found then
      insert into public.st_scan_logs(carton_id, serial_attempt, is_admin, user_agent)
        values (null, left(v_lot.lot_number, 40), v_admin, v_ua);
      select public_fields into v_fields from public.st_settings where id = 1;
      v_cons := (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'container_id', c.id,
                 'container_number', c.container_number,
                 'loading_date', c.loading_date,
                 'customer', c.customer,
                 'destination', c.destination,
                 'carton_count', ld.carton_count
               ) order by c.loading_date nulls last, c.container_number), '[]'::jsonb)
          from public.st_lot_loads ld
          join public.st_containers c on c.id = ld.container_id
         where ld.lot_id = v_lot.id
      );
      v_out := jsonb_strip_nulls(jsonb_build_object(
        'status', 'ok',
        'kind', 'lot',
        'serial', v_lot.lot_number,
        'lot_number', v_lot.lot_number,
        'lot_id', v_lot.id,
        'supplier', v_lot.supplier,
        'packing_factory', v_lot.packing_factory,
        'variety', v_lot.variety,
        'size_grade', v_lot.size_grade,
        'packing_date', v_lot.packing_date,
        'production_date', coalesce(v_lot.production_date, v_lot.packing_date),
        'carton_net_weight', v_lot.carton_weight_kg,
        'receipt_date', v_lot.receipt_date,
        'loaded', (jsonb_array_length(v_cons) > 0),
        'containers', v_cons
      ));
      if not v_admin then
        v_out := (
          select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
          from jsonb_each(v_out) e
          where e.key in ('status', 'serial', 'kind', 'lot_number', 'loaded', 'containers', 'lot_id')
             or coalesce((v_fields->>e.key)::boolean, false)
        );
        -- filter keys inside each container according to public_fields
        if v_out ? 'containers' then
          v_out := v_out || jsonb_build_object('containers', (
            select coalesce(jsonb_agg(
              (select jsonb_object_agg(k.key, k.value)
                 from jsonb_each(elem) k
                where k.key in ('carton_count')
                   or (k.key = 'container_number' and coalesce((v_fields->>'container_number')::boolean, false))
                   or (k.key = 'loading_date' and coalesce((v_fields->>'loading_date')::boolean, false))
                   or (k.key = 'customer' and coalesce((v_fields->>'customer')::boolean, false))
                   or (k.key = 'destination' and coalesce((v_fields->>'destination')::boolean, false))
              )
            ), '[]'::jsonb)
            from jsonb_array_elements(v_out->'containers') elem
          ));
        end if;
      end if;
      return v_out;
    end if;
  end if;

  if (v_serial is null or length(v_serial) < 8) and (v_lotnum is null or length(v_lotnum) < 8) then
    return jsonb_build_object('status', 'invalid');
  end if;

  insert into public.st_scan_logs(carton_id, serial_attempt, is_admin, user_agent)
    values (null, left(coalesce(v_serial, v_lotnum, p_serial), 40), v_admin, v_ua);
  return jsonb_build_object('status', 'unknown', 'serial', coalesce(v_serial, v_lotnum, p_serial));
end;
$$;

-- ---------- grants ----------
revoke all on function st_private.base_cartons(numeric, numeric) from public;
revoke all on function st_private.required_stickers(numeric, numeric, numeric) from public;
revoke all on function st_private.normalize_lot_number(text) from public;
revoke all on function st_private.mark_lot_printed(uuid, int, text, jsonb) from public;
revoke all on function public.st_mark_lot_printed(uuid, int, text, jsonb) from public;
revoke all on function st_private.allocate_lot(uuid, uuid, int) from public;
revoke all on function public.st_allocate_lot(uuid, uuid, int) from public;
revoke all on function st_private.search_all(text) from public;
revoke all on function public.st_search_all(text) from public;

grant execute on function st_private.base_cartons(numeric, numeric) to anon, authenticated;
grant execute on function st_private.required_stickers(numeric, numeric, numeric) to anon, authenticated;
grant execute on function st_private.normalize_lot_number(text) to anon, authenticated;
grant execute on function st_private.mark_lot_printed(uuid, int, text, jsonb) to anon, authenticated;
grant execute on function public.st_mark_lot_printed(uuid, int, text, jsonb) to anon, authenticated;
grant execute on function st_private.allocate_lot(uuid, uuid, int) to anon, authenticated;
grant execute on function public.st_allocate_lot(uuid, uuid, int) to anon, authenticated;
grant execute on function st_private.search_all(text) to anon, authenticated;
grant execute on function public.st_search_all(text) to anon, authenticated;
