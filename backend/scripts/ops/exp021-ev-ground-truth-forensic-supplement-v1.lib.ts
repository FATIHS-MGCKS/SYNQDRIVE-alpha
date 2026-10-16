import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseDiV0PositionSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-snapshot-parse';
import { DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-acquisition.versions';
import type { P21ForensicLoadedContext } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import type { DiV0S4SourceFamily } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-contract';
import { verifyAndParseDiV0PinnedEvidenceSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4d-replay/di-v0-s4d-verified-snapshot';
import { buildEvGroundTruthPerSecondReplay } from './exp021-ev-ground-truth-baseline.lib';
import {
  EXP021_EV_GT_REFERENCE,
  exportForensicBucket,
  type EvGtForensicBucketExport,
} from './exp021-ev-ground-truth-forensic-export.lib';
import type { DiV0TripSpeedQualityShadowRow } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/build-di-v0-trip-speed-quality-projection.v1';
import { dateToBucketLabel } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-classify';
import type { DiV0SpeedQcPositionSample } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc.types';

export const BASELINE_EXECUTION_SHA = 'a0ce01f192d888974e49c2558ee05e534f3dfeea';

export const VIDEO_ANCHOR = {
  firstVisibleClockLabelUtc: '2026-10-16T03:37:41Z',
  semantics:
    'First visible on-screen clock label (Europe/Berlin 05:37:41). Not video PTS=0. Owner reports reverse maneuver as departure; exact first physical motion frame NOT calibrated.',
} as const;

export const TACHO_ZERO_125_WINDOWS_UTC: Array<{ from: string; to: string; label: string }> = [
  { label: 'halt_window_1', from: '2026-10-16T03:40:19Z', to: '2026-10-16T03:40:49Z' },
  { label: 'halt_window_2', from: '2026-10-16T03:41:50Z', to: '2026-10-16T03:42:29Z' },
  { label: 'halt_window_3', from: '2026-10-16T03:42:50Z', to: '2026-10-16T03:42:57Z' },
  { label: 'halt_window_4', from: '2026-10-16T03:43:43Z', to: '2026-10-16T03:44:02Z' },
  { label: 'halt_window_5', from: '2026-10-16T03:44:10Z', to: '2026-10-16T03:44:35Z' },
];

export function sha256Hex(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function loadKompaktTachoZeroSeconds(repoRoot: string): {
  all135: string[];
  subset125: string[];
  extra10: string[];
} {
  const comparisonPath = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/external-video-review-kompakt-2026-10-16/analysis/results/comparison.json',
  );
  const rows = JSON.parse(fs.readFileSync(comparisonPath, 'utf8')) as Array<{
    bucketLabelUtc?: string;
    tachoKmh?: number | null;
  }>;
  const all135 = [
    ...new Set(rows.filter((r) => r.tachoKmh === 0).map((r) => r.bucketLabelUtc).filter(Boolean)),
  ].sort() as string[];
  const in125 = (s: string): boolean =>
    TACHO_ZERO_125_WINDOWS_UTC.some((w) => s >= w.from && s <= w.to);
  const subset125 = all135.filter(in125);
  const extra10 = all135.filter((s) => !in125(s));
  return { all135, subset125, extra10 };
}

export function decodeDimoSegmentId(segmentId: string): {
  tokenId: number | null;
  startMs: number | null;
  startUtc: string | null;
} {
  const m = /^dimo-seg-(\d+)-(\d+)$/.exec(segmentId);
  if (!m) return { tokenId: null, startMs: null, startUtc: null };
  const tokenId = Number(m[1]);
  const startMs = Number(m[2]);
  if (!Number.isFinite(tokenId) || !Number.isFinite(startMs)) {
    return { tokenId: null, startMs: null, startUtc: null };
  }
  return { tokenId, startMs, startUtc: new Date(startMs).toISOString() };
}

export type PositionBucketForensic = {
  bucketLabelUtc: string;
  availability: string;
  providerRowCount: number;
  coordinateStatus: string;
  temporalConfidence: string;
  provenanceDerivedFrom: string[];
  snapshotProviderSignalsNull: boolean;
};

export function parsePinnedPositionBucketsFromSnapshotRow(
  snapshot: {
    organization_id: string;
    vehicle_id: string;
    trip_id: string;
    boundary_fingerprint: string;
    acquisition_window_start: Date;
    acquisition_window_end: Date;
    channel_manifest: unknown;
    payload_gzip: Buffer;
    uncompressed_bytes: number | bigint;
  },
  pinnedSnapshotHash: string,
  sourceFamily: DiV0S4SourceFamily,
): Map<string, PositionBucketForensic> {
  const verified = verifyAndParseDiV0PinnedEvidenceSnapshot(snapshot, {
    organizationId: snapshot.organization_id,
    vehicleId: snapshot.vehicle_id,
    tripId: snapshot.trip_id,
    boundaryFingerprint: snapshot.boundary_fingerprint,
    snapshotHash: pinnedSnapshotHash,
    sourceFamily,
  });
  if (!verified.ok) return new Map();
  const posEntry = verified.parsed.channelManifest.find((c) => c.channel === 'POSITION');
  const payload = verified.parsed.channelPayloads.POSITION;
  const out = new Map<string, PositionBucketForensic>();
  if (!payload || posEntry?.formatVersion !== DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1) {
    return out;
  }
  const material = parseDiV0PositionSnapshot(payload);
  for (const b of material.buckets) {
    out.set(b.bucketLabel, {
      bucketLabelUtc: b.bucketLabel,
      availability: b.availability,
      providerRowCount: b.providerRowCount,
      coordinateStatus: b.coordinateStatus,
      temporalConfidence: b.temporalConfidence,
      provenanceDerivedFrom: [...(b.observation.provenance?.derivedFrom ?? [])],
      snapshotProviderSignalsNull: material.providerSignalsNull,
    });
  }
  return out;
}

export function classifyRowAbsentEarliestLayer(
  pos: PositionBucketForensic | undefined,
): {
  earliestDemonstrableLayer: string;
  epistemic: 'CONFIRMED' | 'INFERRED' | 'UNKNOWN';
  note: string;
} {
  if (!pos) {
    return {
      earliestDemonstrableLayer: 'S4_PINNED_SNAPSHOT',
      epistemic: 'UNKNOWN',
      note: 'Bucket missing from parsed POSITION snapshot material.',
    };
  }
  if (pos.availability !== 'ROW_ABSENT') {
    return {
      earliestDemonstrableLayer: 'S4_PINNED_SNAPSHOT',
      epistemic: 'CONFIRMED',
      note: `Availability=${pos.availability} at S4 pin (not ROW_ABSENT).`,
    };
  }
  const derived = pos.provenanceDerivedFrom;
  if (derived.some((d) => d.includes('EXPECTED_GRID_ROW_ABSENT'))) {
    return {
      earliestDemonstrableLayer: 'S3A_NORMALIZATION_GRID',
      epistemic: 'CONFIRMED',
      note:
        'Pinned snapshot records ROW_ABSENT with EXPECTED_GRID_ROW_ABSENT derivation (no coordinate at bucket). Does not alone prove DIMO provider outage — only that acquisition/normalization produced an explicit absent grid cell.',
    };
  }
  return {
    earliestDemonstrableLayer: 'S4_PINNED_SNAPSHOT',
    epistemic: 'INFERRED',
    note: 'ROW_ABSENT without EXPECTED_GRID_ROW_ABSENT marker in exported provenance slice.',
  };
}

export function buildTachoZeroRowAbsentReport(input: {
  labels: string[];
  subsetTag: 'ALL_135' | 'SUBSET_125' | 'EXTRA_10';
  perSecond: ReturnType<typeof buildEvGroundTruthPerSecondReplay>;
  positionByLabel: Map<string, PositionBucketForensic>;
  ctx: P21ForensicLoadedContext;
  shadowMap: Map<string, DiV0TripSpeedQualityShadowRow>;
  posQc: Map<string, DiV0SpeedQcPositionSample>;
}): Record<string, unknown> {
  const rows = input.labels.map((label) => {
    const replay = input.perSecond.find((r) => r.bucketLabelUtc === label);
    const pos = input.positionByLabel.get(label);
    const layer = classifyRowAbsentEarliestLayer(pos);
    const forensic = exportForensicBucket(
      label,
      input.ctx,
      input.shadowMap.get(label),
      input.posQc,
    );
    return {
      bucketLabelUtc: label,
      subsetTag: input.subsetTag,
      videoTachoKmh: 0,
      replay: replay
        ? {
            positionAvailability: replay.positionAvailability,
            motionState: replay.motionState,
            qcTrustLevel: replay.qcTrustLevel,
            qcReasonCodes: replay.qcReasonCodes,
            l3SpeedKmh: replay.l3SpeedKmh,
          }
        : null,
      s4PositionBucket: pos ?? null,
      rowAbsentChain: layer,
      s1QcForensic: forensic,
    };
  });

  const rowAbsentCount = rows.filter((r) => r.replay?.positionAvailability === 'ROW_ABSENT').length;
  const presentCount = rows.filter((r) => r.replay?.positionAvailability === 'PRESENT').length;

  return {
    subsetTag: input.subsetTag,
    annotatedTachoZeroSecondCount: input.labels.length,
    replayRowAbsentCount: rowAbsentCount,
    replayPresentCount: presentCount,
    buckets: rows,
    interpretationGuard:
      'Replay ROW_ABSENT reflects pinned S4 POSITION snapshot semantics. Provider ingest failure is NOT proven from replay alone.',
  };
}

export function segmentIdGenerationCodePath(): Record<string, unknown> {
  return {
    epistemic: 'CONFIRMED',
    source: 'repository:backend/src/modules/dimo/dimo-segments.service.ts',
    buildSegmentId: 'dimo-seg-${tokenId}-${new Date(startTimestamp).getTime()}',
    parseTripSegment:
      'segmentId assigned from provider segment.start.timestamp via buildSegmentId (GraphQL TripSegments query at trip creation time — payload not re-fetched in this task).',
    selectConfirmedStartSegment:
      'repository:backend/src/modules/vehicle-intelligence/trips/start-boundary-window.util.ts — chooses segment overlapping candidate..confirmed window; rejects startedBeforeRange when true.',
    resolveConfirmedStartBoundary:
      'repository:backend/src/modules/vehicle-intelligence/trips/trip-detection-orchestration.service.ts — DIMO segment preferred over route/core refinement.',
  };
}

export const REF = EXP021_EV_GT_REFERENCE;
