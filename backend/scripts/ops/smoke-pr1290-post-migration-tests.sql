-- PR #1290 smoke gate post-migration assertions (real PostgreSQL INSERT/FK/CHECK matrix).

\set ON_ERROR_STOP on

\echo '=== DDL inspection ==='

SELECT
  c.column_name,
  c.is_nullable,
  c.data_type
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'vehicle_data_source_links'
  AND c.column_name IN ('source_reference_id', 'dimo_vehicle_id')
ORDER BY c.column_name;

SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column,
  rc.delete_rule,
  rc.update_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name
 AND rc.constraint_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'vehicle_data_source_links'
  AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.constraint_name;

SELECT pg_get_constraintdef(oid) AS check_def
FROM pg_constraint
WHERE conrelid = 'vehicle_data_source_links'::regclass
  AND conname = 'vehicle_data_source_links_provider_reference_check';

SELECT indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'vehicle_data_source_links'
  AND indexname = 'uq_vdsl_active_dimo_vehicle';

\echo '=== Legacy HM row survived ==='
SELECT id, provider, source_type, source_reference_id, dimo_vehicle_id, is_active
FROM vehicle_data_source_links
WHERE id = 'link-smoke-legacy-hm';

\echo '=== Canonical HM insert ==='
INSERT INTO vehicle_data_source_links (
  id, vehicle_id, provider, source_type, source_subtype,
  source_reference_id, dimo_vehicle_id, is_active
) VALUES (
  'link-smoke-hm-canonical',
  'veh-smoke-dimo',
  'HIGH_MOBILITY',
  'HIGH_MOBILITY',
  'HM_FULL_TELEMETRY',
  'hm-smoke-legacy',
  NULL,
  true
);

\echo '=== Invalid HM FK (expect failure) ==='
\set expect_fail true
DO $$
BEGIN
  BEGIN
    INSERT INTO vehicle_data_source_links (
      id, vehicle_id, provider, source_type,
      source_reference_id, dimo_vehicle_id, is_active
    ) VALUES (
      'link-smoke-hm-bad-fk',
      'veh-smoke-dimo',
      'HIGH_MOBILITY',
      'HIGH_MOBILITY',
      'hm-does-not-exist',
      NULL,
      true
    );
    RAISE EXCEPTION 'EXPECTED_HM_FK_REJECT_BUT_INSERT_SUCCEEDED';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'HM FK reject OK: %', SQLERRM;
  END;
END $$;

\echo '=== Canonical DIMO insert ==='
INSERT INTO vehicle_data_source_links (
  id, vehicle_id, provider, source_type, source_subtype,
  source_reference_id, dimo_vehicle_id, is_active
) VALUES (
  'link-smoke-dimo-canonical',
  'veh-smoke-dimo',
  'DIMO',
  'DIMO',
  NULL,
  NULL,
  'dimo-smoke-1',
  true
);

\echo '=== Invalid DIMO FK (expect failure) ==='
DO $$
BEGIN
  BEGIN
    INSERT INTO vehicle_data_source_links (
      id, vehicle_id, provider, source_type,
      source_reference_id, dimo_vehicle_id, is_active
    ) VALUES (
      'link-smoke-dimo-bad-fk',
      'veh-smoke-dimo',
      'DIMO',
      'DIMO',
      NULL,
      'dimo-does-not-exist',
      true
    );
    RAISE EXCEPTION 'EXPECTED_DIMO_FK_REJECT_BUT_INSERT_SUCCEEDED';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'DIMO FK reject OK: %', SQLERRM;
  END;
END $$;

\echo '=== CHECK matrix C1-C10 ==='

-- C1 PASS
INSERT INTO vehicle_data_source_links (
  id, vehicle_id, provider, source_type,
  source_reference_id, dimo_vehicle_id, is_active
) VALUES (
  'link-check-c1',
  'veh-smoke-legacy',
  'DIMO', 'DIMO',
  NULL, 'dimo-smoke-1',
  false
);

-- C2 REJECT DIMO/HIGH_MOBILITY
DO $$ BEGIN
  BEGIN
    INSERT INTO vehicle_data_source_links (
      id, vehicle_id, provider, source_type,
      source_reference_id, dimo_vehicle_id, is_active
    ) VALUES (
      'link-check-c2', 'veh-smoke-legacy',
      'DIMO', 'HIGH_MOBILITY', NULL, 'dimo-smoke-1', false
    );
    RAISE EXCEPTION 'C2_EXPECTED_REJECT';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'C2 reject OK';
  END;
END $$;

-- C3 PASS HIGH_MOBILITY/HIGH_MOBILITY + HM ref
INSERT INTO vehicle_data_source_links (
  id, vehicle_id, provider, source_type,
  source_reference_id, dimo_vehicle_id, is_active
) VALUES (
  'link-check-c3', 'veh-smoke-legacy',
  'HIGH_MOBILITY', 'HIGH_MOBILITY', 'hm-smoke-legacy', NULL, false
);

-- C4 PASS UNKNOWN/HIGH_MOBILITY + HM ref
INSERT INTO vehicle_data_source_links (
  id, vehicle_id, provider, source_type,
  source_reference_id, dimo_vehicle_id, is_active
) VALUES (
  'link-check-c4', 'veh-smoke-legacy',
  'UNKNOWN', 'HIGH_MOBILITY', 'hm-smoke-legacy', NULL, false
);

-- C5 REJECT UNKNOWN/DIMO
DO $$ BEGIN
  BEGIN
    INSERT INTO vehicle_data_source_links (
      id, vehicle_id, provider, source_type,
      source_reference_id, dimo_vehicle_id, is_active
    ) VALUES (
      'link-check-c5', 'veh-smoke-legacy',
      'UNKNOWN', 'DIMO', NULL, 'dimo-smoke-1', false
    );
    RAISE EXCEPTION 'C5_EXPECTED_REJECT';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'C5 reject OK';
  END;
