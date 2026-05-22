-- Fix: infinite recursion in workspace_members RLS policy.
--
-- Root cause: the "workspace_members_select_roster" policy used a subquery
-- against the same table (workspace_members) it was protecting, causing
-- Supabase to re-enter the policy check infinitely.
--
-- Fix: introduce a SECURITY DEFINER helper function that queries
-- workspace_members with RLS bypassed, then rewrite the policy to call it.
-- The profiles peer-visibility policy has the same pattern and is fixed too.

-- ----------------------------------------------------------------
-- 1. Helper: check membership without triggering RLS on the table
-- ----------------------------------------------------------------
create or replace function public.is_workspace_member(p_workspace_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = p_user_id
  );
$$;

-- ----------------------------------------------------------------
-- 2. Helper: get all workspace IDs a user belongs to (no RLS)
-- ----------------------------------------------------------------
create or replace function public.my_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id
  from public.workspace_members
  where user_id = auth.uid();
$$;

-- ----------------------------------------------------------------
-- 3. Drop the recursive policy and replace it
-- ----------------------------------------------------------------
drop policy if exists "workspace_members_select_roster" on public.workspace_members;

-- New policy: "can you see this workspace_members row?"
-- → you're allowed if you share any workspace with the row's workspace_id,
--   using the security-definer function (no RLS re-entry).
create policy "workspace_members_select_roster"
  on public.workspace_members for select
  using (
    public.is_workspace_member(workspace_id, auth.uid())
  );

-- ----------------------------------------------------------------
-- 4. Fix the profiles peer-visibility policy (same recursion risk)
-- ----------------------------------------------------------------
drop policy if exists "profiles_select_workspace_peers" on public.profiles;

create policy "profiles_select_workspace_peers"
  on public.profiles for select
  using (
    -- own profile always visible
    auth.uid() = id
    or
    -- peers: any user who shares a workspace with the viewer
    exists (
      select 1
      from public.my_workspace_ids() as my_ws
      join public.workspace_members peer
        on peer.workspace_id = my_ws
      where peer.user_id = profiles.id
    )
  );
