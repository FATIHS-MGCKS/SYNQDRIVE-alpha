/**
 * Pure driving detector capability resolver (P32).
 */
import { DrivingCapabilityStatus } from '@prisma/client';
import type { ResolvedVehicleDrivingCapability } from '../driving-capability/vehicle-driving-capability.types';
import { DIMO_CAPABILITY_PREFLIGHT_VERSION } from '../driving-capability/dimo-preflight-classifier.config';
import { isEvPowertrain } from '../driving-signals/canonical-driving-signal-mapper.config';
import {
  DETECTOR_CADENCE_DEGRADED_MAX_MS,
  DETECTOR_MIN_COVERAGE_SHADOW,
  DRIVING_DETECTOR_REGISTRY,
  getDrivingDetectorDefinition,
  isLowerStatus,
  minStatus,
  type DrivingDetectorDefinition,
} from './driving-detector-capability.registry';
import {
  DRIVING_DETECTOR_CAPABILITY_VERSION,
  type DrivingDetectorCapabilityResolverInput,
  type DrivingDetectorCapabilityResult,
  type DrivingDetectorReasonCode,
  type DrivingDetectorSupportStatus,
  type ResolvedDrivingDetectorCapability,
} from './driving-detector-capability.types';

type CapabilityLookup = Map<string, ResolvedVehicleDrivingCapability>;

function buildLookup(capabilities: readonly ResolvedVehicleDrivingCapability[]): CapabilityLookup {
  const map = new Map<string, ResolvedVehicleDrivingCapability>();
  for (const row of capabilities) {
    if (row.resolutionSource !== 'persisted' || !row.row) continue;
    const key = row.signalName ?? row.detectorName ?? row.capabilityKey;
    if (key) map.set(key, row);
  }
  return map;
}

function deriveCapabilityVersion(
  capabilities: readonly ResolvedVehicleDrivingCapability[],
  override?: string | null,
): string {
  if (override?.trim()) return override.trim();
  const versions = new Set(
    capabilities
      .filter((c) => c.resolutionSource === 'persisted' && c.row?.capabilityVersion)
      .map((c) => c.row!.capabilityVersion),
  );
  if (versions.size === 1) return [...versions][0]!;
  if (versions.size > 1) return [...versions].sort().join('+');
  return 'capability-none-v0';
}

function aggregateCadence(
  rows: ResolvedVehicleDrivingCapability[],
): { effectiveCadenceMs: number | null; p95CadenceMs: number | null; coverage: number | null } {
  const effective = rows
    .map((r) => r.effectiveCadenceMs)
    .filter((v): v is number => v != null);
  const p95 = rows.map((r) => r.p95CadenceMs).filter((v): v is number => v != null);
  const coverage = rows.map((r) => r.coverage).filter((v): v is number => v != null);
  return {
    effectiveCadenceMs: effective.length ? Math.max(...effective) : null,
    p95CadenceMs: p95.length ? Math.max(...p95) : null,
    coverage: coverage.length ? Math.min(...coverage) : null,
  };
}

function isSupported(row: ResolvedVehicleDrivingCapability | undefined): boolean {
  return row?.capabilityStatus === DrivingCapabilityStatus.SUPPORTED;
}

function isDegraded(row: ResolvedVehicleDrivingCapability | undefined): boolean {
  return row?.capabilityStatus === DrivingCapabilityStatus.DEGRADED;
}

function isLimited(row: ResolvedVehicleDrivingCapability | undefined): boolean {
  return row?.capabilityStatus === DrivingCapabilityStatus.LIMITED;
}

function resolveNativeEvent(
  lookup: CapabilityLookup,
  eventName: string,
): { ok: boolean; observed: boolean; row?: ResolvedVehicleDrivingCapability } {
  const row = lookup.get(eventName);
  if (!isSupported(row)) {
    return { ok: false, observed: false, row };
  }
  return { ok: true, observed: row?.nativeEventAvailable === true, row };
}

function resolveSignal(
  lookup: CapabilityLookup,
  signalName: string,
): { ok: boolean; row?: ResolvedVehicleDrivingCapability } {
  const row = lookup.get(signalName);
  if (!row || row.capabilityStatus === DrivingCapabilityStatus.UNSUPPORTED) {
    return { ok: false, row };
  }
  return { ok: true, row };
}

function resolveSegmentDetector(
  lookup: CapabilityLookup,
  detectorName: string,
): { ok: boolean; row?: ResolvedVehicleDrivingCapability } {
  const row = lookup.get(detectorName);
  if (!row || row.capabilityStatus === DrivingCapabilityStatus.UNSUPPORTED) {
    return { ok: false, row };
  }
  return { ok: true, row };
}

