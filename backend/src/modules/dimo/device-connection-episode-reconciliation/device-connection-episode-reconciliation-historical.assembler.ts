import type { DerivedEpisodeWindow } from './device-connection-episode-reconciliation.engine';
import type { ReconciliationBindingInput, ReconciliationVehicleInput } from './device-connection-episode-reconciliation.types';
import {
  RECONCILIATION_HISTORICAL_DEFAULTS,
  type ReconciliationHistoricalWindowConfig,
} from './device-connection-episode-reconciliation-historical.config';
import type {
  EpisodeHistoricalEvidence,
  EpisodeReconciliationApplyEvidence,
  HistoricalEvidenceSourceType,
  HistoricalSnapshotSample,
  ReconciliationVehicleHistoricalSources,
} from './device-connection-episode-reconciliation-historical.types';

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

function longestGapMs(timestamps: number[]): number | null {
  if (timestamps.length < 2) return null;
  let max = 0;
  for (let i = 1; i < timestamps.length; i++) {
    max = Math.max(max, timestamps[i]! - timestamps[i - 1]!);
  }
  return max;
}

function findActiveBindingAt(
  bindings: ReconciliationBindingInput[],
  at: Date,
): ReconciliationBindingInput | null {
  const t = at.getTime();
  const matches = bindings
    .filter((binding) => {
      const start = binding.activatedAt.getTime();
      const end = binding.deactivatedAt?.getTime() ?? Number.POSITIVE_INFINITY;
      return t >= start && t <= end;
    })
    .sort((a, b) => b.activatedAt.getTime() - a.activatedAt.getTime());
  return matches[0] ?? null;
}

function buildSample(input: {
  sourceType: HistoricalEvidenceSourceType;
  providerObservedAt: Date;
  receivedAt: Date;
  processedAt?: Date | null;
  providerBindingId?: string | null;
  sourceSubtype?: string | null;
  obdIsPluggedIn?: boolean | null;
  hasOperationalSignal: boolean;
  providerConnectionStatus?: string | null;
  backfillLagThresholdMs: number;
}): HistoricalSnapshotSample {
  const backfillLagMs = Math.max(0, input.receivedAt.getTime() - input.providerObservedAt.getTime());
  return {
    sourceType: input.sourceType,
    providerObservedAt: input.providerObservedAt,
    receivedAt: input.receivedAt,
    processedAt: input.processedAt ?? null,
    providerBindingId: input.providerBindingId ?? null,
    sourceSubtype: input.sourceSubtype ?? null,
    obdIsPluggedIn: input.obdIsPluggedIn ?? null,
    hasOperationalSignal: input.hasOperationalSignal,
    providerConnectionStatus: input.providerConnectionStatus ?? null,
    backfillLagMs,
    delayedSnapshot: backfillLagMs > input.backfillLagThresholdMs,
  };
}

export function resolveEpisodeEvidenceWindow(
  window: DerivedEpisodeWindow,
  config: ReconciliationHistoricalWindowConfig = RECONCILIATION_HISTORICAL_DEFAULTS,
): { windowStart: Date; windowEnd: Date } {
  const unplugAt = window.unplugEvent.observedAt;
  const windowStart = new Date(unplugAt.getTime() - config.preUnplugMs);
  const explicitEnd = window.plugEvent?.observedAt ?? null;
  const maxEnd = new Date(unplugAt.getTime() + config.postUnplugMaxMs);
  const windowEnd =
    explicitEnd != null && explicitEnd.getTime() < maxEnd.getTime() ? explicitEnd : maxEnd;
  return { windowStart, windowEnd };
}

