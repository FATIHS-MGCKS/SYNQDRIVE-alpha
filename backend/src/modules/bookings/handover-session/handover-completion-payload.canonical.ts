import { createHash } from 'crypto';
import type { HandoverKind } from '../handover.types';
import type { CreateHandoverProtocolPayload, HandoverTechnicalObservationDraft } from '../handover.types';
import { normalizeTechnicalObservationDrafts } from './handover-pickup-completion.executor';

export const HANDOVER_COMPLETION_PAYLOAD_VERSION = 1;

export interface HandoverCompletionCanonicalContext {
  organizationId: string;
  bookingId: string;
  vehicleId: string;
  customerId: string | null;
  stationId: string | null;
  kind: HandoverKind;
  documentVersion: number;
  protocolVersion: number;
  performedAt: string;
}

export interface HandoverCompletionCanonicalPayload {
  schemaVersion: number;
  organizationId: string;
  bookingId: string;
  vehicleId: string;
  customerId: string | null;
  stationId: string | null;
  kind: HandoverKind;
  documentVersion: number;
  protocolVersion: number;
  performedAt: string;
  odometerKm: number;
  fuelPercent: number;
  fuelFull: boolean;
  exteriorClean: boolean;
  interiorClean: boolean;
  tiresSeasonOk: boolean;
  warningLightsOn: boolean;
  warningLightsNotes: string | null;
  notes: string | null;
  documentsAcknowledged: boolean;
  damageIds: string[];
  technicalObservations: HandoverTechnicalObservationDraft[];
  customerSignatureName: string | null;
  customerSignatureDataUrl: string | null;
  staffSignatureName: string | null;
  staffSignatureDataUrl: string | null;
}

const SIGNED_CONTENT_KEYS: Array<keyof HandoverCompletionCanonicalPayload> = [
  'odometerKm',
  'fuelPercent',
  'fuelFull',
  'exteriorClean',
  'interiorClean',
  'tiresSeasonOk',
  'warningLightsOn',
  'warningLightsNotes',
  'notes',
  'documentsAcknowledged',
  'damageIds',
  'technicalObservations',
  'customerSignatureName',
  'customerSignatureDataUrl',
  'staffSignatureName',
  'staffSignatureDataUrl',
];

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const normalized: Record<string, unknown> = {};
  for (const key of keys) {
    normalized[key] = record[key];
  }
  return JSON.stringify(normalized, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const sortedKeys = Object.keys(val as Record<string, unknown>).sort();
      const sorted: Record<string, unknown> = {};
      for (const k of sortedKeys) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}

export function hashCanonicalValue(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function buildHandoverCompletionCanonicalPayload(
  payload: CreateHandoverProtocolPayload,
  context: HandoverCompletionCanonicalContext,
): HandoverCompletionCanonicalPayload {
  const damageIds = Array.isArray(payload.damageIds)
    ? [...payload.damageIds].filter((v): v is string => typeof v === 'string' && v.length > 0).sort()
    : [];

  return {
    schemaVersion: HANDOVER_COMPLETION_PAYLOAD_VERSION,
    organizationId: context.organizationId,
    bookingId: context.bookingId,
    vehicleId: context.vehicleId,
    customerId: context.customerId,
    stationId: context.stationId,
    kind: context.kind,
    documentVersion: context.documentVersion,
    protocolVersion: context.protocolVersion,
    performedAt: context.performedAt,
    odometerKm: Math.max(0, Math.round(payload.odometerKm)),
    fuelPercent: Math.max(0, Math.min(100, Math.round(payload.fuelPercent))),
    fuelFull: !!payload.fuelFull,
    exteriorClean: payload.exteriorClean ?? true,
    interiorClean: payload.interiorClean ?? true,
    tiresSeasonOk: payload.tiresSeasonOk ?? true,
    warningLightsOn: payload.warningLightsOn ?? false,
    warningLightsNotes: payload.warningLightsNotes?.trim() || null,
    notes: payload.notes?.trim() || null,
    documentsAcknowledged: !!payload.documentsAcknowledged,
    damageIds,
    technicalObservations: normalizeTechnicalObservationDrafts(payload.technicalObservations),
    customerSignatureName: payload.customerSignatureName?.trim() || null,
    customerSignatureDataUrl: payload.customerSignatureDataUrl?.trim() || null,
    staffSignatureName: payload.staffSignatureName?.trim() || null,
    staffSignatureDataUrl: payload.staffSignatureDataUrl?.trim() || null,
  };
}

export function hashHandoverCompletionPayload(
  canonical: HandoverCompletionCanonicalPayload,
): string {
  return hashCanonicalValue(canonical);
}

export function hashHandoverSignedContent(
  canonical: HandoverCompletionCanonicalPayload,
): string {
  const signedSubset: Record<string, unknown> = {};
  for (const key of SIGNED_CONTENT_KEYS) {
    signedSubset[key] = canonical[key];
  }
  return hashCanonicalValue(signedSubset);
}

export function signedHandoverContentChanged(
  previous: HandoverCompletionCanonicalPayload,
  next: HandoverCompletionCanonicalPayload,
): boolean {
  return hashHandoverSignedContent(previous) !== hashHandoverSignedContent(next);
}

export function assertHandoverSignaturesPresent(
  payload: CreateHandoverProtocolPayload,
): void {
  const hasCustomer = Boolean(
    payload.customerSignatureDataUrl?.trim() || payload.customerSignatureName?.trim(),
  );
  const hasStaff = Boolean(
    payload.staffSignatureDataUrl?.trim() || payload.staffSignatureName?.trim(),
  );
  if (!hasCustomer || !hasStaff) {
    throw new Error('SIGNATURE_REQUIRED');
  }
}
