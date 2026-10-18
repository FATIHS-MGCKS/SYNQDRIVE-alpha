import { Prisma } from '@prisma/client';
import type { BatteryHvChargingCounterRevalidationCheckpoint } from '@prisma/client';

export type HvChargingCounterCheckpointUpsertInputV1 = {
  organizationId: string;
  vehicleId: string;
  segmentFingerprint: string;
  segmentStartAt: Date;
  segmentEndAt: Date | null;
  providerObservedAt: Date | null;
  queriedAt: Date;
  observationSetFingerprint: string;
};

type CheckpointRowRaw = {
  organization_id: string;
  vehicle_id: string;
  segment_fingerprint: string;
  segment_start_at: Date;
  segment_end_at: Date | null;
  provider_observed_at: Date | null;
  last_provider_query_at: Date;
  last_observation_set_fingerprint: string | null;
  updated_at: Date;
};

function mapCheckpointRow(row: CheckpointRowRaw): BatteryHvChargingCounterRevalidationCheckpoint {
  return {
    organizationId: row.organization_id,
    vehicleId: row.vehicle_id,
    segmentFingerprint: row.segment_fingerprint,
    segmentStartAt: row.segment_start_at,
    segmentEndAt: row.segment_end_at,
    providerObservedAt: row.provider_observed_at,
    lastProviderQueryAt: row.last_provider_query_at,
    lastObservationSetFingerprint: row.last_observation_set_fingerprint,
    updatedAt: row.updated_at,
  };
}

/**
 * P1.3 — single-statement monotonic checkpoint upsert (PostgreSQL).
 * `last_provider_query_at` never moves backwards; on equal timestamps incoming fingerprint wins (>=).
 */
export async function upsertRevalidationCheckpointAtomicallyV1(
  tx: Prisma.TransactionClient,
  input: HvChargingCounterCheckpointUpsertInputV1,
): Promise<BatteryHvChargingCounterRevalidationCheckpoint> {
  const rows = await tx.$queryRaw<CheckpointRowRaw[]>(Prisma.sql`
    INSERT INTO battery_hv_charging_counter_revalidation_checkpoints (
      organization_id,
      vehicle_id,
      segment_fingerprint,
      segment_start_at,
      segment_end_at,
      provider_observed_at,
      last_provider_query_at,
      last_observation_set_fingerprint,
      updated_at
    ) VALUES (
      ${input.organizationId}::uuid,
      ${input.vehicleId}::uuid,
      ${input.segmentFingerprint},
      ${input.segmentStartAt},
      ${input.segmentEndAt},
      ${input.providerObservedAt},
      ${input.queriedAt},
      ${input.observationSetFingerprint},
      NOW()
    )
    ON CONFLICT (organization_id, vehicle_id, segment_fingerprint)
    DO UPDATE SET
      segment_start_at = EXCLUDED.segment_start_at,
      segment_end_at = EXCLUDED.segment_end_at,
      provider_observed_at = EXCLUDED.provider_observed_at,
      last_provider_query_at = CASE
        WHEN EXCLUDED.last_provider_query_at >= battery_hv_charging_counter_revalidation_checkpoints.last_provider_query_at
        THEN EXCLUDED.last_provider_query_at
        ELSE battery_hv_charging_counter_revalidation_checkpoints.last_provider_query_at
      END,
      last_observation_set_fingerprint = CASE
        WHEN EXCLUDED.last_provider_query_at >= battery_hv_charging_counter_revalidation_checkpoints.last_provider_query_at
        THEN EXCLUDED.last_observation_set_fingerprint
        ELSE battery_hv_charging_counter_revalidation_checkpoints.last_observation_set_fingerprint
      END,
      updated_at = NOW()
    RETURNING
      organization_id,
      vehicle_id,
      segment_fingerprint,
      segment_start_at,
      segment_end_at,
      provider_observed_at,
      last_provider_query_at,
      last_observation_set_fingerprint,
      updated_at
  `);

  const row = rows[0];
  if (!row) {
    throw new Error('HV R22 checkpoint upsert returned no row');
  }
  return mapCheckpointRow(row);
}
