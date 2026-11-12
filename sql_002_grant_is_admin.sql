grant execute on function st_private.is_admin() to authenticated;
revoke all on function st_private.is_admin() from anon, public;