export function flattenHistoricalSamples(
  sources: ReconciliationVehicleHistoricalSources,
  windowStart: Date,
  windowEnd: Date,
  config: ReconciliationHistoricalWindowConfig = RECONCILIATION_HISTORICAL_DEFAULTS,
): HistoricalSnapshotSample[] {
  const inWindow = (at: Date) =>
    at.getTime() >= windowStart.getTime() && at.getTime() <= windowEnd.getTime();

  const samples: HistoricalSnapshotSample[] = [];

  for (const obs of sources.telemetryObservations) {
    if (!inWindow(obs.providerObservedAt)) continue;
    samples.push(
      buildSample({
        sourceType: 'telemetry_recovery_observation',
        providerObservedAt: obs.providerObservedAt,
        receivedAt: obs.receivedAt,
        processedAt: obs.receivedAt,
        providerBindingId: obs.providerBindingId,
        hasOperationalSignal: obs.hasOperationalSignal,
        providerConnectionStatus: obs.connectionStatusActive ? 'CONNECTED' : null,
        backfillLagThresholdMs: config.backfillLagThresholdMs,
      }),
    );
  }

  for (const poll of sources.pollLogs) {
    const observedAt = poll.finishedAt ?? poll.startedAt;
    if (!inWindow(observedAt)) continue;
    samples.push(
      buildSample({
        sourceType: 'dimo_poll_log',
        providerObservedAt: observedAt,
        receivedAt: poll.finishedAt ?? poll.startedAt,
        processedAt: poll.finishedAt,
        hasOperationalSignal: poll.status === 'SUCCESS',
        backfillLagThresholdMs: config.backfillLagThresholdMs,
      }),
    );
  }

  for (const row of sources.clickhouseSnapshots) {
    if (!inWindow(row.recordedAt)) continue;
    samples.push(
      buildSample({
        sourceType: 'clickhouse_telemetry_mirror',
        providerObservedAt: row.recordedAt,
        receivedAt: row.recordedAt,
        hasOperationalSignal: row.hasOperationalSignal,
        backfillLagThresholdMs: config.backfillLagThresholdMs,
      }),
    );
  }

  for (const audit of sources.resolutionAudits) {
    if (!inWindow(audit.providerObservedAt)) continue;
    const meta = (audit.metadata ?? {}) as Record<string, unknown>;
    samples.push(
      buildSample({
        sourceType: 'resolution_audit',
        providerObservedAt: audit.providerObservedAt,
        receivedAt: audit.receivedAt,
        processedAt: audit.receivedAt,
        obdIsPluggedIn:
          typeof meta.obdIsPluggedIn === 'boolean' ? meta.obdIsPluggedIn : null,
        hasOperationalSignal: true,
        backfillLagThresholdMs: config.backfillLagThresholdMs,
      }),
    );
  }

  samples.sort((a, b) => a.providerObservedAt.getTime() - b.providerObservedAt.getTime());
  return samples;
}

function operationalSamplesAfterUnplug(
  samples: HistoricalSnapshotSample[],
  unplugAt: Date,
): HistoricalSnapshotSample[] {
  return samples.filter(
    (s) =>
      s.providerObservedAt.getTime() > unplugAt.getTime() &&
      s.receivedAt.getTime() > unplugAt.getTime() &&
      s.hasOperationalSignal,
  );
}

function plugSignalSamplesAfterUnplug(
  samples: HistoricalSnapshotSample[],
  unplugAt: Date,
): HistoricalSnapshotSample[] {
  return samples.filter(
    (s) =>
      s.providerObservedAt.getTime() > unplugAt.getTime() &&
      s.receivedAt.getTime() > unplugAt.getTime() &&
      s.obdIsPluggedIn === true,
  );
}

function computeSustainedFromHistory(
  operational: HistoricalSnapshotSample[],
  tripCountAfterUnplug: number,
  config: ReconciliationHistoricalWindowConfig,
): boolean {
  if (tripCountAfterUnplug >= 2) return true;
  if (operational.length < 2) return false;
  const span =
    operational[operational.length - 1]!.providerObservedAt.getTime() -
    operational[0]!.providerObservedAt.getTime();
  return span >= config.sustainedTelemetryMinSpanMs;
}

