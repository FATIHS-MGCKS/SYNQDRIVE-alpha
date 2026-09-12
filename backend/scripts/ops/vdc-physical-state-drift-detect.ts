#!/usr/bin/env npx ts-node
/**
 * READ-ONLY fleet drift detector for canonical physical OBD plug state.
 *
 * Detects vehicles where last canonical webhook OBD event disagrees with newer
 * per-signal VLS obdIsPluggedIn evidence (GT-R1 class drift).
 *
 * Dry-run only — no repairs, no projection mutations.
 */
import { Prisma, PrismaClient, DimoDeviceConnectionEventType } from '@prisma/client';

type DriftRow = {
  vehicle_id: string;
  organization_id: string;
  license_plate: string | null;
  last_event_type: string;
  last_event_observed_at: Date;
  vls_obd_value: boolean;
  vls_obd_timestamp: Date;
  projection_state: string | null;
  projection_evidence_at: Date | null;
  drift_kind: string;
};

function parseArgs(argv: string[]): { orgId?: string; limit: number } {
  let orgId: string | undefined;
  let limit = 50;
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--org') {
      orgId = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--limit') {
      limit = Number(argv[i + 1] ?? 50);
      i += 1;
    }
  }
  return { orgId, limit: Number.isFinite(limit) ? limit : 50 };
}

async function main(): Promise<void> {
  const { orgId, limit } = parseArgs(process.argv);
  const prisma = new PrismaClient();

  console.log('VDC physical-state drift detector (READ-ONLY / DRY-RUN)');
  console.log(`org filter: ${orgId ?? 'ALL'} | limit: ${limit}`);
  console.log('No mutations will be performed.\n');

  const orgFilter = orgId
    ? Prisma.sql`AND v.organization_id = ${orgId}::uuid`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<DriftRow[]>`
    WITH last_obd_events AS (
      SELECT DISTINCT ON (e.vehicle_id)
        e.vehicle_id,
        e.organization_id,
        e.event_type,
        e.observed_at AS last_event_observed_at
      FROM dimo_device_connection_events e
      WHERE e.event_type IN (
        ${DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED},
        ${DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN}
      )
      ORDER BY e.vehicle_id, e.observed_at DESC
    ),
    vls_obd AS (
      SELECT
        vls.vehicle_id,
        (vls.raw_payload_json->'obdIsPluggedIn'->>'value')::boolean AS obd_value,
        (vls.raw_payload_json->'obdIsPluggedIn'->>'timestamp')::timestamptz AS obd_timestamp
      FROM vehicle_latest_states vls
      WHERE vls.raw_payload_json ? 'obdIsPluggedIn'
        AND vls.raw_payload_json->'obdIsPluggedIn' ? 'timestamp'
        AND vls.raw_payload_json->'obdIsPluggedIn' ? 'value'
    )
    SELECT
      v.id AS vehicle_id,
      v.organization_id,
      v.license_plate,
      loe.event_type AS last_event_type,
      loe.last_event_observed_at,
      vo.obd_value AS vls_obd_value,
      vo.obd_timestamp AS vls_obd_timestamp,
      dps.effective_state::text AS projection_state,
      dps.evidence_observed_at AS projection_evidence_at,
      CASE
        WHEN loe.event_type = ${DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED}
          AND vo.obd_value = true
          AND vo.obd_timestamp > loe.last_event_observed_at
          THEN 'EVENT_UNPLUGGED_VLS_PLUGGED_NEWER'
        WHEN loe.event_type = ${DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN}
          AND vo.obd_value = false
          AND vo.obd_timestamp > loe.last_event_observed_at
          THEN 'EVENT_PLUGGED_VLS_UNPLUGGED_NEWER'
        ELSE 'NONE'
      END AS drift_kind
    FROM vehicles v
    INNER JOIN last_obd_events loe ON loe.vehicle_id = v.id
    INNER JOIN vls_obd vo ON vo.vehicle_id = v.id
    LEFT JOIN device_connection_physical_states dps
      ON dps.vehicle_id = v.id AND dps.provider = 'DIMO'
    WHERE vo.obd_timestamp IS NOT NULL
      AND (
        (loe.event_type = ${DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED}
          AND vo.obd_value = true
          AND vo.obd_timestamp > loe.last_event_observed_at)
        OR
        (loe.event_type = ${DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN}
          AND vo.obd_value = false
          AND vo.obd_timestamp > loe.last_event_observed_at)
      )
      ${orgFilter}
    ORDER BY vo.obd_timestamp DESC
    LIMIT ${limit}
  `;

  if (rows.length === 0) {
    console.log('No drift candidates found.');
    await prisma.$disconnect();
    return;
  }

  for (const row of rows) {
    console.log(
      JSON.stringify({
        vehicleId: row.vehicle_id,
        organizationId: row.organization_id,
        licensePlate: row.license_plate,
        driftKind: row.drift_kind,
        lastEventType: row.last_event_type,
        lastEventObservedAt: row.last_event_observed_at?.toISOString(),
        vlsObdValue: row.vls_obd_value,
        vlsObdTimestamp: row.vls_obd_timestamp?.toISOString(),
        projectionState: row.projection_state,
        projectionEvidenceAt: row.projection_evidence_at?.toISOString() ?? null,
      }),
    );
  }

  console.log(`\nTotal candidates: ${rows.length} (dry-run only)`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
