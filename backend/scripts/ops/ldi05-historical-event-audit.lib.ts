/**
 * LDI-05 — historical native DrivingEvent audit (read-only).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export const LDI05_ORG_ID = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';

export const LDI05_RUPTELA_VEHICLES = [
  '19fedd4b-c4e8-4de8-a125-dab293326e7e',
  'c10351f8-b6a2-4258-947f-631aeaa6d359',
  '8c850ff1-4201-432b-af2e-2711dbc7ca48',
] as const;

export type ManifestTrip = {
  tripId: string;
  vehicleId: string;
  workItemId: string;
};

export function loadManifestRuptelaTrips(repoRoot: string): ManifestTrip[] {
  const p = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/data/EXP021_P1_V2_MULTI_TRIP_MANIFEST_FROZEN_V1.json',
  );
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as { selected: ManifestTrip[] };
  return raw.selected.filter((s) => (LDI05_RUPTELA_VEHICLES as readonly string[]).includes(s.vehicleId));
}

export function buildLdi05ResultLines(audit: {
  pipelineImplemented: boolean;
  ingestionVerified: string;
  normalizationVerified: string;
  persistenceVerified: string;
  historicalNativeEventsFound: number;
  eventTripAlignment: string;
  rootCauseConfidence: string;
  fourStreamFusionReady: string;
}): string[] {
  return [
    'LDI05_RESULT=OFFLINE_PIPELINE_AND_DB_AUDIT_COMPLETE',
    `PIPELINE_IMPLEMENTED=${audit.pipelineImplemented ? 'YES_code_paths_exist' : 'NO'}`,
    `INGESTION_VERIFIED=${audit.ingestionVerified}`,
    `NORMALIZATION_VERIFIED=${audit.normalizationVerified}`,
    `PERSISTENCE_VERIFIED=${audit.persistenceVerified}`,
    `HISTORICAL_NATIVE_EVENTS_FOUND=${audit.historicalNativeEventsFound}`,
    `EVENT_TRIP_ALIGNMENT=${audit.eventTripAlignment}`,
    `ROOT_CAUSE_CONFIDENCE=${audit.rootCauseConfidence}`,
    `FOUR_STREAM_FUSION_READY=${audit.fourStreamFusionReady}`,
    'PRODUCTION_MUTATIONS=NONE',
    'NEXT_SAFE_ACTION=Pin_trip_with_nonzero_TELEMETRY_EVENTS_or_run_readonly_DIMO_dataSummary_on_owner_approved_window',
  ];
}
