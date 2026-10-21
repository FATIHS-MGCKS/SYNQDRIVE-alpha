import { randomUUID } from 'crypto';
import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  S4_RESEARCH_GEOMETRY_PROJECTION_ID,
} from '../s4-research';
import { runRoadMatchingPipelineIsolated } from './di-v0-s4-research-pipeline-isolated';
import { verifyAndParseDiV0PinnedEvidenceSnapshot } from '../s4d-replay/di-v0-s4d-verified-snapshot';
import type { DiV0S4dSnapshotRow } from '../s4d-replay/di-v0-s4d-verified-snapshot';
import type { DiV0S4SourceFamily } from '../s4a-foundation/di-v0-s4a-contract';
import { DI_V0_S4_RESEARCH_BUNDLE_VERSION_V2 } from './di-v0-s4-research-bundle.version';
import { buildResearchGpsBucketsFromParsedContainer } from './di-v0-s4-research-snapshot-adapter';
import {
  summarizeShadowEvidenceCompleteness,
  type DiV0S4ResearchShadowBucketEvidence,
} from './di-v0-s4-research-shadow-evidence';
import {
  buildRoadContextFromOsmBody,
  corridorBboxFromBuckets,
  type DiV0S4ResearchOsmProvider,
} from './di-v0-s4-research-osm-context';

export const DI_V0_S4_RESEARCH_CORRIDOR_MARGIN_M = 75;

export type DiV0S4ResearchProcessInput = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  workItemId: string;
  boundaryFingerprint: string;
  snapshotHash: string;
  sourceFamily: string;
  combinedInputIdentity: string;
  snapshotRow: DiV0S4dSnapshotRow;
  shadowByBucket: ReadonlyMap<string, DiV0S4ResearchShadowBucketEvidence>;
  osmProvider: DiV0S4ResearchOsmProvider;
  pipelineDeadlineMs?: number;
  runDirectionAwareEmissionP1Shadow?: boolean;
};

export type DiV0S4ResearchPersistableRun =
  | {
      kind: 'ARTIFACT';
      id: string;
      researchStatus: 'SUCCEEDED';
      osmContextKey: string;
      osmSnapshotSha256: string;
      summaryJson: Record<string, unknown>;
      windowsJson: unknown;
    }
  | {
      kind: 'NEUTRAL';
      id: string;
      researchStatus: 'ROAD_CONTEXT_UNAVAILABLE' | 'SNAPSHOT_INVALID';
      osmContextKey: string | null;
      osmSnapshotSha256: string | null;
      summaryJson: Record<string, unknown>;
      windowsJson: unknown[];
    };

/** Async OSM resolve + V2 pipeline (never mutates S4 work items). */
export async function processDiV0S4ResearchRoadMatchingV2(
  input: DiV0S4ResearchProcessInput,
): Promise<DiV0S4ResearchPersistableRun> {
  const verified = verifyAndParseDiV0PinnedEvidenceSnapshot(input.snapshotRow, {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    boundaryFingerprint: input.boundaryFingerprint,
    snapshotHash: input.snapshotHash,
    sourceFamily: input.sourceFamily as DiV0S4SourceFamily,
  });
  if (!verified.ok) {
    return {
      kind: 'NEUTRAL',
      id: randomUUID(),
      researchStatus: 'SNAPSHOT_INVALID',
      osmContextKey: null,
      osmSnapshotSha256: null,
      summaryJson: {
        error: verified.code,
        independentRoadIdAccuracy: 'NOT_ASSESSABLE',
        researchBundleVersion: DI_V0_S4_RESEARCH_BUNDLE_VERSION_V2,
      },
      windowsJson: [],
    };
  }

  let buckets;
  try {
    buckets = buildResearchGpsBucketsFromParsedContainer(verified.parsed, input.shadowByBucket);
  } catch {
    return {
      kind: 'NEUTRAL',
      id: randomUUID(),
      researchStatus: 'SNAPSHOT_INVALID',
      osmContextKey: null,
      osmSnapshotSha256: null,
      summaryJson: {
        error: 'POSITION_PARSE_FAILED',
        independentRoadIdAccuracy: 'NOT_ASSESSABLE',
      },
      windowsJson: [],
    };
  }

  const bbox = corridorBboxFromBuckets(buckets, DI_V0_S4_RESEARCH_CORRIDOR_MARGIN_M);
  if (!bbox) {
    return {
      kind: 'NEUTRAL',
      id: randomUUID(),
      researchStatus: 'ROAD_CONTEXT_UNAVAILABLE',
      osmContextKey: null,
      osmSnapshotSha256: null,
      summaryJson: {
        reason: 'NO_FINITE_GPS_FOR_CORRIDOR',
        independentRoadIdAccuracy: 'NOT_ASSESSABLE',
      },
      windowsJson: [],
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
    return {
      kind: 'NEUTRAL',
      id: randomUUID(),
      researchStatus: 'ROAD_CONTEXT_UNAVAILABLE',
      osmContextKey: osm.osmContextKey,
      osmSnapshotSha256: null,
      summaryJson: {
        reason: 'ROAD_CONTEXT_UNAVAILABLE',
        osmMiss: osm.reason,
        corridorAnalysisScope:
          osm.reason === 'BBOX_TOO_LARGE' ? 'CORRIDOR_EXCEEDS_OSM_LIMIT' : 'FULL_CORRIDOR_REQUESTED',
        independentRoadIdAccuracy: 'NOT_ASSESSABLE',
        geometryProjectionId: S4_RESEARCH_GEOMETRY_PROJECTION_ID,
        researchBundleVersion: DI_V0_S4_RESEARCH_BUNDLE_VERSION_V2,
      },
      windowsJson: [],
    };
  }

  const evidenceCompleteness = summarizeShadowEvidenceCompleteness(
    buckets.map((b) => b.bucketLabelUtc),
    input.shadowByBucket,
  );

  const roadContext = buildRoadContextFromOsmBody(osm.overpassBody, buckets, DI_V0_S4_RESEARCH_CORRIDOR_MARGIN_M);
  const deadlineMs = input.pipelineDeadlineMs ?? 120_000;
  const pipeline = await runRoadMatchingPipelineIsolated(
    {
      buckets,
      roadContext,
      config: DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
      runDirectionAwareEmissionP1Shadow: input.runDirectionAwareEmissionP1Shadow === true,
    },
    deadlineMs,
  );

  return {
    kind: 'ARTIFACT',
    id: randomUUID(),
    researchStatus: 'SUCCEEDED',
    osmContextKey: osm.osmContextKey,
    osmSnapshotSha256: osm.osmSnapshotSha256,
    summaryJson: {
      ...pipeline.summary,
      algorithmIds: pipeline.algorithmIds,
      geometryProjectionId: S4_RESEARCH_GEOMETRY_PROJECTION_ID,
      researchBundleVersion: DI_V0_S4_RESEARCH_BUNDLE_VERSION_V2,
      combinedInputIdentity: input.combinedInputIdentity,
      pinnedSnapshotHash: input.snapshotHash,
      independentRoadIdAccuracy: 'NOT_ASSESSABLE',
      associatedIsNotGroundTruth: true,
      evidenceCompleteness,
    },
    windowsJson: pipeline.windows,
  };
}