function applyCadenceCoverageDowngrade(
  status: DrivingDetectorSupportStatus,
  reasons: DrivingDetectorReasonCode[],
  metrics: ReturnType<typeof aggregateCadence>,
  def: DrivingDetectorDefinition,
): DrivingDetectorSupportStatus {
  let next = status;
  if (
    def.maxEffectiveCadenceMs != null &&
    metrics.effectiveCadenceMs != null &&
    metrics.effectiveCadenceMs > def.maxEffectiveCadenceMs
  ) {
    reasons.push('INSUFFICIENT_CADENCE');
    next = minStatus(next, 'TEMPORARILY_DEGRADED');
  }
  if (
    def.maxP95CadenceMs != null &&
    metrics.p95CadenceMs != null &&
    metrics.p95CadenceMs > def.maxP95CadenceMs
  ) {
    reasons.push('INSUFFICIENT_CADENCE');
    next = minStatus(next, 'TEMPORARILY_DEGRADED');
  }
  if (
    def.minCoverage != null &&
    metrics.coverage != null &&
    metrics.coverage < def.minCoverage
  ) {
    reasons.push('INSUFFICIENT_COVERAGE');
    next = minStatus(next, 'TEMPORARILY_DEGRADED');
  }
  if (
    metrics.effectiveCadenceMs != null &&
    metrics.effectiveCadenceMs > DETECTOR_CADENCE_DEGRADED_MAX_MS &&
    isLowerStatus('SHADOW', next)
  ) {
    reasons.push('INSUFFICIENT_CADENCE');
    next = minStatus(next, 'SHADOW');
  }
  if (
    metrics.coverage != null &&
    metrics.coverage < DETECTOR_MIN_COVERAGE_SHADOW &&
    isLowerStatus('SHADOW', next)
  ) {
    reasons.push('INSUFFICIENT_COVERAGE');
    next = minStatus(next, 'SHADOW');
  }
  return next;
}

function capStatus(
  status: DrivingDetectorSupportStatus,
  ceiling: DrivingDetectorSupportStatus,
  reasons: DrivingDetectorReasonCode[],
): DrivingDetectorSupportStatus {
  if (isLowerStatus(ceiling, status)) {
    reasons.push('STATUS_CAPPED', 'NO_AUTOMATIC_PRODUCTION');
    return ceiling;
  }
  return status;
}