export function assembleEpisodeHistoricalEvidence(input: {
  vehicle: ReconciliationVehicleInput;
  window: DerivedEpisodeWindow;
  sources: ReconciliationVehicleHistoricalSources;
  tripStarts: Date[];
  config?: ReconciliationHistoricalWindowConfig;
}): EpisodeHistoricalEvidence {
  const config = input.config ?? RECONCILIATION_HISTORICAL_DEFAULTS;
  const { windowStart, windowEnd } = resolveEpisodeEvidenceWindow(input.window, config);
  const unplugAt = input.window.unplugEvent.observedAt;
  const unplugReceivedAt = input.window.unplugEvent.receivedAt;

  const samples = flattenHistoricalSamples(input.sources, windowStart, windowEnd, config);
  const afterUnplug = samples.filter((s) => s.providerObservedAt.getTime() > unplugAt.getTime());
  const operationalAfter = operationalSamplesAfterUnplug(samples, unplugAt);
  const plugSignalAfter = plugSignalSamplesAfterUnplug(samples, unplugAt);

  const tripsAfter = input.tripStarts.filter((t) => t.getTime() > unplugAt.getTime());
  const bindingAtUnplug = findActiveBindingAt(input.vehicle.bindings, unplugAt);
  const bindingAtEnd = findActiveBindingAt(input.vehicle.bindings, windowEnd);
  const activeBindingNow = [...input.vehicle.bindings]
    .filter((b) => b.isActive)
    .sort((a, b) => b.activatedAt.getTime() - a.activatedAt.getTime())[0];
  const bindingChangedInWindow =
    (bindingAtUnplug != null &&
      bindingAtEnd != null &&
      bindingAtUnplug.id !== bindingAtEnd.id) ||
    (bindingAtUnplug != null &&
      activeBindingNow != null &&
      activeBindingNow.id !== bindingAtUnplug.id &&
      activeBindingNow.activatedAt.getTime() > unplugAt.getTime());

  const cadenceIntervals: number[] = [];
  for (let i = 1; i < afterUnplug.length; i++) {
    cadenceIntervals.push(
      afterUnplug[i]!.providerObservedAt.getTime() -
        afterUnplug[i - 1]!.providerObservedAt.getTime(),
    );
  }

  const sourcesPresent = [...new Set(samples.map((s) => s.sourceType))];
  const historicalSeriesPresent = sourcesPresent.some(
    (s) => s !== 'vehicle_latest_state_only',
  );

  let latestStateOnlyEvidence = false;
  if (!historicalSeriesPresent && input.sources.latestStateFallback) {
    const ls = input.sources.latestStateFallback;
    const observedAt = ls.sourceTimestamp ?? ls.providerObservedAt ?? ls.providerFetchedAt;
    const receivedAt = ls.providerFetchedAt ?? ls.receivedAt ?? observedAt;
    if (observedAt && receivedAt && observedAt.getTime() > unplugAt.getTime()) {
      latestStateOnlyEvidence = true;
      samples.push(
        buildSample({
          sourceType: 'vehicle_latest_state_only',
          providerObservedAt: observedAt,
          receivedAt,
          processedAt: ls.processedAt,
          providerBindingId: ls.providerBindingId,
          sourceSubtype: ls.sourceSubtype,
          obdIsPluggedIn: ls.obdIsPluggedIn,
          hasOperationalSignal: observedAt != null,
          backfillLagThresholdMs: config.backfillLagThresholdMs,
        }),
      );
    }
  }

  const firstOperational = operationalAfter[0] ?? null;
  const firstPlugSignal = plugSignalAfter[0] ?? null;
  const firstAfterUnplug = firstPlugSignal ?? firstOperational ?? afterUnplug[0] ?? null;

  const delayedSnapshotCount = afterUnplug.filter((s) => s.delayedSnapshot).length;
  const backfillIndicator = delayedSnapshotCount > 0;

  const sustainedTelemetryFromHistory = computeSustainedFromHistory(
    operationalAfter,
    tripsAfter.length,
    config,
  );

  const tokenIdsAfterUnplug = [
    ...new Set(
      afterUnplug
        .map(() => input.window.unplugEvent.tokenId)
        .concat(
          input.window.plugEvent ? [input.window.plugEvent.tokenId] : [],
        ),
    ),
  ];

  let applyEvidence: EpisodeReconciliationApplyEvidence | null = null;
  if (input.window.plugEvent && input.window.plugEvent.observedAt.getTime() >= unplugAt.getTime()) {
    applyEvidence = {
      kind: 'explicit_plug',
      resolutionEvidenceAt: input.window.plugEvent.observedAt.toISOString(),
      recoverySource: 'plug_webhook',
    };
  } else if (firstPlugSignal) {
    applyEvidence = {
      kind: 'snapshot_signal',
      resolutionEvidenceAt: firstPlugSignal.providerObservedAt.toISOString(),
      resolutionSnapshotId: `historical:snapshot:${firstPlugSignal.providerObservedAt.toISOString()}`,
      recoverySource: 'snapshot_obd',
    };
  } else if (sustainedTelemetryFromHistory && firstOperational) {
    applyEvidence = {
      kind: 'telemetry_resumed',
      resolutionEvidenceAt: firstOperational.providerObservedAt.toISOString(),
      recoverySource: 'telemetry_resumed',
      observationCount: operationalAfter.length,
      policyVariant: tripsAfter.length > 0 ? 'TRIP' : 'SPAN',
    };
  } else if (bindingChangedInWindow) {
    applyEvidence = {
      kind: 'binding_change',
      resolutionEvidenceAt: windowEnd.toISOString(),
      recoverySource: 'binding_change',
    };
  }

  return {
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    unplugObservedAt: unplugAt.toISOString(),
    unplugReceivedAt: unplugReceivedAt.toISOString(),
    sampleCount: samples.length,
    samplesAfterUnplug: afterUnplug.length,
    firstSnapshotAfterUnplug: firstAfterUnplug
      ? {
          providerObservedAt: firstAfterUnplug.providerObservedAt.toISOString(),
          receivedAt: firstAfterUnplug.receivedAt.toISOString(),
          processedAt: iso(firstAfterUnplug.processedAt),
          sourceType: firstAfterUnplug.sourceType,
          obdIsPluggedIn: firstAfterUnplug.obdIsPluggedIn,
          hasOperationalSignal: firstAfterUnplug.hasOperationalSignal,
          providerBindingId: firstAfterUnplug.providerBindingId,
        }
      : null,
    cadenceMedianMs: median(cadenceIntervals),
    longestGapMs: longestGapMs(afterUnplug.map((s) => s.providerObservedAt.getTime())),
    tripCountAfterUnplug: tripsAfter.length,
    firstTripAfterUnplug: iso(tripsAfter[0] ?? null),
    providerConnectionStatusAtEnd: input.vehicle.dimoConnectionStatus,
    tokenIdAtUnplug: input.window.unplugEvent.tokenId,
    tokenIdsAfterUnplug: tokenIdsAfterUnplug,
    bindingIdAtUnplug: bindingAtUnplug?.id ?? null,
    bindingChangedInWindow,
    latestStateOnlyEvidence,
    delayedSnapshotCount,
    backfillIndicator,
    sustainedTelemetryFromHistory,
    sourcesPresent: [...new Set(samples.map((s) => s.sourceType))],
    applyEvidence,
  };
}

