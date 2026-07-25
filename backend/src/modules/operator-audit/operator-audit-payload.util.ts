import type { CreateHandoverProtocolPayload } from '@modules/bookings/handover.types';

const DATA_URL_PATTERN = /data:image\/[a-zA-Z+]+;base64,/;

export function minimizeOperatorAuditState(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (isOperatorAuditSensitiveKey(key)) {
      out[key] = summarizeSensitiveField(key, raw);
      continue;
    }
    if (typeof raw === 'string' && DATA_URL_PATTERN.test(raw)) {
      out[key] = '[binary-data-url]';
      continue;
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      out[key] = minimizeOperatorAuditState(raw as Record<string, unknown>) ?? {};
      continue;
    }
    out[key] = raw;
  }
  return out;
}

export function minimizeHandoverProtocolPayload(payload: CreateHandoverProtocolPayload) {
  return {
    actualStationId: payload.actualStationId ?? null,
    odometerKm: payload.odometerKm ?? null,
    fuelPercent: payload.fuelPercent ?? null,
    fuelFull: payload.fuelFull ?? null,
    warningLightsOn: payload.warningLightsOn ?? null,
    damageIdCount: payload.damageIds?.length ?? 0,
    technicalObservationCount: payload.technicalObservations?.length ?? 0,
    hasCustomerSignature: Boolean(payload.customerSignatureDataUrl),
    hasStaffSignature: Boolean(payload.staffSignatureDataUrl),
    pickupGateOverrideReason: payload.pickupGateOverrideReason ? '[present]' : null,
  };
}

export function minimizeBookingAuditState(booking: {
  id?: string;
  status?: string;
  vehicleId?: string | null;
  customerId?: string | null;
  pickupStationId?: string | null;
  returnStationId?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}) {
  return {
    id: booking.id,
    status: booking.status,
    vehicleId: booking.vehicleId ?? null,
    customerId: booking.customerId ?? null,
    pickupStationId: booking.pickupStationId ?? null,
    returnStationId: booking.returnStationId ?? null,
    startDate: booking.startDate ? String(booking.startDate) : null,
    endDate: booking.endDate ? String(booking.endDate) : null,
  };
}

export function minimizeDamageAuditState(damage: {
  id?: string;
  status?: string;
  severity?: string;
  evidenceStatus?: string;
  damageType?: string;
  bookingId?: string | null;
  imageCount?: number;
}) {
  return {
    id: damage.id,
    status: damage.status,
    severity: damage.severity,
    evidenceStatus: damage.evidenceStatus,
    damageType: damage.damageType,
    bookingId: damage.bookingId ?? null,
    imageCount: damage.imageCount ?? 0,
  };
}

function isOperatorAuditSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k.includes('signature') ||
    k.includes('image') ||
    k.includes('token') ||
    k.includes('password') ||
    k.includes('email') ||
    k.includes('phone') ||
    k.includes('document') ||
    k.includes('extracted') ||
    k.includes('ocr') ||
    k.includes('payload')
  );
}

function summarizeSensitiveField(key: string, value: unknown): string {
  if (value == null) return '[empty]';
  if (typeof value === 'boolean') return value ? '[present]' : '[absent]';
  if (Array.isArray(value)) return `[array:${value.length}]`;
  if (typeof value === 'object') return '[object]';
  if (typeof value === 'string' && DATA_URL_PATTERN.test(value)) return '[binary-data-url]';
  return '[redacted]';
}
