import { createHash } from 'crypto';
import {
  DI_V0_COMBINED_INPUT_IDENTITY_V0_3,
  DI_V0_S4_BOUNDARY_FP_VERSION,
  DI_V0_S4_CHANNEL_OUTCOMES,
  DI_V0_S4_CHANNEL_POLICY_V1,
  DI_V0_S4_ORCHESTRATION_CONTRACT_VERSION,
  DI_V0_S4_CHANNEL_RULES,
  DI_V0_S4_EVIDENCE_CHANNEL_ORDER,
  DI_V0_S4_EVIDENCE_CONTAINER_VERSION,
  DI_V0_S4_EVIDENCE_SNAPSHOT_HASH_PREFIX,
  DI_V0_S4_EXECUTION_IDENTITY_VERSION,
  DI_V0_S4_LIMITS,
  DI_V0_S4_PIPELINE_KEY_PREFIX,
  DI_V0_S4_PIPELINE_MANIFEST_KEYS,
  type DiV0S4EvidenceChannel,
  type DiV0S4PipelineManifest,
  type DiV0S4RunPurpose,
} from './di-v0-s4a-contract';

export class DiV0S4IdentityError extends Error {
  constructor(message: string) {
    super(`DI_V0_S4_IDENTITY:${message}`);
    this.name = 'DiV0S4IdentityError';
  }
}

const sha256Hex = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

// ── Pipeline version key (DI_V0_S4_PIPELINE_V1) ───────────────────────────

/** Fails closed unless the manifest carries exactly the 20 required keys with non-empty string values. */
export function assertDiV0S4PipelineManifest(manifest: unknown): asserts manifest is DiV0S4PipelineManifest {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new DiV0S4IdentityError('manifest must be an object');
  }
  const keys = Object.keys(manifest).sort();
  const required = [...DI_V0_S4_PIPELINE_MANIFEST_KEYS].sort();
  if (keys.length !== required.length || keys.some((k, i) => k !== required[i])) {
    throw new DiV0S4IdentityError('manifest keys must equal the 20 required pipeline keys');
  }
  for (const key of required) {
    const value = (manifest as Record<string, unknown>)[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new DiV0S4IdentityError(`manifest value ${key} must be a non-empty string`);
    }
  }
}

export function buildDiV0S4PipelineVersionKey(manifest: DiV0S4PipelineManifest): string {
  assertDiV0S4PipelineManifest(manifest);
  const entries = Object.keys(manifest)
    .sort()
    .map((key) => [key, manifest[key as keyof DiV0S4PipelineManifest]]);
  return `${DI_V0_S4_PIPELINE_KEY_PREFIX}:sha256:${sha256Hex(JSON.stringify(entries))}`;
}

/** Channel flags enter the pipeline version (`controlPlane.channelFlagsEnterPipelineVersion`). */
export function deriveDiV0S4ChannelEnablement(flags: { r1Enabled: boolean; nativeEnabled: boolean }): string {
  return ['POSITION', ...(flags.r1Enabled ? ['R1_OBD'] : []), ...(flags.nativeEnabled ? ['NATIVE_EVENT'] : [])].join('+');
}

/**
 * A replica may only create, claim or complete under a manifest that this S4A build can honour:
 * its channel enablement equals the replica's channel flags and every contract-owned version is
 * the one implemented here. `evidenceSnapshotContainerVersion` is deliberately not compared
 * (DI-CONTRA-S4A-CONTAINER-VERSION-NAMING-001).
 */
export function assertDiV0S4RuntimePipelineManifest(
  manifest: unknown,
  flags: { r1Enabled: boolean; nativeEnabled: boolean },
): asserts manifest is DiV0S4PipelineManifest {
  assertDiV0S4PipelineManifest(manifest);
  const expected: Partial<Record<keyof DiV0S4PipelineManifest, string>> = {
    channelEnablement: deriveDiV0S4ChannelEnablement(flags),
    s4OrchestrationContractVersion: DI_V0_S4_ORCHESTRATION_CONTRACT_VERSION,
    combinedInputIdentityVersion: DI_V0_COMBINED_INPUT_IDENTITY_V0_3,
    boundaryFingerprintVersion: DI_V0_S4_BOUNDARY_FP_VERSION,
    channelPolicyVersion: DI_V0_S4_CHANNEL_POLICY_V1,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (manifest[key as keyof DiV0S4PipelineManifest] !== value) {
      throw new DiV0S4IdentityError(`manifest ${key} must be ${value}`);
    }
  }
}

// ── Boundary fingerprint (DI_V0_S4_BOUNDARY_FP_V1) ────────────────────────

