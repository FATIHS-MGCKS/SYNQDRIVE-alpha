import { createHash } from 'crypto';
import { DrivingEventType, HardwareType } from '@prisma/client';
import {
  getVehicleCapabilities,
  usesNativeTelemetryEvents,
} from '../vehicle-capabilities';
import type { DimoVehicleEventRecord } from '../../dimo/dimo-segments.service';
import {
  buildDimoProviderEventId,
  parseDimoCounterValue,
} from '../../dimo/dimo-event-identity';
import {
  mapDimoEventName,
  resolveNativeSeverity,
} from '../trips/lte-r1-behavior-enrichment.service';

export const DIMO_BRAKING_EVENT_INTAKE_SCHEMA_VERSION =
  '20260717190000_dimo_braking_event_intake';

export const DIMO_BRAKING_RAW_SOURCE_VERSION = 'dimo-events-v1';

/** Official DIMO behavior.* braking event names (telemetry_introspect). */
export const DIMO_BRAKING_EVENT_NAMES = [
  'behavior.harshBraking',
  'behavior.extremeBraking',
  'behavior.extremeEmergency',
  'behavior.extremeEmergencyBraking',
] as const;

export type DimoBrakingEventName = (typeof DIMO_BRAKING_EVENT_NAMES)[number];

export type DimoBrakingCapabilityGateResult =
  | { allowed: true; brakingEventsHistoricallyAvailable: boolean | 'unknown' }
  | { allowed: false; reason: string };

export interface DimoEventDataSummaryRow {
  name: string;
  numberOfEvents: number;
  firstSeen?: string | null;
  lastSeen?: string | null;
}

export interface ParsedDimoBrakingSample {
  providerEventId: string;
  sourceFingerprint: string;
  eventType: Extract<DrivingEventType, 'HARSH_BRAKING' | 'EXTREME_BRAKING'>;
  eventTimestamp: Date;
  severity: number;
  dimoEventName: string;
  counterValue: number | null;
  durationNs: number;
}

export interface ExistingDrivingEventAuditRow {
  id: string;
  eventType: DrivingEventType;
  recordedAt: Date;
  metadataJson: Record<string, unknown> | null;
}

export interface DrivingEventMappingAuditResult {
  eventId: string;
  dimoEventName: string | null;
  expectedEventType: DrivingEventType | null;
  matchesCurrentMapping: boolean;
  note?: string;
}

export function isDimoBrakingEventName(name: string): boolean {
  return (DIMO_BRAKING_EVENT_NAMES as readonly string[]).includes(name);
}

export function buildDimoBrakingSourceFingerprint(input: {
  providerEventId: string;
  rawSourceVersion: string;
  eventType: DrivingEventType;
  severity: number;
  tripId: string | null;
}): string {
  const payload = [
    input.providerEventId,
    input.rawSourceVersion,
    input.eventType,
    input.severity,
    input.tripId ?? 'null',
  ].join(':');
  return createHash('sha256').update(payload).digest('hex').slice(0, 24);
}

export function parseDimoBrakingSample(
  sample: DimoVehicleEventRecord,
  tokenId: number,
  tripId: string | null,
): ParsedDimoBrakingSample | null {
  const mapped = mapDimoEventName(sample.name);
  if (!mapped) return null;
  if (
    mapped.eventType !== DrivingEventType.HARSH_BRAKING &&
    mapped.eventType !== DrivingEventType.EXTREME_BRAKING
  ) {
    return null;
  }

  const counterValue = parseDimoCounterValue(sample.metadata);
  const providerEventId = buildDimoProviderEventId({
    tokenId,
    timestamp: sample.timestamp,
    name: sample.name,
    source: sample.source,
    durationNs: sample.durationNs,
    counterValue,
  });
  const severity = resolveNativeSeverity(mapped.eventType, mapped.classification);

  return {
    providerEventId,
    sourceFingerprint: buildDimoBrakingSourceFingerprint({
      providerEventId,
      rawSourceVersion: DIMO_BRAKING_RAW_SOURCE_VERSION,
      eventType: mapped.eventType,
      severity,
      tripId,
    }),
    eventType: mapped.eventType,
    eventTimestamp: new Date(sample.timestamp),
    severity,
    dimoEventName: sample.name,
    counterValue,
    durationNs: sample.durationNs,
  };
}

export function assessDimoBrakingCapability(input: {
  hardwareType: HardwareType | null | undefined;
  provider?: string;
  eventDataSummary?: DimoEventDataSummaryRow[] | null;
}): DimoBrakingCapabilityGateResult {
  const provider = input.provider ?? 'DIMO';
  if (provider !== 'DIMO') {
    return { allowed: false, reason: 'unsupported_provider' };
  }

  const hardwareType = input.hardwareType ?? HardwareType.UNKNOWN;
  if (!usesNativeTelemetryEvents(hardwareType)) {
    return { allowed: false, reason: 'hardware_not_lte_r1' };
  }

  const caps = getVehicleCapabilities(hardwareType);
  if (!caps.nativeEventCapable) {
    return { allowed: false, reason: 'native_events_not_capable' };
  }

  const summary = input.eventDataSummary ?? null;
  if (!summary || summary.length === 0) {
    return { allowed: true, brakingEventsHistoricallyAvailable: 'unknown' };
  }

  const brakingRows = summary.filter((row) => isDimoBrakingEventName(row.name));
  if (brakingRows.length === 0) {
    return { allowed: true, brakingEventsHistoricallyAvailable: false };
  }

  const total = brakingRows.reduce((sum, row) => sum + (row.numberOfEvents ?? 0), 0);
  return { allowed: true, brakingEventsHistoricallyAvailable: total > 0 };
}

export function auditExistingDrivingEventMapping(
  rows: ExistingDrivingEventAuditRow[],
): DrivingEventMappingAuditResult[] {
  return rows.map((row) => {
    const metadata = row.metadataJson ?? {};
    const dimoEventName =
      typeof metadata.dimoEventName === 'string' ? metadata.dimoEventName : null;
    if (!dimoEventName) {
      return {
        eventId: row.id,
        dimoEventName,
        expectedEventType: null,
        matchesCurrentMapping: false,
        note: 'missing_dimo_event_name',
      };
    }

    const mapped = mapDimoEventName(dimoEventName);
    const expectedEventType = mapped?.eventType ?? null;
    const matchesCurrentMapping =
      expectedEventType != null && expectedEventType === row.eventType;

    return {
      eventId: row.id,
      dimoEventName,
      expectedEventType,
      matchesCurrentMapping,
      note: mapped ? undefined : 'unmapped_dimo_event_name',
    };
  });
}

export {
  parseDimoCounterValue,
  buildDimoProviderEventId as buildDimoBrakingProviderEventId,
} from '../../dimo/dimo-event-identity';
export {
  splitTimeWindowForPagination,
  dedupeDimoEventSamples,
  sleep,
  DIMO_DRIVING_EVENTS_PAGE_MS,
  DIMO_DRIVING_EVENTS_MAX_RETRIES,
  DIMO_DRIVING_EVENTS_RETRY_BASE_MS,
} from '../../dimo/dimo-driving-events.pagination';
