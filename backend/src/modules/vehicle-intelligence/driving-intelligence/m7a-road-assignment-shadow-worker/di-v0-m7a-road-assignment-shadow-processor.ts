import { createHash, randomUUID } from 'crypto';
import { gzipSync } from 'zlib';
import { S4_RESEARCH_GEOMETRY_PROJECTION_ID } from '../s4-research';
import type { DiV0S4ParsedEvidenceContainer } from '../s4a-foundation/di-v0-s4a-evidence-container-parse';
import type { DiV0S4SourceFamily } from '../s4a-foundation/di-v0-s4a-contract';
import { verifyAndParseDiV0PinnedEvidenceSnapshot } from '../s4d-replay/di-v0-s4d-verified-snapshot';
import type { DiV0S4dSnapshotRow } from '../s4d-replay/di-v0-s4d-verified-snapshot';
import { buildResearchGpsBucketsFromParsedContainer } from '../s4-research-worker/di-v0-s4-research-snapshot-adapter';
import {
  buildShadowEvidenceByBucket,
  type DiV0S4ResearchShadowBucketEvidence,
} from '../s4-research-worker/di-v0-s4-research-shadow-evidence';
import {
  buildRoadContextFromOsmBody,
  corridorBboxFromBuckets,
  type DiV0S4ResearchOsmProvider,
} from '../s4-research-worker/di-v0-s4-research-osm-context';
import { DI_V0_S4_RESEARCH_CORRIDOR_MARGIN_M } from '../s4-research-worker/di-v0-s4-research-processor';
import {
  EXP021_FROZEN_M7A_RESEARCH_SHA,
  EXP021_FROZEN_M7A_HARNESS_MODEL_ID,
  EXP021_FROZEN_M7A_PHASE3_LIB_SNAPSHOT_SHA256,
  perBucketAssignmentHash,
  runFrozenM7aIsolated,
} from '../exp021-frozen-m7a';
import { DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1 } from './di-v0-m7a-road-assignment-shadow.bundle.version';
import { DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_TUNING } from './di-v0-m7a-road-assignment-shadow.config';
import {
  buildM7aRoadAssignmentShadowDiscoveryIntentKey,
  buildM7aRoadAssignmentShadowRunIntentKey,
} from './di-v0-m7a-road-assignment-shadow-intent';
import {
  enrichM7aBucketDtosWithPositionAnchors,
  mapFrozenMatchToBucketDto,
  type DiV0M7aRoadAssignmentShadowPayloadV1,
  type DiV0M7aRoadAssignmentShadowSummaryJson,
} from './di-v0-m7a-road-assignment-shadow.types';

export type DiV0M7aRoadAssignmentShadowProcessInput = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  workItemId: string;
  boundaryFingerprint: string;
  snapshotHash: string;
  sourceFamily: DiV0S4SourceFamily;
  combinedInputIdentity: string;
  discoveryIntentKey: string;
  osmDataVersion: string;
  snapshotRow: DiV0S4dSnapshotRow;
  shadowByBucket: ReadonlyMap<string, DiV0S4ResearchShadowBucketEvidence>;
  osmProvider: DiV0S4ResearchOsmProvider;
  processingDeadlineMs?: number;
  computedAt?: Date;
};

export type DiV0M7aRoadAssignmentShadowProcessResult =
  | {
      kind: 'SUCCEEDED';
      runIntentKey: string;
      payload: DiV0M7aRoadAssignmentShadowPayloadV1;
      summary: DiV0M7aRoadAssignmentShadowSummaryJson;
      payloadGzip: Buffer;
      uncompressedBytes: number;
      contentFingerprint: string;
    }
  | {
      kind: 'ROAD_CONTEXT_UNAVAILABLE';
      runIntentKey: string;
      summary: DiV0M7aRoadAssignmentShadowSummaryJson;
    }
  | {
      kind: 'SNAPSHOT_INVALID';
      summary: DiV0M7aRoadAssignmentShadowSummaryJson;
    };

