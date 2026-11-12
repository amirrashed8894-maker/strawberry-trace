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
  -- Open admin (v1.0.4): callable by anon via granted SECURITY DEFINER RPC. Direct table access remains closed.
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
  -- Open admin (v1.0.4): callable by anon via granted SECURITY DEFINER RPC. Direct table access remains closed.
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
  -- Open admin (v1.0.4): callable by anon via granted SECURITY DEFINER RPC. Direct table access remains closed.
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
  -- Open admin (v1.0.4): callable by anon via granted SECURITY DEFINER RPC. Direct table access remains closed.
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
  -- Open admin (v1.0.4): callable by anon via granted SECURITY DEFINER RPC. Direct table access remains closed.
  v_prefix := 'FS-' || to_char((timezone('Africa/Cairo', now()))::date, 'YYMM') || '-';
  select coalesce(max(substring(lot_number from length(v_prefix)+1)::int), 0)
    into v_max
    from public.st_lots
    where lot_number ~ ('^' || v_prefix || '[0-9]+$');
  return v_prefix || lpad((v_max + 1)::text, 2, '0');
end;
$$;

create or replace function st_private.mark_batch_printed(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Open admin (v1.0.4): callable by anon via granted SECURITY DEFINER RPC. Direct table access remains closed.
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
-- v1.0.4: Open admin by design. Anon may execute these SECURITY DEFINER RPCs only.
-- RLS stays on. Direct table grants to anon remain revoked (including st_admins).
-- Auth accounts are not modified.

-- ---------- settings ----------
create or replace function st_private.get_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(s) from public.st_settings s where s.id = 1;
$$;

create or replace function public.st_get_settings()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select st_private.get_settings();
$$;

create or replace function st_private.save_settings(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.st_settings;
  v_fields jsonb;
begin
  if p_patch is null or p_patch = '{}'::jsonb then
    raise exception 'لا توجد إعدادات للحفظ';
  end if;
  v_fields := coalesce(p_patch->'public_fields', null);
  update public.st_settings
     set company_name = case when p_patch ? 'company_name' then nullif(trim(p_patch->>'company_name'), '') else company_name end,
         company_name_en = case when p_patch ? 'company_name_en' then nullif(trim(p_patch->>'company_name_en'), '') else company_name_en end,
         serial_prefix = case when p_patch ? 'serial_prefix' then coalesce(nullif(trim(p_patch->>'serial_prefix'), ''), 'RS') else serial_prefix end,
         public_base_url = case when p_patch ? 'public_base_url' then nullif(trim(p_patch->>'public_base_url'), '') else public_base_url end,
         public_fields = case when v_fields is not null and jsonb_typeof(v_fields) = 'object' then v_fields else public_fields end,
         updated_at = now()
   where id = 1
   returning * into v_row;
  if not found then
    raise exception 'الإعدادات غير موجودة';
  end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.st_save_settings(p_patch jsonb)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select st_private.save_settings(p_patch);
$$;

-- ---------- parties ----------
create or replace function st_private.list_parties(p_kind text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(p) order by p.name), '[]'::jsonb)
    from public.st_parties p
   where p_kind is null or p_kind = '' or p.kind = p_kind;
$$;

create or replace function public.st_list_parties(p_kind text default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select st_private.list_parties(p_kind);
$$;

create or replace function st_private.add_party(p_kind text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(trim(p_name), '');
  v_row public.st_parties;
begin
  if p_kind is null or p_kind not in ('supplier','customer','factory') then
    raise exception 'نوع الطرف غير صالح';
  end if;
  if v_name is null then
    raise exception 'الاسم مطلوب';
  end if;
  insert into public.st_parties(kind, name) values (p_kind, v_name)
  on conflict (kind, name) do update set name = excluded.name
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.st_add_party(p_kind text, p_name text)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select st_private.add_party(p_kind, p_name);
$$;

-- ---------- batches / cartons ----------
create or replace function st_private.list_batches()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(b) order by b.created_at desc), '[]'::jsonb)
    from (
      select * from public.st_batches order by created_at desc limit 100
    ) b;
$$;

create or replace function public.st_list_batches()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select st_private.list_batches();
$$;

create or replace function st_private.batch_cartons(p_batch_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'serial', c.serial,
           'seq', c.seq,
           'check_code', c.check_code,
           'lot_id', c.lot_id,
           'container_id', c.container_id
         ) order by c.seq), '[]'::jsonb)
    from public.st_cartons c
   where c.batch_id = p_batch_id;
