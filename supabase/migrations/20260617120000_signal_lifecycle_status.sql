-- Signal lifecycle state machine for competitor_strength queue items.
-- Canonical storage: optimization_queue.items[].status (top-level JSON field per item).
-- Values: DISCOVERY | AUDIT | ACTIVE

DO $$ BEGIN
  CREATE TYPE signal_lifecycle_status AS ENUM ('DISCOVERY', 'AUDIT', 'ACTIVE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE signal_lifecycle_status IS
  'ASO signal lifecycle. Stored on workspace_staging_vault state_{en|ar} optimization_queue items as top-level status.';

-- Migrate legacy metadata flags → top-level status on competitor_strength items.
CREATE OR REPLACE FUNCTION migrate_optimization_queue_item_lifecycle(item jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  meta jsonb;
  legacy_status text;
  resolved signal_lifecycle_status;
BEGIN
  IF item->>'type' IS DISTINCT FROM 'competitor_strength' THEN
    RETURN item;
  END IF;

  IF item ? 'status' AND (item->>'status') IN ('DISCOVERY', 'AUDIT', 'ACTIVE') THEN
    meta := COALESCE(item->'metadata', '{}'::jsonb)
      - 'status'
      - 'move_to_active_context'
      - 'audit_status';
    RETURN jsonb_set(item, '{metadata}', meta, true);
  END IF;

  meta := COALESCE(item->'metadata', '{}'::jsonb);
  legacy_status := upper(COALESCE(meta->>'status', meta->>'audit_status', ''));

  IF legacy_status IN ('ACTIVE', 'ACTIVE_CONTEXT', 'APPROVED')
     OR (meta->>'move_to_active_context') = 'true' THEN
    resolved := 'ACTIVE';
  ELSIF legacy_status IN ('AUDIT', 'AUDIT_QUEUE', 'PENDING', 'REMOVED', 'DISMISSED')
        OR (meta->>'from_strength_audit') = 'true' THEN
    resolved := 'AUDIT';
  ELSE
    resolved := 'DISCOVERY';
  END IF;

  meta := meta - 'status' - 'move_to_active_context' - 'audit_status';
  RETURN jsonb_set(
    jsonb_set(item, '{status}', to_jsonb(resolved::text), true),
    '{metadata}',
    meta,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION migrate_vault_state_queue_lifecycle(state jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  queue jsonb;
  items jsonb;
  migrated jsonb := '[]'::jsonb;
  elem jsonb;
BEGIN
  IF state IS NULL OR state = 'null'::jsonb THEN
    RETURN state;
  END IF;

  queue := state->'features'->'optimization_queue';
  IF queue IS NULL OR jsonb_typeof(queue->'items') <> 'array' THEN
    RETURN state;
  END IF;

  items := queue->'items';
  FOR elem IN SELECT jsonb_array_elements(items)
  LOOP
    migrated := migrated || jsonb_build_array(migrate_optimization_queue_item_lifecycle(elem));
  END LOOP;

  RETURN jsonb_set(
    state,
    '{features,optimization_queue,items}',
    migrated,
    true
  );
END;
$$;

UPDATE workspace_staging_vault
SET
  state_en = migrate_vault_state_queue_lifecycle(state_en),
  state_ar = migrate_vault_state_queue_lifecycle(state_ar),
  updated_at = NOW()
WHERE
  state_en->'features'->'optimization_queue'->'items' IS NOT NULL
  OR state_ar->'features'->'optimization_queue'->'items' IS NOT NULL;

COMMENT ON FUNCTION migrate_optimization_queue_item_lifecycle(jsonb) IS
  'One-time/backfill: maps legacy move_to_active_context / metadata.status to top-level status enum.';
