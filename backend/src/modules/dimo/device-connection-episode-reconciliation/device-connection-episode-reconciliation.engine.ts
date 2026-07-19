import {
  DimoDeviceConnectionEventType,
  DeviceConnectionEpisodeResolutionMethod,
} from '@prisma/client';
import { filterCanonicalDeviceConnectionEvents } from '../device-connection-read-model';
import { DEVICE_CONNECTION_DEDUP_WINDOW_MS } from '../device-connection-webhook.service';
import {
  historicalEvidenceSupportsSnapshotRecovery,
  historicalEvidenceSupportsTelemetryRecovery,
} from './device-connection-episode-reconciliation-historical.assembler';
import type { EpisodeHistoricalEvidence } from './device-connection-episode-reconciliation-historical.types';
import type {
  BindingClass,
  EpisodeReconciliationCandidate,
  EpisodeReconciliationClassification,
  EpisodeReconciliationReport,
  ReconciliationConfidence,
  ReconciliationEventInput,
  ReconciliationVehicleInput,
} from './device-connection-episode-reconciliation.types';
import { RECONCILIATION_AUDIT_ID } from './device-connection-episode-reconciliation.types';

const SUSTAINED_TELEMETRY_MIN_MS = 5 * 60 * 1000;

export interface DerivedEpisodeWindow {
  unplugEvent: ReconciliationEventInput;
  plugEvent: ReconciliationEventInput | null;
  duplicateUnplugEvents: ReconciliationEventInput[];
  outOfOrderPlug: boolean;
  bindingChangedBeforeResolution: boolean;
  tokenIdAtUnplug: number;
  tokenIdAtResolution: number | null;
}

export function resolveBindingClass(hardwareType: string | null): BindingClass {
  const normalized = (hardwareType ?? '').trim().toUpperCase();
  if (normalized === 'LTE_R1') return 'PHYSICAL_OBD_LTE_R1';
  if (normalized === 'AFTERMARKET_OBD' || normalized === 'OBD') {
    return 'PHYSICAL_OBD_AFTERMARKET';
  }
  if (normalized === 'SYNTHETIC' || normalized === 'SYNTHETIC_ONLY') {
    return 'SYNTHETIC_ONLY';
  }
  if (normalized === 'OEM' || normalized === 'OEM_API') return 'OEM_API';
  return 'UNKNOWN';
}