$$;

create or replace function public.st_batch_cartons(p_batch_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select st_private.batch_cartons(p_batch_id);
$$;

-- ---------- lots / containers ----------
create or replace function st_private.list_lots()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc), '[]'::jsonb)
    from (
      select * from public.st_lots order by created_at desc limit 200
    ) l;
$$;

create or replace function public.st_list_lots()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select st_private.list_lots();
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
begin
  if v_num is null then
    raise exception 'رقم اللوت مطلوب';
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
           updated_at = now()
     where id = p_id
     returning * into v_row;
    if not found then
      raise exception 'اللوت غير موجود';
    end if;
  else
    insert into public.st_lots(
      lot_number, supplier, receipt_date, weight_kg, packing_factory,
      packing_date, production_date, variety, size_grade, carton_weight_kg, notes, created_by
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
      auth.uid()
    ) returning * into v_row;
  end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.st_save_lot(p_row jsonb, p_id uuid default null)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select st_private.save_lot(p_row, p_id);
$$;

create or replace function st_private.list_containers()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb)
    from (
      select * from public.st_containers order by created_at desc limit 200
    ) c;
$$;

create or replace function public.st_list_containers()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select st_private.list_containers();
$$;

create or replace function st_private.save_container(p_row jsonb, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_num text := nullif(trim(p_row->>'container_number'), '');
  v_row public.st_containers;
begin
  if v_num is null then
    raise exception 'رقم الحاوية مطلوب';
  end if;
  if p_id is not null then
    update public.st_containers
       set container_number = v_num,
           loading_date = nullif(p_row->>'loading_date', '')::date,
           customer = nullif(trim(p_row->>'customer'), ''),
           destination = nullif(trim(p_row->>'destination'), ''),
           notes = nullif(trim(p_row->>'notes'), ''),
           updated_at = now()
     where id = p_id
     returning * into v_row;
    if not found then
      raise exception 'الحاوية غير موجودة';
    end if;
  else
    insert into public.st_containers(
      container_number, loading_date, customer, destination, notes, created_by
    ) values (
      v_num,
      nullif(p_row->>'loading_date', '')::date,
      nullif(trim(p_row->>'customer'), ''),
      nullif(trim(p_row->>'destination'), ''),
      nullif(trim(p_row->>'notes'), ''),
      auth.uid()
    ) returning * into v_row;
  end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.st_save_container(p_row jsonb, p_id uuid default null)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select st_private.save_container(p_row, p_id);
$$;

-- ---------- dashboard / search / trace ----------
create or replace function st_private.dashboard()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total', (select count(*)::int from public.st_cartons),
    'withLot', (select count(*)::int from public.st_cartons where lot_id is not null),
    'loaded', (select count(*)::int from public.st_cartons where container_id is not null),
    'free', (select count(*)::int from public.st_cartons where lot_id is null and container_id is null),
    'lots', (select count(*)::int from public.st_lots),
    'containers', (select count(*)::int from public.st_containers),
    'batches', (select count(*)::int from public.st_batches),
    'printedCartons', (select coalesce(sum(count),0)::int from public.st_batches where printed_at is not null),
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

create or replace function public.st_dashboard()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select st_private.dashboard();
$$;

create or replace function st_private.like_pat(p text)
returns text
language sql
immutable
as $$
  select '%' || replace(replace(replace(coalesce(p,''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;

create or replace function st_private.carton_embed(c public.st_cartons)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(c) || jsonb_build_object(
    'st_lots', (select to_jsonb(l) from public.st_lots l where l.id = c.lot_id),
    'st_containers', (select to_jsonb(n) from public.st_containers n where n.id = c.container_id)
  );
$$;

create or replace function st_private.search_cartons(p_q text, p_lot_id uuid, p_container_id uuid, p_supplier text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_term text := nullif(trim(p_q), '');
  v_sup text := nullif(trim(p_supplier), '');
  v_lot_ids uuid[];
  v_con_ids uuid[];
  v_rows jsonb;
begin
  if v_term is not null and v_term ~* '^RS' then
    select coalesce(jsonb_agg(st_private.carton_embed(c) order by c.seq), '[]'::jsonb)
      into v_rows
      from (
        select * from public.st_cartons
         where serial ilike st_private.like_pat(st_private.normalize_serial(v_term)) escape '\'
         order by seq
         limit 200
      ) c;
    return v_rows;
  end if;

  if v_sup is not null then
    select array_agg(id) into v_lot_ids
      from public.st_lots
     where supplier ilike st_private.like_pat(v_sup) escape '\';
    if v_lot_ids is null then
      return '[]'::jsonb;
    end if;
  end if;

  if v_term is not null and p_lot_id is null then
    select array_agg(id) into v_lot_ids
      from (
        select id from public.st_lots
         where lot_number ilike st_private.like_pat(v_term) escape '\'
            or supplier ilike st_private.like_pat(v_term) escape '\'
        union
        select unnest(coalesce(v_lot_ids, '{}'::uuid[]))
      ) x;
    select array_agg(id) into v_con_ids
      from public.st_containers
     where container_number ilike st_private.like_pat(v_term) escape '\'
        or customer ilike st_private.like_pat(v_term) escape '\'
        or destination ilike st_private.like_pat(v_term) escape '\';

    select coalesce(jsonb_agg(st_private.carton_embed(c) order by c.seq), '[]'::jsonb)
      into v_rows
      from (
        select * from public.st_cartons c
         where (p_container_id is null or c.container_id = p_container_id)
           and (
             c.serial ilike st_private.like_pat(v_term) escape '\'
             or (v_lot_ids is not null and c.lot_id = any(v_lot_ids))
             or (v_con_ids is not null and c.container_id = any(v_con_ids))
           )
         order by seq
         limit 500
      ) c;
    return v_rows;
  end if;

  select coalesce(jsonb_agg(st_private.carton_embed(c) order by c.seq), '[]'::jsonb)
    into v_rows
    from (
      select * from public.st_cartons c
       where (p_lot_id is null or c.lot_id = p_lot_id)
         and (p_container_id is null or c.container_id = p_container_id)
         and (v_lot_ids is null or c.lot_id = any(v_lot_ids))
       order by seq
       limit 500
    ) c;
  return v_rows;
end;
$$;



create or replace function public.st_search_cartons(p_q text default null, p_lot_id uuid default null, p_container_id uuid default null, p_supplier text default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select st_private.search_cartons(p_q, p_lot_id, p_container_id, p_supplier);
$$;

create or replace function st_private.lot_trace(p_lot_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lot public.st_lots;
  v_total int;
  v_groups jsonb;
begin
  select * into v_lot from public.st_lots where id = p_lot_id;
  if not found then
    raise exception 'اللوت غير موجود';
  end if;
  select count(*)::int into v_total from public.st_cartons where lot_id = p_lot_id;
  select coalesce(jsonb_agg(g.obj order by g.sort), '[]'::jsonb)
    into v_groups
    from (
      select case when c.container_id is null then 1 else 0 end as sort,
             jsonb_build_object(
               'container', (select to_jsonb(n) from public.st_containers n where n.id = c.container_id),
               'cartons', jsonb_agg(jsonb_build_object(
                 'id', c.id, 'serial', c.serial, 'seq', c.seq, 'container_id', c.container_id
               ) order by c.seq)
             ) as obj
        from public.st_cartons c
       where c.lot_id = p_lot_id
       group by c.container_id
    ) g;
  return jsonb_build_object('lot', to_jsonb(v_lot), 'total', v_total, 'groups', v_groups);
end;
$$;

create or replace function public.st_lot_trace(p_lot_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select st_private.lot_trace(p_lot_id);
$$;

-- Grants: public wrappers + private (invoker wrappers). Tables stay revoked from anon.
revoke all on table
  public.st_settings, public.st_admins, public.st_parties, public.st_seq,
  public.st_batches, public.st_lots, public.st_containers, public.st_cartons,
  public.st_scan_logs
from anon, public;

grant execute on function st_private.generate_batch(int, text, jsonb, text) to anon, authenticated;
grant execute on function public.st_generate_batch(int, text, jsonb, text) to anon, authenticated;
grant execute on function st_private.assign_range(text, text, uuid, uuid, boolean, numeric) to anon, authenticated;
grant execute on function public.st_assign_range(text, text, uuid, uuid, boolean, numeric) to anon, authenticated;
grant execute on function st_private.unassign_range(text, text, text) to anon, authenticated;
grant execute on function public.st_unassign_range(text, text, text) to anon, authenticated;
grant execute on function st_private.assign_lot_to_container(uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.st_assign_lot_to_container(uuid, uuid, boolean) to anon, authenticated;
grant execute on function st_private.next_lot_number() to anon, authenticated;
grant execute on function public.st_next_lot_number() to anon, authenticated;
grant execute on function st_private.mark_batch_printed(uuid) to anon, authenticated;
grant execute on function public.st_mark_batch_printed(uuid) to anon, authenticated;

grant execute on function st_private.get_settings() to anon, authenticated;
grant execute on function public.st_get_settings() to anon, authenticated;
grant execute on function st_private.save_settings(jsonb) to anon, authenticated;
grant execute on function public.st_save_settings(jsonb) to anon, authenticated;
grant execute on function st_private.list_parties(text) to anon, authenticated;
grant execute on function public.st_list_parties(text) to anon, authenticated;
grant execute on function st_private.add_party(text, text) to anon, authenticated;
grant execute on function public.st_add_party(text, text) to anon, authenticated;
grant execute on function st_private.list_batches() to anon, authenticated;
grant execute on function public.st_list_batches() to anon, authenticated;
grant execute on function st_private.batch_cartons(uuid) to anon, authenticated;
grant execute on function public.st_batch_cartons(uuid) to anon, authenticated;
grant execute on function st_private.list_lots() to anon, authenticated;
grant execute on function public.st_list_lots() to anon, authenticated;
grant execute on function st_private.save_lot(jsonb, uuid) to anon, authenticated;
grant execute on function public.st_save_lot(jsonb, uuid) to anon, authenticated;
grant execute on function st_private.list_containers() to anon, authenticated;
grant execute on function public.st_list_containers() to anon, authenticated;
grant execute on function st_private.save_container(jsonb, uuid) to anon, authenticated;
grant execute on function public.st_save_container(jsonb, uuid) to anon, authenticated;
grant execute on function st_private.dashboard() to anon, authenticated;
grant execute on function public.st_dashboard() to anon, authenticated;
grant execute on function st_private.like_pat(text) to anon, authenticated;
grant execute on function st_private.carton_embed(public.st_cartons) to anon, authenticated;
grant execute on function st_private.search_cartons(text, uuid, uuid, text) to anon, authenticated;
grant execute on function public.st_search_cartons(text, uuid, uuid, text) to anon, authenticated;
grant execute on function st_private.lot_trace(uuid) to anon, authenticated;
grant execute on function public.st_lot_trace(uuid) to anon, authenticated;

-- Keep st_admins and is_admin() unchanged; they are unused by the open admin UI.
