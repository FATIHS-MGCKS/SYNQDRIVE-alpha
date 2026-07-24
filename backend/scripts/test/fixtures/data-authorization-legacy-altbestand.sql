-- Representative legacy altbestand for data-authorization migration verification.
-- Loaded AFTER full `prisma migrate deploy` to simulate production legacy rows.

INSERT INTO organizations (
  id, company_name, business_type, status, created_at, updated_at
) VALUES (
  '00000000-0000-4000-8000-000000000101',
  'Legacy Data Auth Org',
  'RENTAL',
  'ACTIVE',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO org_data_authorizations (
  id,
  organization_id,
  title,
  requesting_entity,
  module_origin,
  purpose,
  scope,
  data_categories,
  destination,
  source_type,
  processor_type,
  risk_level,
  status,
  granted_at,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-8000-000000000110',
  '00000000-0000-4000-8000-000000000101',
  'Legacy DIMO Telematics',
  'Fleet Operations',
  'telematics',
  'fleet_monitoring',
  'ORGANIZATION',
  '["telematics_usage","trip_data"]'::jsonb,
  'DIMO',
  'DIMO',
  'EXTERNAL_PARTNER',
  'MEDIUM',
  'ACTIVE',
  NOW(),
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;
