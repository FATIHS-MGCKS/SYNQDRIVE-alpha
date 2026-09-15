import { createHash } from 'node:crypto';
import type { PhysicalAuthorityScope } from './device-connection-physical-authority-cutover.repository';
import {
  canonicalizeCutoverEvidencePayload,
  hashCanonicalCutoverEvidencePayload,
} from './physical-state-cutover-evidence.canonical';
import { signEd25519Payload } from './physical-state-cutover-evidence.crypto';
import {
  PHYSICAL_STATE_CUTOVER_EVIDENCE_ALGORITHM,
  PHYSICAL_STATE_CUTOVER_EVIDENCE_SCHEMA_VERSION,
  PhysicalStateCutoverEvidencePayloadV1,
  SignedPhysicalStateCutoverEvidenceBundle,
} from './physical-state-cutover-evidence.types';

export function computeMixedReplicaPeerSetDigest(buildIds: readonly string[]): string {
  const sorted = [...new Set(buildIds.map((id) => id.trim()).filter(Boolean))].sort();
  return createHash('sha256').update(sorted.join('|'), 'utf8').digest('hex');
}

export function signPhysicalStateCutoverEvidenceBundle(input: {
  keyId: string;
  privateKeyPem: string;
  payload: PhysicalStateCutoverEvidencePayloadV1;
}): SignedPhysicalStateCutoverEvidenceBundle & { payloadCanonicalSha256: string } {
  const canonical = canonicalizeCutoverEvidencePayload(input.payload);
  const signature = signEd25519Payload(Buffer.from(canonical, 'utf8'), input.privateKeyPem);
  const payloadCanonicalSha256 = hashCanonicalCutoverEvidencePayload(input.payload);
  return {
    schemaVersion: PHYSICAL_STATE_CUTOVER_EVIDENCE_SCHEMA_VERSION,
    algorithm: PHYSICAL_STATE_CUTOVER_EVIDENCE_ALGORITHM,
    keyId: input.keyId,
    payload: input.payload,
    signature,
    payloadCanonicalSha256,
  };
}

export function buildDefaultCutoverEvidencePayload(
  scope: PhysicalAuthorityScope,
  options: {
    bundleId: string;
    issuer: string;
    issuedAt: Date;
    expiresAt: Date;
    capableBuildId: string;
    peerBuildIds?: readonly string[];
    fleetReplicaCount?: number;
    preseedExecutedAt?: Date;
    unexplainedWindowStart?: Date;
    unexplainedWindowEnd?: Date;
    comparisonCount?: number;
  },
): PhysicalStateCutoverEvidencePayloadV1 {
  const issuedAt = options.issuedAt.toISOString();
  const expiresAt = options.expiresAt.toISOString();
  const preseedExecutedAt = (options.preseedExecutedAt ?? options.issuedAt).toISOString();
  const windowEnd = options.unexplainedWindowEnd ?? options.issuedAt;
  const windowStart =
    options.unexplainedWindowStart ??
    new Date(windowEnd.getTime() - 8 * 24 * 60 * 60 * 1000);
  const fleetReplicaCount = Math.max(1, options.fleetReplicaCount ?? 1);
  const replicas = Array.from({ length: fleetReplicaCount }, (_, index) => ({
    replicaId: index === 0 ? 'request-a' : `request-peer-${index}`,
    buildId: options.capableBuildId,
    role: 'REQUEST' as const,
    port: index === 0 ? 3001 : 3002,
  }));
  const replicaBuildIds = replicas.map((replica) => replica.buildId);

  const artifact = (
    artifactId: string,
    observedAt: string,
    result: string,
  ) => ({
    artifactId,
    sha256: createHash('sha256').update(`${artifactId}:${observedAt}:${result}`).digest('hex'),
    observedAt,
    result,
    scope,
  });

  return {
    bundleId: options.bundleId,
    issuedAt,
    expiresAt,
    issuer: options.issuer,
    scope,
    targetApproval: {
      scope,
      artifact: artifact('target-pilot-approval', issuedAt, 'APPROVED'),
      approvedAt: issuedAt,
      approvedBy: options.issuer,
      status: 'APPROVED',
    },
    preseedRevalidation: {
      scope,
      dryRun: true,
      zeroMutation: true,
      conflictCount: 0,
      decision: 'WOULD_ESTABLISH',
      artifact: artifact('preseed-dry-run', preseedExecutedAt, 'PASS'),
      executedAt: preseedExecutedAt,
    },
    unexplainedObservation: {
      observationWindowStart: windowStart.toISOString(),
      observationWindowEnd: windowEnd.toISOString(),
      comparisonCount: options.comparisonCount ?? 42,
      correctnessBlockingCount: 0,
      classificationSummary: { MATCH: options.comparisonCount ?? 42 },
      artifact: artifact('unexplained-metrics-export', windowEnd.toISOString(), 'PASS'),
      generatedAt: windowEnd.toISOString(),
    },
    mixedReplica: {
      deploymentBuildId: options.capableBuildId,
      capableBuildId: options.capableBuildId,
      verifiedAt: issuedAt,
      replicas,
      peerSetDigest: computeMixedReplicaPeerSetDigest(replicaBuildIds),
      allReplicasCapable: true,
      artifact: artifact('mixed-replica-deploy-verify', issuedAt, 'PASS'),
    },
    runtimeBuild: {
      capableBuildId: options.capableBuildId,
      applicationBuildId: options.capableBuildId,
      artifact: artifact('runtime-build-attestation', issuedAt, 'PASS'),
      verifiedAt: issuedAt,
    },
  };
}