export interface DiV0S4BoundaryInput {
  /** Repository-resolved `vehicles.organization_id` of the trip's vehicle; never caller-supplied. */
  organizationId: string;
  vehicleId: string;
  tripId: string;
  tripStatus: string;
  startTime: Date;
  endTime: Date | null;
  dimoSegmentId: string | null;
  mergeParentTripId: string | null;
  boundaryRepairGeneration: string | null;
}

export function buildDiV0S4BoundaryFingerprint(input: DiV0S4BoundaryInput): string {
  const payload = [
    DI_V0_S4_BOUNDARY_FP_VERSION,
    input.organizationId,
    input.vehicleId,
    input.tripId,
    input.tripStatus,
    input.startTime.toISOString(),
    input.endTime == null ? null : input.endTime.toISOString(),
    input.dimoSegmentId ?? null,
    input.mergeParentTripId ?? null,
    input.boundaryRepairGeneration ?? null,
  ];
  return `${DI_V0_S4_BOUNDARY_FP_VERSION}:sha256:${sha256Hex(JSON.stringify(payload))}`;
}

// ── Channel pins and combined input identity (V0_3) ───────────────────────

/** [outcome, reasonCode, channelEvidenceHash, attestationRef] */
export type DiV0S4ChannelPin = readonly [string, string | null, string | null, string | null];
export type DiV0S4ChannelPins = Record<DiV0S4EvidenceChannel, DiV0S4ChannelPin>;

export function validateDiV0S4ChannelPin(channel: DiV0S4EvidenceChannel, pin: DiV0S4ChannelPin): string | null {
  const [outcome, reason, evidence, attestation] = pin;
  const rules = DI_V0_S4_CHANNEL_RULES;
  const allowed = DI_V0_S4_CHANNEL_OUTCOMES[channel] as readonly string[] | undefined;
  if (!allowed || !allowed.includes(outcome)) return `outcome ${outcome} not allowed on ${channel}`;
  if ((rules.snapshotRequiredOutcomes as readonly string[]).includes(outcome) && !evidence) {
    return `${outcome} requires channel evidence hash`;
  }
  if ((rules.snapshotForbiddenOutcomes as readonly string[]).includes(outcome) && evidence) {
    return `${outcome} forbids channel evidence`;
  }
  if (evidence && !rules.channelEvidenceHashPattern.test(evidence)) return 'channel evidence hash is not a content hash';
  if ((rules.reasonCodeRequiredOutcomes as readonly string[]).includes(outcome) && !reason) {
    return `${outcome} requires reason code`;
  }
  const needsAttestation = (rules.nativeReadyOutcomesRequireAttestation as readonly string[]).includes(outcome);
  if (needsAttestation && !attestation) return `${outcome} requires native ingest attestation`;
  if (!needsAttestation && attestation) return `${outcome} must not carry attestation`;
  return null;
}

export function buildDiV0CombinedInputIdentityV03(pins: DiV0S4ChannelPins): string {
  const lines: string[] = [DI_V0_COMBINED_INPUT_IDENTITY_V0_3];
  for (const channel of DI_V0_S4_EVIDENCE_CHANNEL_ORDER) {
    const pin = pins[channel];
    if (!pin) throw new DiV0S4IdentityError(`missing channel ${channel}`);
    const error = validateDiV0S4ChannelPin(channel, pin);
    if (error) throw new DiV0S4IdentityError(error);
    lines.push(JSON.stringify([channel, ...pin]));
  }
  return `${DI_V0_COMBINED_INPUT_IDENTITY_V0_3}:sha256:${sha256Hex(lines.join('\n'))}`;
}

export type DiV0S4ChannelRunVerdict = 'RUNNABLE' | 'NOT_RUNNABLE' | 'INVALID';

/**
 * Channel policy V1 run verdict: flag-off channels must be DISABLED, flag-on channels must not be,
 * native outcomes must be reachable without a readiness authority, and only POSITION=PRESENT runs.
 */
export function evaluateDiV0S4ChannelRun(
  flags: { r1Enabled: boolean; nativeEnabled: boolean },
  pins: DiV0S4ChannelPins,
): DiV0S4ChannelRunVerdict {
  try {
    const flagOf: Record<'R1_OBD' | 'NATIVE_EVENT', boolean> = { R1_OBD: flags.r1Enabled, NATIVE_EVENT: flags.nativeEnabled };
    for (const channel of ['R1_OBD', 'NATIVE_EVENT'] as const) {
      const disabled = pins[channel]?.[0] === 'DISABLED';
      if (flagOf[channel] === disabled) return 'INVALID';
    }
    if (!(DI_V0_S4_CHANNEL_RULES.channelPolicyV1ReachableNativeOutcomes as readonly string[]).includes(pins.NATIVE_EVENT[0])) {
      return 'INVALID';
    }
    buildDiV0CombinedInputIdentityV03(pins);
  } catch {
    return 'INVALID';
  }
  return (DI_V0_S4_CHANNEL_RULES.positionRunnableOutcomes as readonly string[]).includes(pins.POSITION[0])
    ? 'RUNNABLE'
    : 'NOT_RUNNABLE';
}

