/**
 * Pure classification helpers for DIMO available-signals preflight (P29).
 */
import { DrivingCapabilityStatus } from '@prisma/client';
import type { DimoDataSummaryPayload, DimoEventDataSummaryRow } from '../../dimo/queries/data-summary.query';
import type { PreflightSignalDefinition } from './dimo-preflight-classifier.config';
import {
  isSignalApplicable,
  PREFLIGHT_SEGMENT_DETECTOR,
  PREFLIGHT_NATIVE_EVENT_KEYS,
} from './dimo-preflight-classifier.config';

export type ClassifiedProbe = {
  capabilityKey: string;
  signalName?: string | null;
  detectorName?: string | null;
  capabilityStatus: DrivingCapabilityStatus;
  nativeEventAvailable?: boolean;
  effectiveCadenceMs?: number | null;
  p95CadenceMs?: number | null;
  coverage?: number | null;
  lastSeenAt?: Date | null;
  metadata: Record<string, unknown>;
};

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function eventRowMap(
  summary: DimoDataSummaryPayload | null,
): Map<string, DimoEventDataSummaryRow> {
  const map = new Map<string, DimoEventDataSummaryRow>();
  for (const row of summary?.eventDataSummary ?? []) {
    if (row?.name) map.set(row.name, row);
  }
  return map;
}

export function classifySignalProbe(
  def: PreflightSignalDefinition,
  available: Set<string>,
  fuelType: string | null | undefined,
  dataSummary: DimoDataSummaryPayload | null,
  checkedAt: Date,
): ClassifiedProbe {
  if (!isSignalApplicable(def, fuelType)) {
    return {
      capabilityKey: def.dimoSignalName,
      signalName: def.dimoSignalName,
      capabilityStatus: DrivingCapabilityStatus.UNSUPPORTED,
      metadata: {
        preflightKey: def.key,
        label: def.label,
        category: def.category,
        reason: 'powertrain_not_applicable',
        source: 'DIMO_AVAILABLE_SIGNALS',
      },
      lastSeenAt: null,
      coverage: null,
    };
  }

  const listed = available.has(def.dimoSignalName);
  const status = listed
    ? DrivingCapabilityStatus.SUPPORTED
    : DrivingCapabilityStatus.UNSUPPORTED;

  let coverage: number | null = null;
  if (listed && dataSummary?.numberOfSignals != null && dataSummary.numberOfSignals > 0) {
    coverage = 1;
  }

  return {
    capabilityKey: def.dimoSignalName,
    signalName: def.dimoSignalName,
    capabilityStatus: status,
    metadata: {
      preflightKey: def.key,
      label: def.label,
      category: def.category,
      listedInAvailableSignals: listed,
      reason: listed ? 'listed_in_available_signals' : 'signal_not_in_availableSignals',
      source: 'DIMO_AVAILABLE_SIGNALS',
      dataSummarySignalCount: dataSummary?.numberOfSignals ?? null,
    },
    lastSeenAt: listed ? parseIsoDate(dataSummary?.lastSignalSeen) ?? checkedAt : null,
    effectiveCadenceMs: null,
    p95CadenceMs: null,
    coverage,
  };
}

export function classifyNativeEventProbes(
  dataSummary: DimoDataSummaryPayload | null,
  checkedAt: Date,
): ClassifiedProbe[] {
  const events = eventRowMap(dataSummary);
  return PREFLIGHT_NATIVE_EVENT_KEYS.map((eventName) => {
    const row = events.get(eventName);
    const count = row?.numberOfEvents ?? 0;
    const hasEvents = count > 0;
    const lastSeen = parseIsoDate(row?.lastSeen);

    return {
      capabilityKey: eventName,
      signalName: eventName,
      capabilityStatus: hasEvents
        ? DrivingCapabilityStatus.SUPPORTED
        : DrivingCapabilityStatus.UNSUPPORTED,
      nativeEventAvailable: hasEvents,
      lastSeenAt: lastSeen ?? (hasEvents ? checkedAt : null),
      effectiveCadenceMs: null,
      p95CadenceMs: null,
      coverage: hasEvents ? 1 : 0,
      metadata: {
        source: 'DIMO_DATA_SUMMARY',
        eventName,
        numberOfEvents: count,
        firstSeen: row?.firstSeen ?? null,
        lastSeen: row?.lastSeen ?? null,
        reason: hasEvents ? 'native_events_observed' : 'native_events_absent',
      },
    };
  });
}

export function classifySegmentsProbe(
  available: Set<string>,
  dataSummary: DimoDataSummaryPayload | null,
  checkedAt: Date,
): ClassifiedProbe {
  const hasSpeed = available.has('speed');
  const hasOdometer = available.has('powertrainTransmissionTravelledDistance');
  let status: DrivingCapabilityStatus = DrivingCapabilityStatus.UNSUPPORTED;
  if (hasSpeed && hasOdometer) {
    status = DrivingCapabilityStatus.SUPPORTED;
  } else if (hasSpeed) {
    status = DrivingCapabilityStatus.LIMITED;
  }

  return {
    capabilityKey: PREFLIGHT_SEGMENT_DETECTOR,
    detectorName: PREFLIGHT_SEGMENT_DETECTOR,
    capabilityStatus: status,
    metadata: {
      source: 'DIMO_AVAILABLE_SIGNALS',
      hasSpeed,
      hasOdometer,
      reason: hasSpeed && hasOdometer
        ? 'segment_prerequisites_listed'
        : hasSpeed
          ? 'segments_limited_missing_odometer'
          : 'segments_unsupported_missing_speed',
      dataSummarySignalCount: dataSummary?.numberOfSignals ?? null,
    },
    lastSeenAt: parseIsoDate(dataSummary?.lastSignalSeen) ?? checkedAt,
    effectiveCadenceMs: null,
    p95CadenceMs: null,
    coverage: hasSpeed ? 1 : 0,
  };
}

export function buildPreflightProbes(input: {
  availableSignals: string[];
  dataSummary: DimoDataSummaryPayload | null;
  catalog: readonly PreflightSignalDefinition[];
  fuelType: string | null | undefined;
  checkedAt: Date;
}): ClassifiedProbe[] {
  const available = new Set(input.availableSignals);
  const signalProbes = input.catalog.map((def) =>
    classifySignalProbe(def, available, input.fuelType, input.dataSummary, input.checkedAt),
  );
  return [
    ...signalProbes,
    ...classifyNativeEventProbes(input.dataSummary, input.checkedAt),
    classifySegmentsProbe(available, input.dataSummary, input.checkedAt),
  ];
}