END $$;

-- C6 REJECT FUTURE_PROVIDER/HIGH_MOBILITY
DO $$ BEGIN
  BEGIN
    INSERT INTO vehicle_data_source_links (
      id, vehicle_id, provider, source_type,
      source_reference_id, dimo_vehicle_id, is_active
    ) VALUES (
      'link-check-c6', 'veh-smoke-legacy',
      'FUTURE_PROVIDER', 'HIGH_MOBILITY', 'hm-smoke-legacy', NULL, false
    );
    RAISE EXCEPTION 'C6_EXPECTED_REJECT';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'C6 reject OK';
  END;
END $$;

-- C7 REJECT FUTURE_PROVIDER/FUTURE + dimo id
DO $$ BEGIN
  BEGIN
    INSERT INTO vehicle_data_source_links (
      id, vehicle_id, provider, source_type,
      source_reference_id, dimo_vehicle_id, is_active
    ) VALUES (
      'link-check-c7', 'veh-smoke-legacy',
      'FUTURE_PROVIDER', 'FUTURE', NULL, 'dimo-smoke-1', false
    );
    RAISE EXCEPTION 'C7_EXPECTED_REJECT';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'C7 reject OK';
  END;
END $$;

-- C8 REJECT both refs set
DO $$ BEGIN
  BEGIN
    INSERT INTO vehicle_data_source_links (
      id, vehicle_id, provider, source_type,
      source_reference_id, dimo_vehicle_id, is_active
    ) VALUES (
      'link-check-c8', 'veh-smoke-legacy',
      'DIMO', 'DIMO', 'hm-smoke-legacy', 'dimo-smoke-1', false
    );
    RAISE EXCEPTION 'C8_EXPECTED_REJECT';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'C8 reject OK';
  END;
END $$;

-- C9 REJECT DIMO/DIMO with neither reference
DO $$ BEGIN
  BEGIN
    INSERT INTO vehicle_data_source_links (
      id, vehicle_id, provider, source_type,
      source_reference_id, dimo_vehicle_id, is_active
    ) VALUES (
      'link-check-c9', 'veh-smoke-legacy',
      'DIMO', 'DIMO', NULL, NULL, false
    );
    RAISE EXCEPTION 'C9_EXPECTED_REJECT';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'C9 reject OK';
  END;
END $$;

-- C10 REJECT HM/HM with neither reference
DO $$ BEGIN
  BEGIN
    INSERT INTO vehicle_data_source_links (
      id, vehicle_id, provider, source_type,
      source_reference_id, dimo_vehicle_id, is_active
    ) VALUES (
      'link-check-c10', 'veh-smoke-legacy',
      'HIGH_MOBILITY', 'HIGH_MOBILITY', NULL, NULL, false
    );
    RAISE EXCEPTION 'C10_EXPECTED_REJECT';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'C10 reject OK';
  END;
END $$;

\echo '=== Partial unique active DIMO ==='
DO $$ BEGIN
  BEGIN
    INSERT INTO vehicle_data_source_links (
      id, vehicle_id, provider, source_type,
      source_reference_id, dimo_vehicle_id, is_active
    ) VALUES (
      'link-dimo-dup-active',
      'veh-smoke-legacy',
      'DIMO', 'DIMO',
      NULL, 'dimo-smoke-1',
      true
    );
    RAISE EXCEPTION 'PARTIAL_UNIQUE_EXPECTED_REJECT';
  EXCEPTION
    WHEN unique_violation THEN RAISE NOTICE 'Partial unique reject OK: %', SQLERRM;
  END;
END $$;

\echo '=== Inactive historical DIMO row may coexist ==='
INSERT INTO vehicle_data_source_links (
  id, vehicle_id, provider, source_type,
  source_reference_id, dimo_vehicle_id, is_active
) VALUES (
  'link-dimo-inactive-historical',
  'veh-smoke-legacy',
  'DIMO', 'DIMO',
  NULL, 'dimo-smoke-1',
  false
);

\echo '=== Generic unique interaction HM_HEALTH / HM_FULL / DIMO ==='
-- veh-smoke-legacy already has active UNKNOWN/HM_HEALTH
-- veh-smoke-dimo has active HM_FULL_TELEMETRY and active DIMO canonical
SELECT vehicle_id, provider, source_type, source_subtype, is_active, COUNT(*) AS cnt
FROM vehicle_data_source_links
WHERE vehicle_id IN ('veh-smoke-legacy', 'veh-smoke-dimo')
GROUP BY 1,2,3,4,5
ORDER BY 1,2,3,4,5;

\echo '=== ON DELETE RESTRICT dimo_vehicles ==='
DO $$ BEGIN
  BEGIN
    DELETE FROM dimo_vehicles WHERE id = 'dimo-smoke-1';
    RAISE EXCEPTION 'DIMO_DELETE_EXPECTED_RESTRICT';
  EXCEPTION
    WHEN foreign_key_violation THEN RAISE NOTICE 'DIMO delete restrict OK: %', SQLERRM;
  END;
END $$;

\echo '=== ON DELETE RESTRICT high_mobility_vehicles ==='
DO $$ BEGIN
  BEGIN
    DELETE FROM high_mobility_vehicles WHERE id = 'hm-smoke-legacy';
    RAISE EXCEPTION 'HM_DELETE_EXPECTED_RESTRICT';
  EXCEPTION
    WHEN foreign_key_violation THEN RAISE NOTICE 'HM delete restrict OK: %', SQLERRM;
  END;
END $$;

\echo 'POST_MIGRATION_TESTS_COMPLETE'
