import { DeviceConnectionEpisodeResolutionMethod } from '@prisma/client';
import type { DerivedEpisodeWindow } from './device-connection-episode-reconciliation.engine';
import { EPISODE_RECONCILIATION_EVIDENCE_CODE_VERSION } from './device-connection-episode-reconciliation-evidence-package.version';
import { withEvidenceHash } from './device-connection-episode-reconciliation-evidence-package.hash';
import type {
  EpisodeReconciliationEvidencePackage,
  RecoveryEvidenceType,
} from './device-connection-episode-reconciliation-evidence-package.types';
import type { EpisodeHistoricalEvidence } from './device-connection-episode-reconciliation-historical.types';
import type {
  EpisodeReconciliationCandidate,
  ReconciliationVehicleInput,
} from './device-connection-episode-reconciliation.types';

export function isAutoApplicableClassification(
  classification: EpisodeReconciliationCandidate['classification'],
): boolean {
  return (
    classification === 'RESOLVED_EXPLICIT' ||
    classification === 'SHOULD_RESOLVE_BY_SNAPSHOT_SIGNAL' ||
    classification === 'SHOULD_RESOLVE_BY_TELEMETRY' ||
    classification === 'SUPERSEDED_BY_BINDING_CHANGE'
  );
}

function recoveryTypeForClassification(
  classification: EpisodeReconciliationCandidate['classification'],
): RecoveryEvidenceType | null {
  switch (classification) {
    case 'RESOLVED_EXPLICIT':
      return 'explicit_plug';
    case 'SHOULD_RESOLVE_BY_SNAPSHOT_SIGNAL':
      return 'snapshot_signal';
    case 'SHOULD_RESOLVE_BY_TELEMETRY':
      return 'telemetry_resumed';
    case 'SUPERSEDED_BY_BINDING_CHANGE':
      return 'binding_change';
    default:
      return null;
  }
}

export function buildEpisodeReconciliationEvidencePackage(input: {
  organizationId: string;
  vehicleId: string;
  hardwareType: string | null;
  episode: {
    id: string;
    deviceBindingId: string | null;
  };
  window: DerivedEpisodeWindow;
  candidate: EpisodeReconciliationCandidate;
  historicalEvidence: EpisodeHistoricalEvidence | null;
  telemetryObservationSnapshotIds?: string[];
  generatedAt: string;
  auditWaterlineAt: string;
}): EpisodeReconciliationEvidencePackage | null {
  if (!input.candidate.applyEligible || !isAutoApplicableClassification(input.candidate.classification)) {
    return null;
  }

  const recoveryEvidenceType = recoveryTypeForClassification(input.candidate.classification);
  if (!recoveryEvidenceType || !input.historicalEvidence) {
    return null;
  }

  const historical = input.historicalEvidence;
  const applyEvidence = historical.applyEvidence;
  if (!applyEvidence) {
    return null;
  }

  const first = historical.firstSnapshotAfterUnplug;

  let providerObservedAt = applyEvidence.resolutionEvidenceAt;
  let receivedAt = historical.unplugReceivedAt;
  let processedAt: string | null = null;
  let sourceType: EpisodeReconciliationEvidencePackage['sourceType'] =
    first?.sourceType ?? 'telemetry_recovery_observation';
  let obdIsPluggedIn: boolean | null = first?.obdIsPluggedIn ?? null;
  let plugEventId: string | null = input.window.plugEvent?.id ?? null;

  if (recoveryEvidenceType === 'explicit_plug') {
    if (!input.window.plugEvent) return null;
    providerObservedAt = input.window.plugEvent.observedAt.toISOString();
    receivedAt = input.window.plugEvent.receivedAt.toISOString();
    processedAt = null;
    sourceType = 'explicit_plug_event';
    obdIsPluggedIn = true;
    plugEventId = input.window.plugEvent.id;
  } else if (recoveryEvidenceType === 'snapshot_signal') {
    if (!first || first.obdIsPluggedIn !== true) return null;
    providerObservedAt = first.providerObservedAt;
    receivedAt = first.receivedAt;
    processedAt = first.processedAt;
    sourceType = first.sourceType;
    obdIsPluggedIn = true;
  } else if (recoveryEvidenceType === 'telemetry_resumed') {
    if (!first || !historical.sustainedTelemetryFromHistory) return null;
    providerObservedAt = first.providerObservedAt;
    receivedAt = first.receivedAt;
    processedAt = first.processedAt;
    sourceType = first.sourceType;
    obdIsPluggedIn = first.obdIsPluggedIn;
  } else if (recoveryEvidenceType === 'binding_change') {
    providerObservedAt = applyEvidence.resolutionEvidenceAt;
    receivedAt = historical.unplugReceivedAt;
    sourceType = first?.sourceType ?? 'dimo_poll_log';
  }

  const operationalSignalSummary = {
    sustained: historical.sustainedTelemetryFromHistory,
    sampleCountAfterUnplug: historical.samplesAfterUnplug,
    hasOperationalSignal:
      recoveryEvidenceType === 'telemetry_resumed'
        ? first?.hasOperationalSignal === true
        : first?.hasOperationalSignal === true || recoveryEvidenceType === 'explicit_plug',
    providerConnectionStatus: null,
  };

  const snapshotIds = [
    ...(input.telemetryObservationSnapshotIds ?? []),
    applyEvidence.resolutionSnapshotId ?? '',
  ].filter(Boolean);

  return withEvidenceHash({
    episodeId: input.episode.id,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    provider: input.candidate.provider,
    deviceBindingId: input.episode.deviceBindingId,
    hardwareType: input.hardwareType,
    unplugEventId: input.window.unplugEvent.id,
    plugEventId,
    unplugObservedAt: input.window.unplugEvent.observedAt.toISOString(),
    unplugReceivedAt: input.window.unplugEvent.receivedAt.toISOString(),
    recoveryEvidenceType,
    relevantSnapshotIds: [...new Set(snapshotIds)],
    resolutionSnapshotId:
      applyEvidence.resolutionSnapshotId ??
      `reconciliation:${input.episode.id}:${providerObservedAt}`,
    providerObservedAt,
    receivedAt,
    processedAt,
    sourceType,
    obdIsPluggedIn,
    operationalSignalSummary,
    tripEvidence: {
      tripCountAfterUnplug: historical.tripCountAfterUnplug,
      firstTripAfterUnplug: historical.firstTripAfterUnplug,
    },
    bindingEvidence: {
      bindingIdAtUnplug: historical.bindingIdAtUnplug,
      bindingChangedInWindow: historical.bindingChangedInWindow,
      tokenIdAtUnplug: historical.tokenIdAtUnplug,
    },
    classification: input.candidate.classification,
    confidence: input.candidate.confidence,
    recommendedResolutionMethod: input.candidate.recommendedResolutionMethod,
    auditWaterlineAt: input.auditWaterlineAt,
    generatedAt: input.generatedAt,
    codeVersion: EPISODE_RECONCILIATION_EVIDENCE_CODE_VERSION,
  });
}

