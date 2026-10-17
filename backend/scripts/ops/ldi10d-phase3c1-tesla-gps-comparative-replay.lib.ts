/**
 * LDI-10D Phase 3C.1 — Tesla (DIMO 186946) manifest audit + comparative replay gate.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  reproduceVideoBaselineMetrics,
  VIDEO_BASELINE_EXPECTED,
  VIDEO_EVIDENCE,
  loadVideoComparison,
  verifyPhase3cPreflight,
} from './ldi10d-phase3c-gps-speed-research.lib';

export const TESLA_MANIFEST_REL =
  'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/pre-deploy/PRE_DEPLOY_BASELINE_MANIFEST.json';

export const TESLA_PROVENANCE_REL =
  'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/pre-deploy/PROVENANCE.json';

export const TESLA_REPLAY_REL =
  'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/pre-deploy/PRE_DEPLOY_PER_SECOND_REPLAY.json';

export const TESLA_SHA256SUMS_REL =
  'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/pre-deploy/SHA256SUMS';

export const TESLA_TRIP_ID = '358d0158-b2a9-47ed-af26-33926c5770b4';
export const TESLA_VEHICLE_ID = '68868291-5478-42cd-b0c4-cc77b2a78e21';
export const TESLA_DIMO_TOKEN = 186946;

export const POSITION_PAYLOAD_SHA256 =
  '2dbcf7c6eebea5cda15482efa4dde3297e4b39672c9d42529916cee1a76a45e2';

export type ManifestAudit = {
  manifestPath: string;
  tripId: string;
  vehicleId: string;
  dimoTokenId: number;
  productionShaAtCapture: string;
  analysisCodeShaAtCapture: string;
  repoHeadSha: string;
  timeWindow: { startUtc: string; endUtc: string; gridEndLabelUtc: string; expectedBucketCount: number };
  dataProvenance: {
    pinnedSnapshotHash: string;
    combinedInputIdentity: string;
    positionChannelPayloadSha256: string;
    positionPayloadCommittedInRepo: boolean;
    perSecondReplayCommitted: boolean;
    qcPolicyVersion: string;
  };
  checksums: {
    manifestSha256: string;
    perSecondReplaySha256: string | null;
    sha256sumsFileVerified: boolean;
  };
  artifactClassification: {
    raw: string[];
    derived: string[];
    hashOnlyReferences: string[];
  };
  gpsCoordinateAccessibility: {
    fullLatLonUtcInRepo: boolean;
    reproducibleWithoutNewProviderFetch: string;
    notes: string[];
  };
  videoTachoOverlap: {
    comparisonBucketCount: number;
    manifestGridAligned: boolean;
    tachoReadableBuckets: number;
    pairedTrustedL3Tacho: number;
    overlapWindowUtc: { first: string | null; last: string | null };
  };
  phaseBEligible: boolean;
  phaseBBlockers: string[];
};

function sha256File(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function verifySha256sums(repoRoot: string): { ok: boolean; manifest: string; replay: string } {
  const sumsPath = path.join(repoRoot, TESLA_SHA256SUMS_REL);
  const lines = fs.readFileSync(sumsPath, 'utf8').trim().split('\n');
  const expected = new Map<string, string>();
  for (const line of lines) {
    const [hash, name] = line.trim().split(/\s+/);
    if (hash && name) expected.set(name, hash);
  }
  const manifestName = 'PRE_DEPLOY_BASELINE_MANIFEST.json';
  const replayName = 'PRE_DEPLOY_PER_SECOND_REPLAY.json';
  const manifestPath = path.join(repoRoot, TESLA_MANIFEST_REL);
  const replayPath = path.join(repoRoot, TESLA_REPLAY_REL);
  const manifestHash = sha256File(manifestPath);
  const replayHash = sha256File(replayPath);
  const ok =
    expected.get(manifestName) === manifestHash && expected.get(replayName) === replayHash;
  return { ok, manifest: manifestHash, replay: replayHash };
}

export function auditTeslaManifest(repoRoot: string, repoHeadSha: string): ManifestAudit {
  const manifestPath = path.join(repoRoot, TESLA_MANIFEST_REL);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    productionSha: string;
    analysisCodeSha: string;
    policyVersions: { qcPolicyVersion: string };
    identities: {
      tripId: string;
      vehicleId: string;
      pinnedSnapshotHash: string;
      combinedInputIdentity: string;
    };
    referenceCampaign: { dimoTokenId: string };
    tripBoundaries: { startUtc: string; endUtc: string };
    boundaryReconciliation: {
      acquisitionGridEndLabel: string;
      perSecondRowCount: number;
    };
    forensicReplay: {
      channelManifest: Array<{ channel: string; payloadSha256: string | null }>;
    };
  };

  const sums = verifySha256sums(repoRoot);
  const replayPath = path.join(repoRoot, TESLA_REPLAY_REL);
  const replayExists = fs.existsSync(replayPath);
  const replay = replayExists
    ? (JSON.parse(fs.readFileSync(replayPath, 'utf8')) as Array<{ bucketLabelUtc: string }>)
    : [];

  const positionPayloadInRepo = fs.existsSync(
    path.join(repoRoot, `architecture/drivingintelligence/evidence/data/position-${POSITION_PAYLOAD_SHA256}.json`),
  );

  const comparison = loadVideoComparison(repoRoot);
  const tachoReadable = comparison.filter((r) => r.tachoKmh != null).length;
  const paired = reproduceVideoBaselineMetrics(comparison);

  const firstCmp = comparison[0]?.bucketLabelUtc ?? null;
  const lastCmp = comparison[comparison.length - 1]?.bucketLabelUtc ?? null;
  const gridAligned =
    firstCmp === '2026-10-16T03:36:00Z' &&
    replay.length === manifest.boundaryReconciliation.perSecondRowCount &&
    comparison.length === manifest.boundaryReconciliation.perSecondRowCount;

  const blockers: string[] = [];
  if (!positionPayloadInRepo) {
    blockers.push(
      `POSITION channel payload sha256=${POSITION_PAYLOAD_SHA256} not committed; only hash in manifest.`,
    );
  }
  if (!replayExists) {
    blockers.push('PRE_DEPLOY_PER_SECOND_REPLAY.json missing');
  }

  const phaseBEligible = blockers.length === 0;

  return {
    manifestPath: TESLA_MANIFEST_REL,
    tripId: manifest.identities.tripId,
    vehicleId: manifest.identities.vehicleId,
    dimoTokenId: Number(manifest.referenceCampaign.dimoTokenId),
    productionShaAtCapture: manifest.productionSha,
    analysisCodeShaAtCapture: manifest.analysisCodeSha,
    repoHeadSha,
    timeWindow: {
      startUtc: manifest.tripBoundaries.startUtc,
      endUtc: manifest.tripBoundaries.endUtc,
      gridEndLabelUtc: manifest.boundaryReconciliation.acquisitionGridEndLabel,
      expectedBucketCount: manifest.boundaryReconciliation.perSecondRowCount,
    },
    dataProvenance: {
      pinnedSnapshotHash: manifest.identities.pinnedSnapshotHash,
      combinedInputIdentity: manifest.identities.combinedInputIdentity,
      positionChannelPayloadSha256: POSITION_PAYLOAD_SHA256,
      positionPayloadCommittedInRepo: positionPayloadInRepo,
      perSecondReplayCommitted: replayExists,
      qcPolicyVersion: manifest.policyVersions.qcPolicyVersion,
    },
    checksums: {
      manifestSha256: sums.manifest,
      perSecondReplaySha256: replayExists ? sums.replay : null,
      sha256sumsFileVerified: sums.ok,
    },
    artifactClassification: {
      raw: [
        'S4 pinned snapshot (DB/cold-store at capture; POSITION payload not in git)',
        'DIMO historical location 1s AVG query family (documented in supplements)',
      ],
      derived: [
        TESLA_REPLAY_REL,
        VIDEO_EVIDENCE.comparisonRel,
        'review-bundle/PRE_DEPLOY_PER_SECOND_REPLAY.json (kompakt bundle copy)',
      ],
      hashOnlyReferences: [
        `POSITION payloadSha256 ${POSITION_PAYLOAD_SHA256}`,
        manifest.identities.pinnedSnapshotHash,
        manifest.identities.combinedInputIdentity,
      ],
    },
    gpsCoordinateAccessibility: {
      fullLatLonUtcInRepo: false,
      reproducibleWithoutNewProviderFetch:
        'PARTIAL — per-second QC/L3/abstention replay in git; lat/lon requires read-only S4 POSITION payload rehydrate from Production evidence store (not committed) or owner-authorized export',
      notes: [
        'pre-deploy README: no coordinates in per-second export',
        'POSITION_SNAPSHOT_INPUT_AUDIT_SUPPLEMENT_V2.json: bucket availability only, no lat/lon array',
        'comparison.json coordinatesOcr is iPhone screen OCR — not DIMO GPS authority',
      ],
    },
    videoTachoOverlap: {
      comparisonBucketCount: comparison.length,
      manifestGridAligned: gridAligned,
      tachoReadableBuckets: tachoReadable,
      pairedTrustedL3Tacho: paired.n,
      overlapWindowUtc: { first: firstCmp, last: lastCmp },
    },
    phaseBEligible,
    phaseBBlockers: blockers,
  };
}

export type Phase3c1Decision = {
  MANIFEST_USABLE: 'YES' | 'NO';
  GPS_COORDINATES_AVAILABLE: 'YES' | 'NO' | 'PARTIAL';
  INDEPENDENT_GROUND_TRUTH_AVAILABLE: 'YES' | 'PARTIAL' | 'NO';
  ALGORITHMS_REPLAYED: 'YES' | 'NO' | 'BASELINE_ONLY';
  BASELINE_REPRODUCED: 'YES' | 'NO';
  BEST_VALIDATED_CANDIDATE: string;
  ACCURACY_IMPROVEMENT_PROVEN: 'YES' | 'NO' | 'NOT_ASSESSABLE';
  NEXT_SAFE_ACTION: string;
  baselineMaeKmh: number | null;
  baselineP95Kmh: number | null;
  baselineBiasKmh: number | null;
  historicalBaselineReproduced: boolean;
};

export function buildPhase3c1Decision(audit: ManifestAudit, repoRoot: string): Phase3c1Decision {
  const comparison = loadVideoComparison(repoRoot);
  const baseline = reproduceVideoBaselineMetrics(comparison);
  const historicalBaselineReproduced =
    baseline.n === VIDEO_BASELINE_EXPECTED.pairedN &&
    baseline.maeKmh != null &&
    Math.abs(baseline.maeKmh - VIDEO_BASELINE_EXPECTED.maeKmh) <= VIDEO_BASELINE_EXPECTED.toleranceMae;

  const manifestUsable =
    audit.checksums.sha256sumsFileVerified &&
    audit.tripId === TESLA_TRIP_ID &&
    audit.dimoTokenId === TESLA_DIMO_TOKEN;

  return {
    MANIFEST_USABLE: manifestUsable ? 'YES' : 'NO',
    GPS_COORDINATES_AVAILABLE: audit.gpsCoordinateAccessibility.fullLatLonUtcInRepo ? 'YES' : 'NO',
    INDEPENDENT_GROUND_TRUTH_AVAILABLE:
      audit.videoTachoOverlap.pairedTrustedL3Tacho >= 700 ? 'YES' : 'PARTIAL',
    ALGORITHMS_REPLAYED: audit.phaseBEligible ? 'YES' : 'BASELINE_ONLY',
    BASELINE_REPRODUCED: historicalBaselineReproduced ? 'YES' : 'NO',
    BEST_VALIDATED_CANDIDATE: 'L3_BASELINE_PRODUCTION',
    ACCURACY_IMPROVEMENT_PROVEN: 'NOT_ASSESSABLE',
    NEXT_SAFE_ACTION: audit.phaseBEligible
      ? 'Owner_review_phase3c1_comparative_matrix'
      : 'Owner_authorize_commit_or_readonly_rehydrate_POSITION_payload_sha256_2dbcf7c6_before_seven_algorithm_GPS_replay',
    baselineMaeKmh: baseline.maeKmh,
    baselineP95Kmh: baseline.p95AbsKmh,
    baselineBiasKmh: baseline.biasKmh,
    historicalBaselineReproduced,
  };
}

export function verifyPhase3c1Preflight(repoRoot: string): ReturnType<typeof verifyPhase3cPreflight> {
  return verifyPhase3cPreflight(repoRoot);
}
