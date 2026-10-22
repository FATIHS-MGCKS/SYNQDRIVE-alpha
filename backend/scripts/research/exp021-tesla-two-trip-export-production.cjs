/**
 * Read-only production export for EXP021 Tesla two-trip research (stdout JSON manifest paths as base64).
 * Run on VPS: cd /opt/synqdrive/current/backend && node scripts/research/exp021-tesla-two-trip-export-production.cjs
 */
const { PrismaClient } = require('@prisma/client');
const { gunzipSync } = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TRIPS = [
  {
    key: 'TRIP_1',
    tripId: '11f5a645-752e-4b8a-b20a-9f1fc3a6673e',
    vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
    pinnedSnapshotHash:
      'DI_V0_S4_EVIDENCE_V1:sha256:2af8f07a89e166d1e1e37089f525f1e4d52aecae79e15cbc7c92a9d2d7883884',
  },
  {
    key: 'TRIP_2',
    tripId: '0f8d2f76-9b09-4aba-8c56-fa7e2ce1c5a8',
    vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
    pinnedSnapshotHash:
      'DI_V0_S4_EVIDENCE_V1:sha256:45e5515fecf8e3f8744531915ee81f18964e610363d827ad7d297d6d41359338',
  },
];

const OUT = process.env.TESLA_RESEARCH_EXPORT_DIR || '/home/synqdrive-admin/exp021-tesla-two-trip-export';

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const prisma = new PrismaClient();
  const manifest = {
    productionSha: 'ec4de21ff195e29925b05abf8e499e0ab91c4240',
    exportedAtUtc: new Date().toISOString(),
    outDir: OUT,
    trips: [],
  };

  for (const t of TRIPS) {
    const snap = await prisma.$queryRawUnsafe(
      `SELECT id::text, organization_id::text, vehicle_id::text, trip_id::text, snapshot_hash,
              boundary_fingerprint, acquisition_window_start, acquisition_window_end,
              channel_manifest, payload_gzip, payload_bytes, uncompressed_bytes, created_at
       FROM di_v0_s4_evidence_snapshots WHERE trip_id::text = $1 AND snapshot_hash = $2`,
      t.tripId,
      t.pinnedSnapshotHash,
    );
    const row = snap[0];
    if (!row) throw new Error(`Snapshot missing ${t.tripId} ${t.pinnedSnapshotHash}`);

    const trip = await prisma.$queryRawUnsafe(
      `SELECT id::text, start_time, end_time, trip_status::text, start_detection_mode, end_detection_mode,
              dimo_segment_id, distance_km, duration_minutes, raw_detection_meta
       FROM vehicle_trips WHERE id::text = $1`,
      t.tripId,
    );
    const waypoints = await prisma.$queryRawUnsafe(
      `SELECT recorded_at, latitude, longitude, speed_kmh, heading
       FROM vehicle_trip_waypoints WHERE trip_id::text = $1 ORDER BY recorded_at`,
      t.tripId,
    );
    const route = await prisma.$queryRawUnsafe(
      `SELECT route_quality::text, source_point_count, match_confidence, match_coverage, algorithm_version,
              diagnostics_json, filtered_point_count, matched_point_count
       FROM vehicle_trip_route_artifacts WHERE trip_id::text = $1`,
      t.tripId,
    );
    const shadow = await prisma.$queryRawUnsafe(
      `SELECT id::text, status::text, started_at, completed_at, interval_count
       FROM di_v0_shadow_runs WHERE trip_id::text = $1 ORDER BY created_at DESC LIMIT 1`,
      t.tripId,
    );
    const wi = await prisma.$queryRawUnsafe(
      `SELECT id::text, status::text, created_at, completed_at, pinned_snapshot_hash
       FROM di_v0_s4_work_items WHERE trip_id::text = $1 AND run_purpose = 'PRIMARY' ORDER BY created_at DESC LIMIT 1`,
      t.tripId,
    );

    const gzipPath = path.join(OUT, `${t.key}_evidence_payload.gz`);
    fs.writeFileSync(gzipPath, Buffer.from(row.payload_gzip));
    const raw = gunzipSync(fs.readFileSync(gzipPath));
    const metaPath = path.join(OUT, `${t.key}_meta.json`);
    fs.writeFileSync(
      metaPath,
      JSON.stringify(
        {
          ...t,
          snapshot: {
            ...row,
            payload_gzip: undefined,
            payload_gzip_sha256: sha256(fs.readFileSync(gzipPath)),
            uncompressed_sha256: sha256(raw),
          },
          trip: trip[0],
          waypoints,
          routeArtifact: route[0] ?? null,
          shadowRun: shadow[0] ?? null,
          workItem: wi[0] ?? null,
        },
        null,
        2,
      ),
    );

    manifest.trips.push({
      key: t.key,
      tripId: t.tripId,
      gzipPath,
      metaPath,
      snapshotHash: row.snapshot_hash,
      gzipSha256: sha256(fs.readFileSync(gzipPath)),
      waypointCount: waypoints.length,
    });
  }

  const manifestPath = path.join(OUT, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
