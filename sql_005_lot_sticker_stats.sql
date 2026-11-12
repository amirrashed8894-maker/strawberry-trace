-- v1.0.5: sticker stats for a lot (required vs already assigned / on container)
create or replace function st_private.lot_sticker_stats(p_lot_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lot public.st_lots;
  v_assigned int;
  v_on_con int;
  v_required int;
begin
  select * into v_lot from public.st_lots where id = p_lot_id;
  if not found then
    raise exception 'اللوت غير موجود';
  end if;
  select count(*)::int,
         count(*) filter (where container_id is not null)::int
    into v_assigned, v_on_con
    from public.st_cartons
   where lot_id = p_lot_id;
  if v_lot.weight_kg is not null and v_lot.weight_kg > 0
     and v_lot.carton_weight_kg is not null and v_lot.carton_weight_kg > 0 then
    v_required := ceil((v_lot.weight_kg / v_lot.carton_weight_kg) - 0.000000001)::int;
  else
    v_required := null;
  end if;
  return jsonb_build_object(
    'lot_id', v_lot.id,
    'weight_kg', v_lot.weight_kg,
    'carton_weight_kg', v_lot.carton_weight_kg,
    'required', v_required,
    'assigned', v_assigned,
    'on_container', v_on_con,
    'difference', case when v_required is null then null else v_required - v_assigned end
  );
end;
$$;

create or replace function public.st_lot_sticker_stats(p_lot_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select st_private.lot_sticker_stats(p_lot_id);
$$;

revoke all on function st_private.lot_sticker_stats(uuid) from public;
revoke all on function public.st_lot_sticker_stats(uuid) from public;
grant execute on function st_private.lot_sticker_stats(uuid) to anon, authenticated;
grant execute on function public.st_lot_sticker_stats(uuid) to anon, authenticated;
