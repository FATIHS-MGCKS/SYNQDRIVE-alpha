import { createHash } from 'crypto';
import {
  EXP021_FROZEN_M7A_HARNESS_MODEL_ID,
  EXP021_FROZEN_M7A_PHASE3_LIB_SNAPSHOT_SHA256,
  EXP021_FROZEN_M7A_RESEARCH_SHA,
} from '../exp021-frozen-m7a';
import { DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1 } from './di-v0-m7a-road-assignment-shadow.bundle.version';

export const DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_OSM_DATA_VERSION_ENV = 'DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_OSM_DATA_VERSION';

export function resolveM7aRoadAssignmentShadowOsmDataVersion(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const raw = env[DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_OSM_DATA_VERSION_ENV]?.trim();
  return raw && raw.length > 0 ? raw : 'DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_OSM_DATA_V1';
}

export function frozenM7aAlgorithmFingerprint(): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        model: EXP021_FROZEN_M7A_HARNESS_MODEL_ID,
        phase3Lib: EXP021_FROZEN_M7A_PHASE3_LIB_SNAPSHOT_SHA256,
        researchFreezeSha: EXP021_FROZEN_M7A_RESEARCH_SHA,
      }),
    )
    .digest('hex');
}

export function m7aRoadAssignmentShadowDiscoveryIntentDigestPayload(input: {
  pinnedSnapshotHash: string;
  combinedInputIdentity: string;
  osmDataVersion: string;
  bundleVersion?: string;
  algorithmFingerprint?: string;
}): string {
  return JSON.stringify({
    b: input.bundleVersion ?? DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1,
    a: input.algorithmFingerprint ?? frozenM7aAlgorithmFingerprint(),
    c: input.combinedInputIdentity,
    o: input.osmDataVersion,
    p: input.pinnedSnapshotHash,
  });
}

/**
 * PostgreSQL digest payload byte-identical to {@link m7aRoadAssignmentShadowDiscoveryIntentDigestPayload}.
 * Uses per-field `to_json(text)::text` + concat — NOT `json_build_object(...)::text` (differs from JSON.stringify).
 *
 * @param combinedInputIdentitySql column or parameter reference, e.g. `coalesce(wi.combined_input_identity, '')`
 * @param pinnedSnapshotHashSql column reference, e.g. `wi.pinned_snapshot_hash`
 */
export function m7aDiscoveryIntentDigestPayloadSqlFragment(input: {
  bundleVersionParam: string;
  algorithmFingerprintParam: string;
  osmDataVersionParam: string;
  combinedInputIdentitySql: string;
  pinnedSnapshotHashSql: string;
}): string {
  const { bundleVersionParam, algorithmFingerprintParam, osmDataVersionParam, combinedInputIdentitySql, pinnedSnapshotHashSql } =
    input;
  return `(
    '{"b":' || to_json(${bundleVersionParam}::text)::text ||
    ',"a":' || to_json(${algorithmFingerprintParam}::text)::text ||
    ',"c":' || to_json(${combinedInputIdentitySql})::text ||
    ',"o":' || to_json(${osmDataVersionParam}::text)::text ||
    ',"p":' || to_json(${pinnedSnapshotHashSql}::text)::text ||
    '}'
  )`;
}

export function m7aDiscoveryIntentKeyPrefixFromDigestSql(digestPayloadSql: string): string {
  return `'DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_INTENT_V1:sha256:' || encode(digest(${digestPayloadSql}, 'sha256'), 'hex')`;
}

/** Discovery intent (graph not yet resolved). */
export function buildM7aRoadAssignmentShadowDiscoveryIntentKey(input: {
  pinnedSnapshotHash: string;
  combinedInputIdentity: string;
  osmDataVersion: string;
  bundleVersion?: string;
}): string {
  const payload = m7aRoadAssignmentShadowDiscoveryIntentDigestPayload(input);
  return `DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_INTENT_V1:sha256:${createHash('sha256').update(payload).digest('hex')}`;
}

/** Persisted run intent includes resolved OSM graph snapshot hash. */
export function buildM7aRoadAssignmentShadowRunIntentKey(input: {
  discoveryIntentKey: string;
  osmSnapshotSha256: string;
}): string {
  const payload = JSON.stringify({
    d: input.discoveryIntentKey,
    g: input.osmSnapshotSha256,
  });
  return `DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_RUN_V1:sha256:${createHash('sha256').update(payload).digest('hex')}`;
}