// ── S2 execution identity (DI_V0_S4_EXECUTION_IDENTITY_V1) ────────────────

export interface DiV0S4ExecutionIdentityInput {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  boundaryFingerprint: string;
  pipelineVersionKey: string;
  calibrationBundleHash: string;
  s4OrchestrationContractVersion: string;
  runPurpose: DiV0S4RunPurpose;
  purposeDiscriminator: string;
  pinnedEvidenceSnapshotHash: string;
  combinedInputIdentity: string;
}

const EXECUTION_IDENTITY_COMPONENTS = [
  'organizationId',
  'vehicleId',
  'tripId',
  'boundaryFingerprint',
  'pipelineVersionKey',
  'calibrationBundleHash',
  's4OrchestrationContractVersion',
  'runPurpose',
  'purposeDiscriminator',
  'pinnedEvidenceSnapshotHash',
  'combinedInputIdentity',
] as const satisfies readonly (keyof DiV0S4ExecutionIdentityInput)[];

export function buildDiV0S4ExecutionIdentity(input: DiV0S4ExecutionIdentityInput): string {
  const payload = [DI_V0_S4_EXECUTION_IDENTITY_VERSION, ...EXECUTION_IDENTITY_COMPONENTS.map((key) => input[key] ?? null)];
  return `${DI_V0_S4_EXECUTION_IDENTITY_VERSION}:sha256:${sha256Hex(JSON.stringify(payload))}`;
}

/** Execution-identity components that are also pipeline-manifest values must agree with the manifest. */
export function assertDiV0S4ExecutionIdentityConsistency(
  input: DiV0S4ExecutionIdentityInput,
  manifest: DiV0S4PipelineManifest,
): void {
  if (input.calibrationBundleHash !== manifest.calibrationBundleHash) {
    throw new DiV0S4IdentityError('calibrationBundleHash must equal the pipeline manifest value');
  }
  if (input.s4OrchestrationContractVersion !== manifest.s4OrchestrationContractVersion) {
    throw new DiV0S4IdentityError('s4OrchestrationContractVersion must equal the pipeline manifest value');
  }
  if (buildDiV0S4PipelineVersionKey(manifest) !== input.pipelineVersionKey) {
    throw new DiV0S4IdentityError('pipelineVersionKey must be the manifest hash');
  }
}

// ── Evidence container (DI_V0_S4_EVIDENCE_CONTAINER_V1) ───────────────────

export interface DiV0S4EvidenceChannelInput {
  channel: DiV0S4EvidenceChannel;
  outcome: string;
  reasonCode: string | null;
  /** Channel snapshot format version, e.g. DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1; null when no payload. */
  formatVersion: string | null;
  /** Channel payload in its existing canonical serialized form; null when the outcome forbids a snapshot. */
  payload: string | null;
  attestationRef: string | null;
}

export interface DiV0S4EvidenceContainerInput {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  boundaryFingerprint: string;
  windowStart: Date;
  windowEnd: Date;
  channels: readonly DiV0S4EvidenceChannelInput[];
}

export interface DiV0S4EvidenceChannelManifestEntry {
  channel: DiV0S4EvidenceChannel;
  outcome: string;
  reasonCode: string | null;
  formatVersion: string | null;
  payloadSha256: string | null;
  channelEvidenceHash: string | null;
  attestationRef: string | null;
}

export interface DiV0S4SerializedEvidenceContainer {
  container: string;
  snapshotHash: string;
  channelManifest: DiV0S4EvidenceChannelManifestEntry[];
  pins: DiV0S4ChannelPins;
  combinedInputIdentity: string;
}

export function buildDiV0S4EvidenceSnapshotHash(container: string): string {
  return `${DI_V0_S4_EVIDENCE_SNAPSHOT_HASH_PREFIX}:sha256:${sha256Hex(container)}`;
}

/**
 * Canonical container per S4A_REPLAY_AND_EVIDENCE_PINNING §2. Wall-clock, worker and request ids
 * are not inputs. The deserializer is S4D scope (DI-GAP-S4-REPLAY-DESERIALIZER-001).
 */
