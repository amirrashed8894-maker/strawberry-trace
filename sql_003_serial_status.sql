create or replace function st_private.serial_status(p_serial text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_serial text;
  v_has_lot uuid;
  v_has_con uuid;
begin
  v_serial := st_private.normalize_serial(p_serial);
  if v_serial is null or length(v_serial) < 8 then
    return 'invalid';
  end if;
  select lot_id, container_id into v_has_lot, v_has_con
    from public.st_cartons c where c.serial = v_serial;
  if not found then
    return 'unknown';
  end if;
  if v_has_lot is null and v_has_con is null then
    return 'unassigned';
  end if;
  return 'ok';
end;
$$;

create or replace function public.st_serial_status(p_serial text)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select st_private.serial_status(p_serial);
$$;

revoke all on function st_private.serial_status(text) from public;
revoke all on function public.st_serial_status(text) from public;
grant execute on function st_private.serial_status(text) to anon, authenticated;
grant execute on function public.st_serial_status(text) to anon, authenticated;