export function buildEvidencePackagesForVehicle(input: {
  organizationId: string;
  vehicleId: string;
  hardwareType: string | null;
  vehicleInput: ReconciliationVehicleInput;
  windows: DerivedEpisodeWindow[];
  candidates: EpisodeReconciliationCandidate[];
  openEpisode: { id: string; deviceBindingId: string | null; openedAt: Date; openedByEventId: string | null } | null;
  telemetryObservationSnapshotIds?: string[];
  generatedAt: string;
}): EpisodeReconciliationEvidencePackage[] {
  if (!input.openEpisode) return [];

  const packages: EpisodeReconciliationEvidencePackage[] = [];
  for (let i = 0; i < input.windows.length; i++) {
    const window = input.windows[i]!;
    const candidate = input.candidates[i];
    if (!candidate) continue;

    if (
      input.openEpisode.openedAt.toISOString() !== window.unplugEvent.observedAt.toISOString()
    ) {
      continue;
    }
    if (
      input.openEpisode.openedByEventId &&
      input.openEpisode.openedByEventId !== window.unplugEvent.id
    ) {
      continue;
    }

    const historicalEvidence =
      input.vehicleInput.historicalEvidenceByUnplugEventId?.[window.unplugEvent.id] ?? null;
    const auditWaterlineAt =
      candidate.latestEventAt ??
      window.plugEvent?.observedAt.toISOString() ??
      window.unplugEvent.observedAt.toISOString();

    const pkg = buildEpisodeReconciliationEvidencePackage({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      hardwareType: input.hardwareType,
      episode: input.openEpisode,
      window,
      candidate,
      historicalEvidence,
      telemetryObservationSnapshotIds: input.telemetryObservationSnapshotIds,
      generatedAt: input.generatedAt,
      auditWaterlineAt,
    });
    if (pkg) packages.push(pkg);
  }
  return packages;
}

export function recommendedMethodMatchesPackage(
  pkg: EpisodeReconciliationEvidencePackage,
): boolean {
  const expected: Record<RecoveryEvidenceType, DeviceConnectionEpisodeResolutionMethod> = {
    explicit_plug: DeviceConnectionEpisodeResolutionMethod.EXPLICIT_PLUG_WEBHOOK,
    snapshot_signal: DeviceConnectionEpisodeResolutionMethod.SNAPSHOT_PLUG_SIGNAL,
    telemetry_resumed: DeviceConnectionEpisodeResolutionMethod.TELEMETRY_RESUMED,
    binding_change: DeviceConnectionEpisodeResolutionMethod.DEVICE_BINDING_CHANGED,
  };
  return pkg.recommendedResolutionMethod === expected[pkg.recoveryEvidenceType];
}