export function isPhysicalObdBinding(bindingClass: BindingClass): boolean {
  return (
    bindingClass === 'PHYSICAL_OBD_LTE_R1' ||
    bindingClass === 'PHYSICAL_OBD_AFTERMARKET'
  );
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function findActiveBindingAt(
  input: ReconciliationVehicleInput,
  at: Date,
): ReconciliationVehicleInput['bindings'][number] | null {
  const t = at.getTime();
  const matches = input.bindings
    .filter((binding) => {
      const start = binding.activatedAt.getTime();
      const end = binding.deactivatedAt?.getTime() ?? Number.POSITIVE_INFINITY;
      return t >= start && t <= end;
    })
    .sort((a, b) => b.activatedAt.getTime() - a.activatedAt.getTime());
  return matches[0] ?? null;
}

function detectDuplicateUnplugs(events: ReconciliationEventInput[]): Set<string> {
  const duplicateIds = new Set<string>();
  const buckets = new Map<string, ReconciliationEventInput[]>();
  for (const event of events) {
    if (event.eventType !== DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED) continue;
    const key = `${event.eventType}:${event.dedupBucket.toString()}`;
    const list = buckets.get(key) ?? [];
    list.push(event);
    buckets.set(key, list);
  }
  for (const list of buckets.values()) {
    if (list.length <= 1) continue;
    list.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
    for (const dup of list.slice(1)) {
      duplicateIds.add(dup.id);
    }
  }
  return duplicateIds;
}

export function deriveEpisodeWindows(
  input: ReconciliationVehicleInput,
): DerivedEpisodeWindow[] {
  const sorted = [...input.events].sort(
    (a, b) => a.observedAt.getTime() - b.observedAt.getTime(),
  );
  const duplicateUnplugIds = detectDuplicateUnplugs(sorted);
  const canonical = filterCanonicalDeviceConnectionEvents(
    sorted.map((e) => ({
      id: e.id,
      vehicleId: input.vehicleId,
      eventType: e.eventType,
      observedAt: e.observedAt,
    })),
  );

  const windows: DerivedEpisodeWindow[] = [];
  for (let i = 0; i < canonical.length; i++) {
    const event = canonical[i]!;
    if (event.eventType !== DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED) continue;

    const unplugRaw = sorted.find((e) => e.id === event.id)!;
    const nextPlugCanonical = canonical
      .slice(i + 1)
      .find((e) => e.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN);
    const plugRaw = nextPlugCanonical
      ? sorted.find((e) => e.id === nextPlugCanonical.id) ?? null
      : null;

    const duplicateUnplugEvents = sorted.filter(
      (e) =>
        e.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED &&
        duplicateUnplugIds.has(e.id) &&
        Math.abs(e.observedAt.getTime() - unplugRaw.observedAt.getTime()) <=
          DEVICE_CONNECTION_DEDUP_WINDOW_MS,
    );

    const outOfOrderPlug = sorted.some(
      (e) =>
        e.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN &&
        e.observedAt.getTime() < unplugRaw.observedAt.getTime() &&
        e.receivedAt.getTime() >= unplugRaw.receivedAt.getTime(),
    ) || (
      plugRaw != null && plugRaw.observedAt.getTime() < unplugRaw.observedAt.getTime()
    );

    const resolutionAt = plugRaw?.observedAt ?? null;
    const bindingAtUnplug = findActiveBindingAt(input, unplugRaw.observedAt);
    const bindingAtResolution = resolutionAt
      ? findActiveBindingAt(input, resolutionAt)
      : null;
    const bindingChangedBeforeResolution =
      bindingAtUnplug != null &&
      bindingAtResolution != null &&
      bindingAtUnplug.id !== bindingAtResolution.id;

    windows.push({
      unplugEvent: unplugRaw,
      plugEvent: plugRaw,
      duplicateUnplugEvents,
      outOfOrderPlug,
      bindingChangedBeforeResolution,
      tokenIdAtUnplug: unplugRaw.tokenId,
      tokenIdAtResolution: plugRaw?.tokenId ?? null,
    });
  }

  return windows;
}

function snapshotRecoveryEligible(
  evidence: EpisodeHistoricalEvidence | null,
  bindingIdAtUnplug: string | null,
  bindingClass: BindingClass,
): { eligible: boolean; conflicts: string[]; confidence: ReconciliationConfidence } {
  const conflicts: string[] = [];
  if (!isPhysicalObdBinding(bindingClass)) {
    conflicts.push('NON_PHYSICAL_OBD_BINDING');
    return { eligible: false, conflicts, confidence: 'LOW' };
  }

  if (!evidence) {
    conflicts.push('NO_HISTORICAL_EVIDENCE');
    return { eligible: false, conflicts, confidence: 'LOW' };
  }

  const result = historicalEvidenceSupportsSnapshotRecovery(evidence, bindingIdAtUnplug);
  return {
    eligible: result.eligible,
    conflicts: [...conflicts, ...result.conflicts],
    confidence: result.eligible ? 'HIGH' : result.conflicts.includes('SNAPSHOT_NOT_PLUGGED') ? 'MEDIUM' : 'LOW',
  };
}

function telemetryRecoveryEligible(
  evidence: EpisodeHistoricalEvidence | null,
  bindingClass: BindingClass,
): { eligible: boolean; conflicts: string[]; confidence: ReconciliationConfidence } {
  const conflicts: string[] = [];
  if (!isPhysicalObdBinding(bindingClass)) {
    conflicts.push('NON_PHYSICAL_OBD_BINDING');
    return { eligible: false, conflicts, confidence: 'LOW' };
  }

  if (!evidence) {
    conflicts.push('NO_HISTORICAL_EVIDENCE');
    return { eligible: false, conflicts, confidence: 'LOW' };
  }

  const result = historicalEvidenceSupportsTelemetryRecovery(evidence);
  return {
    eligible: result.eligible,
    conflicts: [...conflicts, ...result.conflicts],
    confidence: result.eligible ? 'HIGH' : 'MEDIUM',
  };
}

export function classifyEpisodeWindow(
  input: ReconciliationVehicleInput,
  window: DerivedEpisodeWindow,
): EpisodeReconciliationCandidate {
  const bindingClass = resolveBindingClass(input.hardwareType);
  const openedAt = window.unplugEvent.observedAt;
  const latestEventAt =
    window.plugEvent?.observedAt ??
    window.duplicateUnplugEvents.at(-1)?.observedAt ??
    window.unplugEvent.observedAt;

  const historicalEvidence =
    input.historicalEvidenceByUnplugEventId?.[window.unplugEvent.id] ?? null;
  const bindingAtUnplug = findActiveBindingAt(input, openedAt);

  const conflicts: string[] = [];
  const notes: string[] = [];
  let classification: EpisodeReconciliationClassification = 'NOT_ENOUGH_DATA';
  let recommendedResolutionMethod: DeviceConnectionEpisodeResolutionMethod | null = null;
  let confidence: ReconciliationConfidence = 'LOW';
  let applyEligible = false;

  if (window.unplugEvent.providerEventIdConflict) {
    conflicts.push('PROVIDER_EVENT_ID_CONFLICT');
  }
  if (!window.unplugEvent.providerEventIdPresent) {
    conflicts.push('MISSING_PROVIDER_EVENT_ID');
  }

  if (historicalEvidence?.backfillIndicator) {
    notes.push(`delayed_snapshots=${historicalEvidence.delayedSnapshotCount}`);
  }
  if (historicalEvidence?.latestStateOnlyEvidence) {
    notes.push('latest_state_only_fallback');
  }

  if (window.duplicateUnplugEvents.length > 0 && !window.plugEvent) {
    classification = 'DUPLICATE';
    notes.push(`duplicate_unplug_count=${window.duplicateUnplugEvents.length}`);
    confidence = 'HIGH';
  } else if (window.outOfOrderPlug) {
    classification = 'OUT_OF_ORDER';
    conflicts.push('PLUG_BEFORE_UNPLUG');
    confidence = 'HIGH';
  } else if (window.bindingChangedBeforeResolution && !window.plugEvent) {
    classification = 'SUPERSEDED_BY_BINDING_CHANGE';
    recommendedResolutionMethod =
      DeviceConnectionEpisodeResolutionMethod.DEVICE_BINDING_CHANGED;
    confidence = 'MEDIUM';
    notes.push('token_or_binding_changed_before_resolution');
  } else if (!window.plugEvent) {
    const bindingNow = [...input.bindings]
      .filter((b) => b.isActive)
      .sort((a, b) => b.activatedAt.getTime() - a.activatedAt.getTime())[0];
    const bindingSuperseded =
      bindingAtUnplug != null &&
      bindingNow != null &&
      bindingAtUnplug.id !== bindingNow.id &&
      bindingNow.activatedAt.getTime() > openedAt.getTime();

    if (bindingSuperseded || historicalEvidence?.bindingChangedInWindow) {
      classification = 'SUPERSEDED_BY_BINDING_CHANGE';
      recommendedResolutionMethod =
        DeviceConnectionEpisodeResolutionMethod.DEVICE_BINDING_CHANGED;
      confidence = 'MEDIUM';
      applyEligible = input.persistedOpenEpisode;
      notes.push('active_binding_changed_after_unplug');
    } else {
      const snapshot = snapshotRecoveryEligible(
        historicalEvidence,
        bindingAtUnplug?.id ?? null,
        bindingClass,
      );
      const telemetry = telemetryRecoveryEligible(historicalEvidence, bindingClass);
      conflicts.push(...snapshot.conflicts, ...telemetry.conflicts);

      if (snapshot.eligible) {
        classification = 'SHOULD_RESOLVE_BY_SNAPSHOT_SIGNAL';
        recommendedResolutionMethod =
          DeviceConnectionEpisodeResolutionMethod.SNAPSHOT_PLUG_SIGNAL;
        confidence = snapshot.confidence;
        applyEligible = confidence === 'HIGH';
      } else if (telemetry.eligible) {
        classification = 'SHOULD_RESOLVE_BY_TELEMETRY';
        recommendedResolutionMethod =
          DeviceConnectionEpisodeResolutionMethod.TELEMETRY_RESUMED;
        confidence = telemetry.confidence;
        applyEligible = confidence === 'HIGH';
      } else if (conflicts.includes('SNAPSHOT_CONTRADICTS_TELEMETRY')) {
        classification = 'CONFLICTING_DATA';
        confidence = 'LOW';
      } else if (
        conflicts.includes('LATEST_STATE_ONLY_INSUFFICIENT_FOR_HISTORICAL_APPLY') ||
        conflicts.includes('NO_HISTORICAL_SAMPLES') ||
        conflicts.includes('NO_HISTORICAL_EVIDENCE')
      ) {
        classification = 'NOT_ENOUGH_DATA';
        confidence = 'LOW';
      } else if (bindingClass === 'SYNTHETIC_ONLY' || bindingClass === 'OEM_API') {
        classification = 'NOT_ENOUGH_DATA';
        conflicts.push('OEM_OR_SYNTHETIC_NO_OBD_CLOSURE');
        confidence = 'LOW';
      } else if (input.persistedOpenEpisode || input.alerts.openDeviceUnplugAlert) {
        classification = 'OPEN_CONFIRMED';
        confidence = 'HIGH';
      } else {
        classification = 'OPEN_CONFIRMED';
        confidence = 'MEDIUM';
      }
    }
  } else if (window.plugEvent) {
    if (window.plugEvent.observedAt.getTime() < openedAt.getTime()) {
      classification = 'OUT_OF_ORDER';
      conflicts.push('EXPLICIT_PLUG_BEFORE_UNPLUG');
      confidence = 'HIGH';
    } else {
      classification = 'RESOLVED_EXPLICIT';
      recommendedResolutionMethod =
        DeviceConnectionEpisodeResolutionMethod.EXPLICIT_PLUG_WEBHOOK;
      confidence = 'HIGH';
      applyEligible = input.persistedOpenEpisode;
    }
  }

  const reviewRequired =
    classification === 'CONFLICTING_DATA' ||
    classification === 'NOT_ENOUGH_DATA' ||
    classification === 'OUT_OF_ORDER' ||
    classification === 'DUPLICATE' ||
    (classification === 'OPEN_CONFIRMED' && confidence !== 'HIGH');

  if (
    classification === 'SHOULD_RESOLVE_BY_SNAPSHOT_SIGNAL' ||
    classification === 'SHOULD_RESOLVE_BY_TELEMETRY' ||
    classification === 'RESOLVED_EXPLICIT' ||
    classification === 'SUPERSEDED_BY_BINDING_CHANGE'
  ) {
    if (confidence === 'HIGH' || classification === 'SUPERSEDED_BY_BINDING_CHANGE') {
      applyEligible = applyEligible || input.persistedOpenEpisode;
    }
  }

  if (reviewRequired && classification !== 'SUPERSEDED_BY_BINDING_CHANGE') {
    applyEligible = false;
  }

  return {
    anonymizedVehicleId: input.anonymizedVehicleId,
    provider: input.provider,
    bindingClass,
    openedAt: openedAt.toISOString(),
    latestEventAt: iso(latestEventAt),
    firstTelemetryAfterUnplug: iso(
      historicalEvidence?.firstSnapshotAfterUnplug?.providerObservedAt
        ? new Date(historicalEvidence.firstSnapshotAfterUnplug.providerObservedAt)
        : input.telemetry.firstAfterUnplugAt,
    ),
    explicitPlugSignal: window.plugEvent != null,
    sustainedTelemetry:
      historicalEvidence?.sustainedTelemetryFromHistory ?? input.telemetry.sustainedAfterUnplug,
    tripAfterUnplug:
      (historicalEvidence?.tripCountAfterUnplug ?? input.trips.tripCountAfterUnplug) > 0,
    classification,
    recommendedResolutionMethod,
    confidence,
    conflicts: [...new Set(conflicts)],
    applyEligible,
    reviewRequired,
    notes,
    historicalEvidence,
  };
}

export function reconcileVehicleEpisodes(
  input: ReconciliationVehicleInput,
): EpisodeReconciliationCandidate[] {
  const windows = deriveEpisodeWindows(input);
  if (windows.length === 0) return [];
  return windows.map((window) => classifyEpisodeWindow(input, window));
}

export function buildReconciliationReport(opts: {
  candidates: EpisodeReconciliationCandidate[];
  organizationScope?: string | null;
  vehicleScope?: string | null;
  generatedAt?: Date;
}): EpisodeReconciliationReport {
  const byClassification = {
    OPEN_CONFIRMED: 0,
    RESOLVED_EXPLICIT: 0,
    SHOULD_RESOLVE_BY_SNAPSHOT_SIGNAL: 0,
    SHOULD_RESOLVE_BY_TELEMETRY: 0,
    SUPERSEDED_BY_BINDING_CHANGE: 0,
    OUT_OF_ORDER: 0,
    DUPLICATE: 0,
    CONFLICTING_DATA: 0,
    NOT_ENOUGH_DATA: 0,
  } satisfies Record<EpisodeReconciliationClassification, number>;

  for (const candidate of opts.candidates) {
    byClassification[candidate.classification] += 1;
  }

  return {
    auditId: RECONCILIATION_AUDIT_ID,
    generatedAt: (opts.generatedAt ?? new Date()).toISOString(),
    mode: 'READ_ONLY',
    organizationScope: opts.organizationScope ?? null,
    vehicleScope: opts.vehicleScope ?? null,
    summary: {
      totalCandidates: opts.candidates.length,
      byClassification,
      applyEligibleCount: opts.candidates.filter((c) => c.applyEligible).length,
      reviewRequiredCount: opts.candidates.filter((c) => c.reviewRequired).length,
    },
    candidates: opts.candidates,
  };
}
