import type {
  SupportTicketCategory,
  SupportTicketRelatedEntityType,
} from '../../lib/api';
import type { SupportContextKind, SupportContextPreset } from './support.types';
import { sanitizeSourcePage } from './support-metadata';

export function buildSupportContextPreset(
  kind: SupportContextKind,
  data: Record<string, unknown> = {},
): SupportContextPreset {
  const sourcePage = sanitizeSourcePage(
    typeof data.sourcePage === 'string' ? data.sourcePage : undefined,
  );

  switch (kind) {
    case 'vehicle':
      return {
        kind,
        label: 'Support zu diesem Fahrzeug',
        category: 'VEHICLE',
        relatedEntityType: 'VEHICLE',
        relatedEntityId: String(data.vehicleId ?? data.id ?? ''),
        sourcePage,
        metadata: pickMeta(data, ['vehicleId', 'vin', 'licensePlate', 'make', 'model', 'year', 'station']),
      };
    case 'vehicle-health':
      return {
        kind,
        label: 'Problem mit Fahrzeugzustand melden',
        category: 'HEALTH',
        relatedEntityType: 'VEHICLE',
        relatedEntityId: String(data.vehicleId ?? ''),
        sourcePage,
        metadata: pickMeta(data, [
          'vehicleId',
          'vin',
          'licensePlate',
          'selectedTab',
          'healthStatusSummary',
          'overallState',
          'lastTelemetryAt',
        ]),
      };
    case 'booking':
      return {
        kind,
        label: 'Problem zu dieser Buchung melden',
        category: 'BOOKING',
        relatedEntityType: 'BOOKING',
        relatedEntityId: String(data.bookingId ?? data.id ?? ''),
        sourcePage,
        metadata: pickMeta(data, ['bookingId', 'bookingRef', 'customerName', 'vehicleId', 'status']),
      };
    case 'invoice':
      return {
        kind,
        label: 'Support zu dieser Rechnung',
        category: 'BILLING',
        relatedEntityType: 'INVOICE',
        relatedEntityId: String(data.invoiceId ?? data.id ?? ''),
        sourcePage,
        metadata: pickMeta(data, ['invoiceId', 'invoiceNumber', 'amountCents', 'status']),
      };
    case 'data-authorization':
      return {
        kind,
        label: 'Problem mit Datenfreigabe melden',
        category: 'DATA_AUTHORIZATION',
        relatedEntityType: 'AUTHORIZATION',
        relatedEntityId: String(data.authorizationId ?? data.id ?? ''),
        sourcePage,
        metadata: pickMeta(data, ['authorizationId', 'status', 'partnerName']),
      };
    case 'fleet-connectivity':
      return {
        kind,
        label: 'Problem mit Telemetrie melden',
        category: 'DIMO_TELEMETRY',
        relatedEntityType: (data.vehicleId ? 'VEHICLE' : 'CONNECTIVITY') as SupportTicketRelatedEntityType,
        relatedEntityId: String(data.vehicleId ?? data.linkId ?? data.id ?? ''),
        sourcePage,
        metadata: pickMeta(data, [
          'vehicleId',
          'licensePlate',
          'connectionStatus',
          'lastSeen',
          'provider',
          'readinessLevel',
        ]),
      };
    case 'document':
      return {
        kind,
        label: 'Problem mit diesem Dokument melden',
        category: 'DOCUMENTS',
        relatedEntityType: 'VEHICLE',
        relatedEntityId: String(data.vehicleId ?? ''),
        sourcePage,
        metadata: pickMeta(data, ['vehicleId', 'documentId', 'documentType', 'fileName']),
      };
    case 'task':
      return {
        kind,
        label: 'Support zu dieser Aufgabe',
        category: 'OTHER',
        relatedEntityType: 'VEHICLE',
        relatedEntityId: String(data.vehicleId ?? ''),
        sourcePage,
        metadata: pickMeta(data, ['taskId', 'taskTitle', 'vehicleId', 'taskType']),
      };
    default:
      return {
        kind: 'generic',
        label: 'Support kontaktieren',
        category: (data.category as SupportTicketCategory) ?? 'OTHER',
        sourcePage,
        metadata: pickMeta(data, []),
      };
  }
}

function pickMeta(data: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { contextKind: data.kind };
  for (const key of keys) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
      out[key] = data[key];
    }
  }
  return out;
}
