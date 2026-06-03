# Admin financial snapshot (`admin_financial_snapshot`)

Site operators use the RPC `public.admin_financial_snapshot(p_series_from date, p_series_to date)` for read-only aggregates on `/admin/accounts` and related exports.

## Why you see `code: forbidden`

The function runs as **`SECURITY DEFINER`** but still checks the **caller** with **`auth.uid()`**. It loads your row from **`public.profiles`** where **`profiles.id = auth.uid()`**. You get **`forbidden`** when that row is missing or neither of these is true:

- **`is_admin`** is true, or  
- **`role`** is exactly **`'admin'`** (see migration `20260513130000_profiles_role_site_admin.sql`).

So: the Next.js `/admin` gate may let you through (e.g. cookie/session checks), but Postgres returns **`forbidden`** until **your** profile row is flagged as admin in the database.

## Apply migrations (order matters)

From the project root, push local migrations to your linked Supabase project:

```bash
supabase db push
```

Or apply SQL in **timestamp order** under `supabase/migrations/`, at minimum:

1. `20260513120000_profiles_is_admin_admin_financial_rpc.sql` — adds **`is_admin`**, creates the RPC, **`GRANT EXECUTE`** to **`authenticated`** and **`service_role`**.
2. `20260513130000_profiles_role_site_admin.sql` — adds **`profiles.role`**, updates the RPC to treat **`role = 'admin'`** like **`is_admin`**, and re-applies the same grants.

If **`GRANT EXECUTE`** were missing for **`authenticated`**, the client would typically see an RPC / permission error from PostgREST, not the JSON **`forbidden`** payload. The migrations above **do** include execute grants; if an older database omitted them, run:

```sql
revoke all on function public.admin_financial_snapshot(date, date) from public;
grant execute on function public.admin_financial_snapshot(date, date) to authenticated;
grant execute on function public.admin_financial_snapshot(date, date) to service_role;
```

## Grant admin to a user (SQL)

Replace the UUID with the user’s id from **`auth.users`** (same as **`profiles.id`**):

```sql
update public.profiles
set is_admin = true,
    role = 'admin'
where id = '<uuid from auth.users>';
```

You must update **the row for the signed-in user** (`id` = that user’s auth id), because the RPC compares **`profiles.id`** to **`auth.uid()`**.

## Related docs

- Table overview: [`docs/database.md`](./database.md) (profiles, `is_admin`, `role`, RPC mention).
