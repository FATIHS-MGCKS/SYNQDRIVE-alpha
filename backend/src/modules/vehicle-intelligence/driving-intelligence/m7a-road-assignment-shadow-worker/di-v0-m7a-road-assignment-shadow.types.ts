import type { Match, Outcome } from '../exp021-frozen-m7a';

export type DiV0M7aRoadAssignmentShadowRunStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'ROAD_CONTEXT_UNAVAILABLE';

export type DiV0M7aRoadAssignmentShadowBucketDto = {
  bucketLabelUtc: string;
  availability: string;
  outcome: Outcome;
  osmWayId: number | null;
  headingDeg: number | null;
  candidateWayIds: number[];
  ambiguityReasons: string[];
  pathMargin: number | null;
  /** Position anchor from pinned snapshot grid at persist time (not OSM way geometry). */
  latitude: number | null;
  longitude: number | null;
};

export type DiV0M7aRoadAssignmentShadowPayloadV1 = {
  contract: {
    bundleVersion: string;
    harnessModelId: string;
    researchSha: string;
    phase3LibSnapshotSha256: string;
    researchFreezeSha: string;
    osmSnapshotSha256: string;
    osmContextKey: string;
    pinnedSnapshotHash: string;
    combinedInputIdentity: string;
    computedAtUtc: string;
    processingCpuMs: number;
    geometryProjectionId: string;
  };
  buckets: DiV0M7aRoadAssignmentShadowBucketDto[];
  summary: {
    bucketCount: number;
    presentCount: number;
    confirmedCount: number;
    ambiguousCount: number;
    unknownCount: number;
    perBucketAssignmentHash: string;
  };
};

export type DiV0M7aRoadAssignmentShadowSummaryJson = {
  bundleVersion: string;
  discoveryIntentKey: string;
  runIntentKey: string;
  runStatus: 'SUCCEEDED' | 'FAILED' | 'ROAD_CONTEXT_UNAVAILABLE';
  osmSnapshotSha256: string | null;
  osmContextKey: string | null;
  processingCpuMs: number | null;
  perBucketAssignmentHash: string | null;
  contentFingerprint: string;
  errorCode?: string;
};

export function mapFrozenMatchToBucketDto(m: Match): DiV0M7aRoadAssignmentShadowBucketDto {
  return {
    bucketLabelUtc: m.bucketLabelUtc,
    availability: m.gpsStatus,
    outcome: m.outcome,
    osmWayId: m.osmWayId,
    headingDeg: m.headingDeg,
    candidateWayIds: m.candidateWayIds,
    ambiguityReasons: m.ambiguityReasons,
    pathMargin: m.pathMargin ?? null,
    latitude: null,
    longitude: null,
  };
}

export function enrichM7aBucketDtosWithPositionAnchors(
  dtos: DiV0M7aRoadAssignmentShadowBucketDto[],
  buckets: ReadonlyArray<{ bucketLabelUtc: string; availability: string; latitude: number | null; longitude: number | null }>,
): DiV0M7aRoadAssignmentShadowBucketDto[] {
  const byLabel = new Map(buckets.map((b) => [b.bucketLabelUtc, b]));
  return dtos.map((dto) => {
    const gps = byLabel.get(dto.bucketLabelUtc);
    if (!gps || gps.availability !== 'PRESENT') {
      return { ...dto, latitude: null, longitude: null };
    }
    const lat = gps.latitude;
    const lon = gps.longitude;
    if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return { ...dto, latitude: null, longitude: null };
    }
    return { ...dto, latitude: lat, longitude: lon };
  });
}