function resolveDetector(
  def: DrivingDetectorDefinition,
  input: DrivingDetectorCapabilityResolverInput,
  lookup: CapabilityLookup,
  capabilityVersion: string,
): ResolvedDrivingDetectorCapability {
  const reasons: DrivingDetectorReasonCode[] = [];
  const missingRequirements: string[] = [];
  const requiredSignals: string[] = [];
  const requiredNativeEvents: string[] = [];
  const requiredSegmentDetectors: string[] = [];

  for (const req of def.requirements) {
    if (req.kind === 'signal') requiredSignals.push(req.name);
    if (req.kind === 'native_event') requiredNativeEvents.push(req.name);
    if (req.kind === 'segment_detector') requiredSegmentDetectors.push(req.name);
  }

  const ev = isEvPowertrain(input.fuelType);
  if (def.iceOnly && ev) {
    return {
      detectorKey: def.key,
      label: def.label,
      status: 'UNSUPPORTED',
      reasons: ['POWERTRAIN_NOT_APPLICABLE'],
      requiredSignals,
      requiredNativeEvents,
      requiredSegmentDetectors,
      missingRequirements: [...requiredSignals, ...requiredNativeEvents],
      capabilityVersion,
      effectiveCadenceMs: null,
      p95CadenceMs: null,
      coverage: null,
      hardwareType: input.hardwareType,
    };
  }
  if (def.evOnly && !ev) {
    return {
      detectorKey: def.key,
      label: def.label,
      status: 'UNSUPPORTED',
      reasons: ['POWERTRAIN_NOT_APPLICABLE'],
      requiredSignals,
      requiredNativeEvents,
      requiredSegmentDetectors,
      missingRequirements: requiredSignals,
      capabilityVersion,
      effectiveCadenceMs: null,
      p95CadenceMs: null,
      coverage: null,
      hardwareType: input.hardwareType,
    };
  }

  const usedRows: ResolvedVehicleDrivingCapability[] = [];
  let degraded = false;

  const signalReqs = def.requirements.filter((r) => r.kind === 'signal');
  const nativeReqs = def.requirements.filter((r) => r.kind === 'native_event');
  const segmentReqs = def.requirements.filter((r) => r.kind === 'segment_detector');

  let signalsOk = true;
  if (def.requireAnySignal?.length) {
    const any = def.requireAnySignal.map((name) => resolveSignal(lookup, name));
    signalsOk = any.some((r) => r.ok);
    if (!signalsOk) {
      missingRequirements.push(...def.requireAnySignal);
    } else {
      for (const r of any) if (r.row) usedRows.push(r.row);
    }
  } else {
    for (const req of signalReqs) {
      const resolved = resolveSignal(lookup, req.name);
      if (!resolved.ok) {
        signalsOk = false;
        missingRequirements.push(req.name);
      } else if (resolved.row) {
        usedRows.push(resolved.row);
        if (isDegraded(resolved.row)) degraded = true;
      }
    }
  }

  let nativeObserved = false;
  let nativeListed = false;
  if (def.requireAnyNativeEvent) {
    const anyNative = nativeReqs.map((req) => resolveNativeEvent(lookup, req.name));
    nativeListed = anyNative.some((r) => r.ok);
    nativeObserved = anyNative.some((r) => r.observed);
    if (!nativeListed) {
      missingRequirements.push(...nativeReqs.map((r) => r.name));
    } else {
      for (const r of anyNative) if (r.row) usedRows.push(r.row!);
    }
  } else {
    for (const req of nativeReqs) {
      const resolved = resolveNativeEvent(lookup, req.name);
      if (!resolved.ok) {
        missingRequirements.push(req.name);
      } else {
        nativeListed = true;
        if (resolved.observed) nativeObserved = true;
        if (resolved.row) usedRows.push(resolved.row);
      }
    }
  }

  let segmentsOk = true;
  for (const req of segmentReqs) {
    const resolved = resolveSegmentDetector(lookup, req.name);
    if (!resolved.ok) {
      segmentsOk = false;
      missingRequirements.push(req.name);
      reasons.push('SEGMENTS_NOT_SUPPORTED');
    } else if (resolved.row) {
      usedRows.push(resolved.row);
      if (isDegraded(resolved.row)) degraded = true;
    }
  }

  const metrics = aggregateCadence(usedRows);

  if (missingRequirements.length > 0) {
    return {
      detectorKey: def.key,
      label: def.label,
      status: 'UNSUPPORTED',
      reasons: [
        ...reasons,
        nativeReqs.length && !nativeListed ? 'MISSING_REQUIRED_NATIVE_EVENT' : 'MISSING_REQUIRED_SIGNAL',
      ],
      requiredSignals,
      requiredNativeEvents,
      requiredSegmentDetectors,
      missingRequirements,
      capabilityVersion,
      effectiveCadenceMs: metrics.effectiveCadenceMs,
      p95CadenceMs: metrics.p95CadenceMs,
      coverage: metrics.coverage,
      hardwareType: input.hardwareType,
    };
  }

  if (degraded) {
    reasons.push('CAPABILITY_DEGRADED');
  }

  let status: DrivingDetectorSupportStatus = def.maxAutomaticStatus;

  if (def.productionRequiresNativeEvents) {
    if (nativeObserved) {
      status = 'PRODUCTION';
      reasons.push('NATIVE_EVENTS_AVAILABLE');
    } else if (nativeListed || signalsOk) {
      status = 'PROVIDER_DEPENDENT';
      reasons.push('NATIVE_EVENTS_NOT_OBSERVED');
    } else {
      status = 'UNSUPPORTED';
      reasons.push('MISSING_REQUIRED_NATIVE_EVENT');
    }
  } else if (!signalsOk || !segmentsOk) {
    status = 'UNSUPPORTED';
  }

  if (degraded) {
    status = minStatus(status, 'TEMPORARILY_DEGRADED');
  }

  status = applyCadenceCoverageDowngrade(status, reasons, metrics, def);

  if (!def.productionRequiresNativeEvents || !nativeObserved) {
    status = capStatus(status, def.maxAutomaticStatus, reasons);
  }

  return {
    detectorKey: def.key,
    label: def.label,
    status,
    reasons,
    requiredSignals,
    requiredNativeEvents,
    requiredSegmentDetectors,
    missingRequirements,
    capabilityVersion,
    effectiveCadenceMs: metrics.effectiveCadenceMs,
    p95CadenceMs: metrics.p95CadenceMs,
    coverage: metrics.coverage,
    hardwareType: input.hardwareType,
  };
}

/**
 * Resolve per-detector support for a vehicle from persisted capability probes.
 * Hardware type alone never upgrades status.
 */
export function resolveDrivingDetectorCapabilities(
  input: DrivingDetectorCapabilityResolverInput,
): DrivingDetectorCapabilityResult {
  const lookup = buildLookup(input.capabilities);
  const capabilityVersion =
    deriveCapabilityVersion(input.capabilities, input.capabilityVersion) ||
    DIMO_CAPABILITY_PREFLIGHT_VERSION;

  const detectors = DRIVING_DETECTOR_REGISTRY.map((def) =>
    resolveDetector(def, input, lookup, capabilityVersion),
  );

  return {
    resolverVersion: DRIVING_DETECTOR_CAPABILITY_VERSION,
    capabilityVersion,
    hardwareType: input.hardwareType,
    fuelType: input.fuelType ?? null,
    hardwareBaselineLabel: input.hardwareBaselineLabel ?? null,
    resolvedAt: (input.resolvedAt ?? new Date()).toISOString(),
    detectors,
  };
}

export function getDetectorCapability(
  result: DrivingDetectorCapabilityResult,
  key: Parameters<typeof getDrivingDetectorDefinition>[0],
): ResolvedDrivingDetectorCapability | undefined {
  return result.detectors.find((d) => d.detectorKey === key);
}