function fingerprintPayload(payload: DiV0M7aRoadAssignmentShadowPayloadV1): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export async function processDiV0M7aRoadAssignmentShadowTrip(
  input: DiV0M7aRoadAssignmentShadowProcessInput,
): Promise<DiV0M7aRoadAssignmentShadowProcessResult> {
  const computedAt = input.computedAt ?? new Date();
  const expectedDiscovery = buildM7aRoadAssignmentShadowDiscoveryIntentKey({
    pinnedSnapshotHash: input.snapshotHash,
    combinedInputIdentity: input.combinedInputIdentity,
    osmDataVersion: input.osmDataVersion,
  });
  if (expectedDiscovery !== input.discoveryIntentKey) {
    return {
      kind: 'SNAPSHOT_INVALID',
      summary: {
        bundleVersion: DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1,
        discoveryIntentKey: input.discoveryIntentKey,
        runIntentKey: '',
        runStatus: 'FAILED',
        osmSnapshotSha256: null,
        osmContextKey: null,
        processingCpuMs: null,
        perBucketAssignmentHash: null,
        contentFingerprint: '',
        errorCode: 'DISCOVERY_INTENT_MISMATCH',
      },
    };
  }

  const verified = verifyAndParseDiV0PinnedEvidenceSnapshot(input.snapshotRow, {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    boundaryFingerprint: input.boundaryFingerprint,
    snapshotHash: input.snapshotHash,
    sourceFamily: input.sourceFamily,
  });
  if (!verified.ok) {
    return {
      kind: 'SNAPSHOT_INVALID',
      summary: {
        bundleVersion: DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1,
        discoveryIntentKey: input.discoveryIntentKey,
        runIntentKey: '',
        runStatus: 'FAILED',
        osmSnapshotSha256: null,
        osmContextKey: null,
        processingCpuMs: null,
        perBucketAssignmentHash: null,
        contentFingerprint: '',
        errorCode: verified.code,
      },
    };
  }

  let buckets;
  try {
    buckets = buildResearchGpsBucketsFromParsedContainer(verified.parsed, input.shadowByBucket);
  } catch {
    return {
      kind: 'SNAPSHOT_INVALID',
      summary: {
        bundleVersion: DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1,
        discoveryIntentKey: input.discoveryIntentKey,
        runIntentKey: '',
        runStatus: 'FAILED',
        osmSnapshotSha256: null,
        osmContextKey: null,
        processingCpuMs: null,
        perBucketAssignmentHash: null,
        contentFingerprint: '',
        errorCode: 'POSITION_PARSE_FAILED',
      },
    };
  }

  const bbox = corridorBboxFromBuckets(buckets, DI_V0_S4_RESEARCH_CORRIDOR_MARGIN_M);
  if (!bbox) {
    const runIntentKey = buildM7aRoadAssignmentShadowRunIntentKey({
      discoveryIntentKey: input.discoveryIntentKey,
      osmSnapshotSha256: 'NO_GPS_CORRIDOR',
    });
    return {
      kind: 'ROAD_CONTEXT_UNAVAILABLE',
      runIntentKey,
      summary: {
        bundleVersion: DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1,
        discoveryIntentKey: input.discoveryIntentKey,
        runIntentKey,
        runStatus: 'ROAD_CONTEXT_UNAVAILABLE',
        osmSnapshotSha256: null,
        osmContextKey: null,
        processingCpuMs: null,
        perBucketAssignmentHash: null,
        contentFingerprint: createHash('sha256').update('NO_GPS_CORRIDOR').digest('hex'),
        errorCode: 'NO_FINITE_GPS_FOR_CORRIDOR',
      },
    };
  }

  const osm = await input.osmProvider.resolve({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    bbox,
    corridorMarginM: DI_V0_S4_RESEARCH_CORRIDOR_MARGIN_M,
  });

  if (osm.status === 'MISS') {
    const runIntentKey = buildM7aRoadAssignmentShadowRunIntentKey({
      discoveryIntentKey: input.discoveryIntentKey,
      osmSnapshotSha256: `MISS:${osm.reason}`,
    });
    return {
      kind: 'ROAD_CONTEXT_UNAVAILABLE',
      runIntentKey,
      summary: {
        bundleVersion: DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1,
        discoveryIntentKey: input.discoveryIntentKey,
        runIntentKey,
        runStatus: 'ROAD_CONTEXT_UNAVAILABLE',
        osmSnapshotSha256: null,
        osmContextKey: osm.osmContextKey,
        processingCpuMs: null,
        perBucketAssignmentHash: null,
        contentFingerprint: createHash('sha256').update(osm.reason).digest('hex'),
        errorCode: osm.reason,
      },
    };
  }

  const runIntentKey = buildM7aRoadAssignmentShadowRunIntentKey({
    discoveryIntentKey: input.discoveryIntentKey,
    osmSnapshotSha256: osm.osmSnapshotSha256,
  });

  const deadlineMs = input.processingDeadlineMs ?? DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_TUNING.maxProcessingMsPerTrip;
  let matches;
  let cpuMs: number;
  try {
    const decoded = await runFrozenM7aIsolated(
      {
        buckets,
        overpassBody: osm.overpassBody,
        corridorMarginM: DI_V0_S4_RESEARCH_CORRIDOR_MARGIN_M,
      },
      deadlineMs,
    );
    matches = decoded.matches;
    cpuMs = decoded.cpuMs;
  } catch (error) {
    const runIntentKey = buildM7aRoadAssignmentShadowRunIntentKey({
      discoveryIntentKey: input.discoveryIntentKey,
      osmSnapshotSha256: `DECODE_FAIL:${osm.osmSnapshotSha256}`,
    });
    const code = error instanceof Error ? error.message.slice(0, 120) : 'DECODE_FAILED';
    return {
      kind: 'ROAD_CONTEXT_UNAVAILABLE',
      runIntentKey,
      summary: {
        bundleVersion: DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1,
        discoveryIntentKey: input.discoveryIntentKey,
        runIntentKey,
        runStatus: 'ROAD_CONTEXT_UNAVAILABLE',
        osmSnapshotSha256: osm.osmSnapshotSha256,
        osmContextKey: osm.osmContextKey,
        processingCpuMs: null,
        perBucketAssignmentHash: null,
        contentFingerprint: createHash('sha256').update(code).digest('hex'),
        errorCode: code,
      },
    };
  }
  const bucketDtos = enrichM7aBucketDtosWithPositionAnchors(
    matches.map(mapFrozenMatchToBucketDto),
    buckets,
  );
  const assignmentHash = perBucketAssignmentHash(matches);
  const presentCount = buckets.filter((b) => b.availability === 'PRESENT').length;
  const confirmedCount = bucketDtos.filter((b) => b.outcome === 'CONFIRMED').length;
  const ambiguousCount = bucketDtos.filter((b) => b.outcome === 'AMBIGUOUS').length;
  const unknownCount = bucketDtos.filter((b) => b.outcome === 'UNKNOWN').length;

  const payload: DiV0M7aRoadAssignmentShadowPayloadV1 = {
    contract: {
      bundleVersion: DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1,
      harnessModelId: EXP021_FROZEN_M7A_HARNESS_MODEL_ID,
      researchSha: EXP021_FROZEN_M7A_RESEARCH_SHA,
      phase3LibSnapshotSha256: EXP021_FROZEN_M7A_PHASE3_LIB_SNAPSHOT_SHA256,
      researchFreezeSha: EXP021_FROZEN_M7A_RESEARCH_SHA,
      osmSnapshotSha256: osm.osmSnapshotSha256,
      osmContextKey: osm.osmContextKey,
      pinnedSnapshotHash: input.snapshotHash,
      combinedInputIdentity: input.combinedInputIdentity,
      computedAtUtc: computedAt.toISOString(),
      processingCpuMs: cpuMs,
      geometryProjectionId: S4_RESEARCH_GEOMETRY_PROJECTION_ID,
    },
    buckets: bucketDtos,
    summary: {
      bucketCount: bucketDtos.length,
      presentCount,
      confirmedCount,
      ambiguousCount,
      unknownCount,
      perBucketAssignmentHash: assignmentHash,
    },
  };

  const json = JSON.stringify(payload);
  const payloadGzip = gzipSync(Buffer.from(json, 'utf8'));
  const contentFingerprint = fingerprintPayload(payload);
  const summary: DiV0M7aRoadAssignmentShadowSummaryJson = {
    bundleVersion: DI_V0_M7A_ROAD_ASSIGNMENT_SHADOW_BUNDLE_VERSION_V1,
    discoveryIntentKey: input.discoveryIntentKey,
    runIntentKey,
    runStatus: 'SUCCEEDED',
    osmSnapshotSha256: osm.osmSnapshotSha256,
    osmContextKey: osm.osmContextKey,
    processingCpuMs: cpuMs,
    perBucketAssignmentHash: assignmentHash,
    contentFingerprint,
  };

  return {
    kind: 'SUCCEEDED',
    runIntentKey,
    payload,
    summary,
    payloadGzip,
    uncompressedBytes: json.length,
    contentFingerprint,
  };
}

/** Helper for tests: build shadow map from interval rows without DB. */
export function shadowMapFromIntervalRows(
  intervals: ReadonlyArray<{
    intervalStart: Date;
    estimatedSpeedKmh: number | null;
    motionState: string;
    speedEvidenceState: string | null;
    valueConfidence: string | null;
  }>,
): Map<string, DiV0S4ResearchShadowBucketEvidence> {
  return buildShadowEvidenceByBucket(intervals);
}

export function neutralRunId(): string {
  return randomUUID();
}
