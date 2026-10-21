-- PR #1290 smoke gate fixtures (Production-equivalent legacy HM + DIMO identities).

INSERT INTO organizations (id, name)
VALUES ('org-smoke-1290', 'Smoke Org 1290');

INSERT INTO vehicles (id, organization_id, vin, make, model, year)
VALUES ('veh-smoke-legacy', 'org-smoke-1290', 'WVWZZZ3CZWE123456', 'VW', 'Golf', 2020);

INSERT INTO high_mobility_vehicles (id, organization_id, vin, status)
VALUES ('hm-smoke-legacy', 'org-smoke-1290', 'WVWZZZ3CZWE123456', 'approved');

INSERT INTO vehicle_data_source_links (
  id,
  vehicle_id,
  provider,
  source_type,
  source_subtype,
  source_reference_id,
  is_active
) VALUES (
  'link-smoke-legacy-hm',
  'veh-smoke-legacy',
  'UNKNOWN',
  'HIGH_MOBILITY',
  'HM_HEALTH',
  'hm-smoke-legacy',
  true
);

INSERT INTO dimo_vehicles (id, external_id, token_id, vin, make, model, year)
VALUES ('dimo-smoke-1', 'dimo-ext-smoke-1', 9001290, 'WVWZZZ3CZWE654321', 'VW', 'ID.3', 2022);

INSERT INTO vehicles (id, organization_id, vin, make, model, year)
VALUES ('veh-smoke-dimo', 'org-smoke-1290', 'WVWZZZ3CZWE654321', 'VW', 'ID.3', 2022);
