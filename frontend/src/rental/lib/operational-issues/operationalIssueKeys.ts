import type { OperationalIssueDomain } from './operationalIssueTypes';

export function normalizeIssueType(rawType: string | null | undefined): string {
  if (!rawType) return 'unknown';
  return rawType
    .trim()
    .replace(/^[a-z-]+:/i, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export function createVehicleIssueKey(
  vehicleId: string,
  domain: OperationalIssueDomain,
  issueType: string,
): string {
  return `vehicle:${vehicleId}:${domainKeySegment(domain)}:${normalizeIssueType(issueType)}`;
}

export function createBookingIssueKey(
  bookingId: string,
  domain: OperationalIssueDomain,
  issueType: string,
): string {
  return `booking:${bookingId}:${domainKeySegment(domain)}:${normalizeIssueType(issueType)}`;
}

export function createTripIssueKey(
  tripId: string,
  domain: OperationalIssueDomain,
  issueType: string,
): string {
  return `trip:${tripId}:${domainKeySegment(domain)}:${normalizeIssueType(issueType)}`;
}

export function createInvoiceIssueKey(
  invoiceId: string,
  domain: OperationalIssueDomain,
  issueType: string,
): string {
  return `invoice:${invoiceId}:${domainKeySegment(domain)}:${normalizeIssueType(issueType)}`;
}

export function createDocumentIssueKey(
  scope: 'vehicle' | 'booking' | 'customer',
  id: string,
  issueType: string,
): string {
  return `${scope}:${id}:documents:${normalizeIssueType(issueType)}`;
}

export function createStationIssueKey(stationId: string, issueType: string): string {
  return `station:${stationId}:station_operations:${normalizeIssueType(issueType)}`;
}

function domainKeySegment(domain: OperationalIssueDomain): string {
  if (domain === 'vehicle_health') return 'health';
  return domain;
}

export function isServiceWindowKey(semanticKey: string): boolean {
  return /:service_window:available$/.test(semanticKey);
}

export function isServiceOverdueKey(semanticKey: string): boolean {
  return /:service_compliance:overdue$/.test(semanticKey);
}

export function serviceOverdueKeyForVehicle(vehicleId: string): string {
  return createVehicleIssueKey(vehicleId, 'service_compliance', 'overdue');
}

export function serviceWindowKeyForVehicle(vehicleId: string): string {
  return `vehicle:${vehicleId}:service_window:available`;
}