export function historicalEvidenceSupportsSnapshotRecovery(
  evidence: EpisodeHistoricalEvidence,
  bindingIdAtUnplug: string | null,
): { eligible: boolean; conflicts: string[] } {
  const conflicts: string[] = [];

  if (evidence.latestStateOnlyEvidence && evidence.samplesAfterUnplug <= 1) {
    conflicts.push('LATEST_STATE_ONLY_INSUFFICIENT_FOR_HISTORICAL_APPLY');
    return { eligible: false, conflicts };
  }

  if (evidence.backfillIndicator && evidence.delayedSnapshotCount === evidence.samplesAfterUnplug) {
    conflicts.push('DELAYED_BACKFILL_ONLY_EVIDENCE');
  }

  const first = evidence.firstSnapshotAfterUnplug;
  if (!first) {
    conflicts.push('NO_SNAPSHOT_AFTER_UNPLUG');
    return { eligible: false, conflicts };
  }

  if (new Date(first.providerObservedAt).getTime() <= new Date(evidence.unplugObservedAt).getTime()) {
    conflicts.push('SNAPSHOT_OBSERVED_BEFORE_UNPLUG');
    return { eligible: false, conflicts };
  }

  if (new Date(first.receivedAt).getTime() <= new Date(evidence.unplugReceivedAt).getTime()) {
    conflicts.push('SNAPSHOT_RECEIVED_BEFORE_UNPLUG');
    return { eligible: false, conflicts };
  }

  if (first.obdIsPluggedIn !== true) {
    conflicts.push('SNAPSHOT_NOT_PLUGGED');
    return { eligible: false, conflicts };
  }

  if (
    bindingIdAtUnplug != null &&
    first.providerBindingId != null &&
    first.providerBindingId !== bindingIdAtUnplug
  ) {
    conflicts.push('SNAPSHOT_BINDING_MISMATCH');
    return { eligible: false, conflicts };
  }

  if (first.sourceType === 'vehicle_latest_state_only') {
    conflicts.push('LATEST_STATE_ONLY_INSUFFICIENT_FOR_HISTORICAL_APPLY');
    return { eligible: false, conflicts };
  }

  if (conflicts.includes('DELAYED_BACKFILL_ONLY_EVIDENCE')) {
    return { eligible: false, conflicts };
  }

  return { eligible: true, conflicts };
}

export function historicalEvidenceSupportsTelemetryRecovery(
  evidence: EpisodeHistoricalEvidence,
): { eligible: boolean; conflicts: string[] } {
  const conflicts: string[] = [];

  if (evidence.latestStateOnlyEvidence && !evidence.sustainedTelemetryFromHistory) {
    conflicts.push('LATEST_STATE_ONLY_INSUFFICIENT_FOR_HISTORICAL_APPLY');
    return { eligible: false, conflicts };
  }

  if (!evidence.sustainedTelemetryFromHistory) {
    conflicts.push('TELEMETRY_NOT_SUSTAINED');
    return { eligible: false, conflicts };
  }

  const first = evidence.firstSnapshotAfterUnplug;
  if (first?.obdIsPluggedIn === false) {
    conflicts.push('SNAPSHOT_CONTRADICTS_TELEMETRY');
    return { eligible: false, conflicts };
  }

  if (evidence.sampleCount === 0) {
    conflicts.push('NO_HISTORICAL_SAMPLES');
    return { eligible: false, conflicts };
  }

  return { eligible: true, conflicts };
}