export function serializeDiV0S4EvidenceContainer(input: DiV0S4EvidenceContainerInput): DiV0S4SerializedEvidenceContainer {
  const windowSeconds = (input.windowEnd.getTime() - input.windowStart.getTime()) / 1000;
  if (!(windowSeconds > 0) || windowSeconds > DI_V0_S4_LIMITS.maxAcquisitionWindowSeconds) {
    throw new DiV0S4IdentityError('acquisition window must be positive and at most 28800 s');
  }
  const byChannel = new Map<DiV0S4EvidenceChannel, DiV0S4EvidenceChannelInput>();
  for (const channel of input.channels) {
    if (!(DI_V0_S4_EVIDENCE_CHANNEL_ORDER as readonly string[]).includes(channel.channel)) {
      throw new DiV0S4IdentityError(`unknown channel ${String(channel.channel)}`);
    }
    if (byChannel.has(channel.channel)) throw new DiV0S4IdentityError(`duplicate channel ${channel.channel}`);
    byChannel.set(channel.channel, channel);
  }
  const lines: string[] = [
    DI_V0_S4_EVIDENCE_CONTAINER_VERSION,
    JSON.stringify([
      input.organizationId,
      input.vehicleId,
      input.tripId,
      input.boundaryFingerprint,
      input.windowStart.toISOString(),
      input.windowEnd.toISOString(),
    ]),
  ];
  const manifest: DiV0S4EvidenceChannelManifestEntry[] = [];
  const pins = {} as Record<DiV0S4EvidenceChannel, DiV0S4ChannelPin>;
  for (const channel of DI_V0_S4_EVIDENCE_CHANNEL_ORDER) {
    const entry = byChannel.get(channel);
    if (!entry) throw new DiV0S4IdentityError(`missing channel ${channel}`);
    if ((entry.payload == null) !== (entry.formatVersion == null)) {
      throw new DiV0S4IdentityError(`${channel}: payload and formatVersion must both be set or both be null`);
    }
    if (entry.formatVersion != null && !/^[A-Z0-9_]+$/.test(entry.formatVersion)) {
      throw new DiV0S4IdentityError(`${channel}: formatVersion must match ^[A-Z0-9_]+$`);
    }
    const payloadSha256 = entry.payload == null ? null : sha256Hex(entry.payload);
    const channelEvidenceHash = payloadSha256 == null ? null : `${entry.formatVersion}:sha256:${payloadSha256}`;
    const pin: DiV0S4ChannelPin = [entry.outcome, entry.reasonCode, channelEvidenceHash, entry.attestationRef];
    const error = validateDiV0S4ChannelPin(channel, pin);
    if (error) throw new DiV0S4IdentityError(`${channel}: ${error}`);
    pins[channel] = pin;
    manifest.push({
      channel,
      outcome: entry.outcome,
      reasonCode: entry.reasonCode,
      formatVersion: entry.formatVersion,
      payloadSha256,
      channelEvidenceHash,
      attestationRef: entry.attestationRef,
    });
    lines.push(
      JSON.stringify([channel, entry.outcome, entry.reasonCode, entry.formatVersion, payloadSha256, entry.attestationRef]),
    );
    if (entry.payload != null) lines.push(entry.payload);
  }
  const container = lines.join('\n');
  if (Buffer.byteLength(container, 'utf8') > DI_V0_S4_LIMITS.maxUncompressedSnapshotBytes) {
    throw new DiV0S4IdentityError('evidence container exceeds 16777216 bytes');
  }
  return {
    container,
    snapshotHash: buildDiV0S4EvidenceSnapshotHash(container),
    channelManifest: manifest,
    pins,
    combinedInputIdentity: buildDiV0CombinedInputIdentityV03(pins),
  };
}

/** Rebuilds channel pins from a persisted channel manifest (used by T06 after re-hashing the payload). */
export function pinsFromDiV0S4ChannelManifest(manifest: unknown): DiV0S4ChannelPins {
  if (!Array.isArray(manifest) || manifest.length !== DI_V0_S4_EVIDENCE_CHANNEL_ORDER.length) {
    throw new DiV0S4IdentityError('channel manifest must list exactly three channels');
  }
  const pins = {} as Record<DiV0S4EvidenceChannel, DiV0S4ChannelPin>;
  DI_V0_S4_EVIDENCE_CHANNEL_ORDER.forEach((channel, index) => {
    const entry = manifest[index] as Partial<DiV0S4EvidenceChannelManifestEntry> | null;
    if (!entry || entry.channel !== channel || typeof entry.outcome !== 'string') {
      throw new DiV0S4IdentityError(`channel manifest entry ${index} must be ${channel}`);
    }
    pins[channel] = [entry.outcome, entry.reasonCode ?? null, entry.channelEvidenceHash ?? null, entry.attestationRef ?? null];
  });
  return pins;
}
