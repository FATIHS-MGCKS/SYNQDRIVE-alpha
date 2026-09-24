import { Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { getBatteryV2ReconciliationIntervalMs } from '@config/battery-health-v2.config';
import {
  HV_E3_FALLBACK_CORROBORATING_SIGNAL_KEYS,
  HV_ERD_RECONCILE_CAPABILITY_QUERY_KEYS,
  HV_ERD_SIGNAL_KEYS,
} from '../hv-erd-capability-signal-keys';
import {
  computeHvRechargePeriodicFairnessFrame,
  type HvRechargePeriodicTargetCandidate,
} from './hv-recharge-periodic-target.policy';
import { isBatteryV2HvFallbackChargeSessionEnabled } from '@config/battery-health-v2.config';

const CAPABILITY_STATUSES = ['AVAILABLE', 'AVAILABLE_STALE'] as const;

const CORROBORATING_KEYS = [...HV_E3_FALLBACK_CORROBORATING_SIGNAL_KEYS];
const QUERY_SIGNAL_KEYS = [...HV_ERD_RECONCILE_CAPABILITY_QUERY_KEYS];

const ERD_EV_FUEL_TYPES = [
  'ELECTRIC',
  'HYBRID',
  'PLUGIN_HYBRID',
  'PHEV',
  'BEV',
] as const;

/** SQL fragment: fuel_type enum compared as text (never coerce NULL to enum). */
const SQL_ERD_EV_FUEL = Prisma.sql`fuel_type IS NOT NULL AND fuel_type::text IN (${Prisma.join(ERD_EV_FUEL_TYPES)})`;

/**
 * Bounded periodic reconcile target selection — eligibility + partition fairness in PostgreSQL.
 * Returns at most `batchSize` rows; no global fleet truncation before partition filter.
 */
export async function fetchHvRechargePeriodicReconcileTargets(
  prisma: PrismaService,
  batchSize: number,
  evaluatedAt: Date,
): Promise<HvRechargePeriodicTargetCandidate[]> {
  if (batchSize <= 0) return [];

  const frame = computeHvRechargePeriodicFairnessFrame({
    evaluatedAt,
    batchSize,
    intervalMs: getBatteryV2ReconciliationIntervalMs(),
  });
  const fallbackEnabled = isBatteryV2HvFallbackChargeSessionEnabled();

  const rows = await prisma.$queryRaw<
    Array<{
      vehicleId: string;
      organizationId: string;
      category: HvRechargePeriodicTargetCandidate['category'];
    }>
  >(Prisma.sql`
    WITH ongoing AS (
      SELECT
        h.vehicle_id AS vehicle_id,
        h.organization_id AS organization_id,
        0 AS cat
      FROM hv_charge_sessions h
      INNER JOIN vehicles v ON v.id = h.vehicle_id
      INNER JOIN dimo_vehicles d ON d.id = v.dimo_vehicle_id AND d.token_id IS NOT NULL
      WHERE h.is_ongoing = true
    ),
    cap_rows AS (
      SELECT
        c.vehicle_id,
        c.organization_id,
        c.signal_key,
        v.fuel_type
      FROM vehicle_battery_capabilities c
      INNER JOIN vehicles v ON v.id = c.vehicle_id
      INNER JOIN dimo_vehicles d ON d.id = v.dimo_vehicle_id AND d.token_id IS NOT NULL
      WHERE c.status::text IN (${Prisma.join(CAPABILITY_STATUSES)})
        AND c.signal_key IN (${Prisma.join(QUERY_SIGNAL_KEYS)})
    ),
    cap_agg AS (
      SELECT
        vehicle_id,
        organization_id,
        MAX(fuel_type) AS fuel_type,
        BOOL_OR(signal_key = ${HV_ERD_SIGNAL_KEYS.rechargeSegments}) AS has_native,
        BOOL_OR(signal_key = ${HV_ERD_SIGNAL_KEYS.soc}) AS has_soc,
        BOOL_OR(signal_key IN (${Prisma.join(CORROBORATING_KEYS)})) AS has_corroborating
      FROM cap_rows
      GROUP BY vehicle_id, organization_id
    ),
    cap_eligible AS (
      SELECT
        vehicle_id,
        organization_id,
        CASE
          WHEN has_native AND ${SQL_ERD_EV_FUEL}
            THEN 1
          WHEN has_soc
            AND has_corroborating
            AND ${fallbackEnabled}
            AND ${SQL_ERD_EV_FUEL}
            THEN 2
          ELSE NULL
        END AS cat
      FROM cap_agg
    ),
    combined AS (
      SELECT vehicle_id, organization_id, cat FROM ongoing
      UNION ALL
      SELECT vehicle_id, organization_id, cat FROM cap_eligible WHERE cat IS NOT NULL
    ),
    deduped AS (
      SELECT DISTINCT ON (vehicle_id)
        vehicle_id,
        organization_id,
        cat
      FROM combined
      ORDER BY vehicle_id, cat ASC
    ),
    partitioned AS (
      SELECT
        d.vehicle_id,
        d.organization_id,
        d.cat,
        (mod(
          (('x' || substr(md5(d.vehicle_id::text), 1, 8))::bit(32)::bigint & 4294967295),
          ${frame.partitionCount}
        ))::int AS vehicle_partition
      FROM deduped d
    ),
    in_active_partition AS (
      SELECT
        vehicle_id,
        organization_id,
        cat,
        CASE cat
          WHEN 0 THEN 'ongoing_hv_charge_session'
          WHEN 1 THEN 'native_recharge_capability'
          ELSE 'telemetry_fallback_capability'
        END AS category
      FROM partitioned
      WHERE vehicle_partition = ${frame.activePartition}
    ),
    ranked AS (
      SELECT
        vehicle_id,
        organization_id,
        category,
        ROW_NUMBER() OVER (ORDER BY cat ASC, vehicle_id ASC) AS rn,
        COUNT(*) OVER () AS partition_total
      FROM in_active_partition
    )
    SELECT
      vehicle_id AS "vehicleId",
      organization_id AS "organizationId",
      category AS "category"
    FROM ranked
    WHERE partition_total > 0
      AND (
        (rn - 1 - (mod((${frame.subRotation} * ${frame.batchSize})::bigint, partition_total)::int) + partition_total)
        % partition_total
      ) < ${frame.batchSize}
  `);

  return rows;
}

/**
 * Loads eligible candidates for diagnostics/tests — no maxScan truncation (E4.1).
 * Prefer fetchHvRechargePeriodicReconcileTargets for scheduler enqueue.
 */
export async function fetchHvRechargePeriodicTargetCandidates(
  prisma: PrismaService,
  _batchSize: number,
): Promise<HvRechargePeriodicTargetCandidate[]> {
  const fallbackEnabled = isBatteryV2HvFallbackChargeSessionEnabled();

  const rows = await prisma.$queryRaw<
    Array<{
      vehicleId: string;
      organizationId: string;
      category: HvRechargePeriodicTargetCandidate['category'];
    }>
  >(Prisma.sql`
    WITH ongoing AS (
      SELECT h.vehicle_id, h.organization_id, 0 AS cat
      FROM hv_charge_sessions h
      INNER JOIN vehicles v ON v.id = h.vehicle_id
      INNER JOIN dimo_vehicles d ON d.id = v.dimo_vehicle_id AND d.token_id IS NOT NULL
      WHERE h.is_ongoing = true
    ),
    cap_rows AS (
      SELECT c.vehicle_id, c.organization_id, c.signal_key, v.fuel_type
      FROM vehicle_battery_capabilities c
      INNER JOIN vehicles v ON v.id = c.vehicle_id
      INNER JOIN dimo_vehicles d ON d.id = v.dimo_vehicle_id AND d.token_id IS NOT NULL
      WHERE c.status::text IN (${Prisma.join(CAPABILITY_STATUSES)})
        AND c.signal_key IN (${Prisma.join(QUERY_SIGNAL_KEYS)})
    ),
    cap_agg AS (
      SELECT
        vehicle_id,
        organization_id,
        MAX(fuel_type) AS fuel_type,
        BOOL_OR(signal_key = ${HV_ERD_SIGNAL_KEYS.rechargeSegments}) AS has_native,
        BOOL_OR(signal_key = ${HV_ERD_SIGNAL_KEYS.soc}) AS has_soc,
        BOOL_OR(signal_key IN (${Prisma.join(CORROBORATING_KEYS)})) AS has_corroborating
      FROM cap_rows
      GROUP BY vehicle_id, organization_id
    ),
    cap_eligible AS (
      SELECT vehicle_id, organization_id,
        CASE
          WHEN has_native AND ${SQL_ERD_EV_FUEL}
            THEN 1
          WHEN has_soc AND has_corroborating AND ${fallbackEnabled} AND ${SQL_ERD_EV_FUEL}
            THEN 2
          ELSE NULL
        END AS cat
      FROM cap_agg
    ),
    combined AS (
      SELECT vehicle_id, organization_id, cat FROM ongoing
      UNION ALL
      SELECT vehicle_id, organization_id, cat FROM cap_eligible WHERE cat IS NOT NULL
    )
    SELECT DISTINCT ON (vehicle_id)
      vehicle_id AS "vehicleId",
      organization_id AS "organizationId",
      CASE cat
        WHEN 0 THEN 'ongoing_hv_charge_session'
        WHEN 1 THEN 'native_recharge_capability'
        ELSE 'telemetry_fallback_capability'
      END AS category
    FROM combined
    ORDER BY vehicle_id, cat ASC
  `);

  return rows;
}
