-- Representative pre-VO-2 rows (schema before 20260930130000). Deterministic IDs for upgrade assertions.
\set ON_ERROR_STOP on

INSERT INTO organizations (id, company_name, business_type, created_at, updated_at)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'VO2 Legacy Upgrade Org',
  'RENTAL',
  '2024-06-15 10:00:00+00',
  '2024-06-15 10:00:00+00'
);

INSERT INTO vehicles (
  id, organization_id, vin, make, model, year, fuel_type, license_plate, created_at, updated_at
) VALUES
  (
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000001',
    'WVWZZZ1JZXW000001',
    'Volkswagen', 'Golf', 2022, 'GASOLINE', 'B-VO2-100',
    '2024-06-15 10:00:00+00', '2024-06-15 10:00:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000001',
    'DIMO-legacy-synth-001',
    'Tesla', 'Model 3', 2022, 'GASOLINE', NULL,
    '2024-06-15 10:00:00+00', '2024-06-15 10:00:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000013',
    '00000000-0000-4000-8000-000000000001',
    'WVWZZZ1JZXW000002',
    'Volkswagen', 'Golf', 2022, 'GASOLINE', 'B-VO2-200',
    '2024-06-15 10:00:00+00', '2024-06-15 10:00:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000014',
    '00000000-0000-4000-8000-000000000001',
    'WVWZZZ1JZXW000003',
    'Volkswagen', 'Golf', 2022, 'GASOLINE', NULL,
    '2024-06-15 10:00:00+00', '2024-06-15 10:00:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000015',
    '00000000-0000-4000-8000-000000000001',
    'WVWZZZ1JZXW000004',
    'Volkswagen', 'Golf', 2022, 'GASOLINE', NULL,
    '2024-06-15 10:00:00+00', '2024-06-15 10:00:00+00'
  );

INSERT INTO dimo_vehicles (
  id, external_id, vin, connection_status, created_at, updated_at
) VALUES (
  '00000000-0000-4000-8000-000000000021',
  'vo2-dimo-ext-001',
  'WVWZZZ1JZXW000001',
  'CONNECTED',
  '2024-06-15 10:00:00+00',
  '2024-06-15 10:00:00+00'
);

UPDATE vehicles SET dimo_vehicle_id = '00000000-0000-4000-8000-000000000021'
WHERE id = '00000000-0000-4000-8000-000000000011';

INSERT INTO vehicle_data_source_links (
  id, vehicle_id, provider, source_type, source_subtype, dimo_vehicle_id, is_active, activated_at
) VALUES (
  '00000000-0000-4000-8000-000000000031',
  '00000000-0000-4000-8000-000000000011',
  'DIMO',
  'DIMO',
  NULL,
  '00000000-0000-4000-8000-000000000021',
  true,
  '2024-06-15 10:00:00+00'
);

INSERT INTO high_mobility_vehicles (
  id, organization_id, synqdrive_vehicle_id, vin, brand, package_type, source_mode,
  clearance_status, is_active, created_at, updated_at
) VALUES (
  '00000000-0000-4000-8000-000000000041',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000013',
  'WVWZZZ1JZXW000002',
  'BMW',
  'HEALTH',
  'DIMO_PLUS_HM',
  'APPROVED',
  true,
  '2024-06-15 10:00:00+00',
  '2024-06-15 10:00:00+00'
);

INSERT INTO vehicle_data_source_links (
  id, vehicle_id, provider, source_type, source_subtype, source_reference_id, is_active, activated_at
) VALUES (
  '00000000-0000-4000-8000-000000000051',
  '00000000-0000-4000-8000-000000000013',
  'HIGH_MOBILITY',
  'HIGH_MOBILITY',
  'HM_HEALTH',
  '00000000-0000-4000-8000-000000000041',
  true,
  '2024-06-15 10:00:00+00'
);
