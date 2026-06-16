import {
  customerDocumentSlotToApiType,
  customerDocumentStatusApiToUi,
  customerDocumentStatusUiLabelDe,
} from '../../lib/entityMappers';
import type { CustomerDocumentRecord } from '../CustomerDocumentUploadBox';
import type { BookingRow, CustomerDetail, EligibilityStage, KycDocSlot } from './customerDetailTypes';

export const EM_DASH = '\u2014';

export function formatDate(raw?: string | Date | null): string {
  if (!raw) return EM_DASH;
  const d = typeof raw === 'string' ? new Date(raw) : raw;
  if (!d || Number.isNaN(d.getTime())) return EM_DASH;
  return d.toLocaleDateString('de-DE');
}

export function formatDateTime(raw?: string | Date | null): string {
  if (!raw) return EM_DASH;
  const d = typeof raw === 'string' ? new Date(raw) : raw;
  if (!d || Number.isNaN(d.getTime())) return EM_DASH;
  return d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatCurrencyCents(cents?: number | null, currency: string = 'EUR'): string {
  if (cents == null) return EM_DASH;
  try {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: (currency || 'EUR').toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} EUR`;
  }
}

export function bookingStatusLabelDe(raw?: string | null): string {
  switch ((raw || '').toUpperCase()) {
    case 'PENDING': return 'Ausstehend';
    case 'CONFIRMED': return 'Bestätigt';
    case 'ACTIVE': return 'Aktiv';
    case 'COMPLETED': return 'Abgeschlossen';
    case 'CANCELLED': return 'Storniert';
    case 'NO_SHOW': return 'No-Show';
    default: return raw || EM_DASH;
  }
}

export function computeBookingRevenueCents(row: BookingRow): number {
  if (row.totalPriceCents) return row.totalPriceCents;
  if (row.dailyRateCents && row.startDate && row.endDate) {
    const start = new Date(row.startDate).getTime();
    const end = new Date(row.endDate).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      const days = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
      return row.dailyRateCents * days;
    }
  }
  return 0;
}

export function sortBookingsNewestFirst(bookings: BookingRow[]): BookingRow[] {
  return [...bookings].sort((a, b) => {
    const ta = a.startDate ? new Date(a.startDate).getTime() : 0;
    const tb = b.startDate ? new Date(b.startDate).getTime() : 0;
    return tb - ta;
  });
}

export function buildKycDocSlots(
  customerDocuments: CustomerDocumentRecord[],
  detail: CustomerDetail | null,
): KycDocSlot[] {
  const legacyUrls: Record<string, string | null | undefined> = {
    'id-front': detail?.idFrontUrl,
    'id-back': detail?.idBackUrl,
    'license-front': detail?.licenseFrontUrl,
    'license-back': detail?.licenseBackUrl,
  };
  const byType = new Map<string, CustomerDocumentRecord>();
  for (const doc of customerDocuments) {
    const existing = byType.get(doc.type);
    if (!existing || (doc.createdAt && existing.createdAt && doc.createdAt > existing.createdAt)) {
      byType.set(doc.type, doc);
    }
  }
  const rows: KycDocSlot[] = [
    { slot: 'id-front', label: 'Personalausweis – Vorderseite', type: detail?.idType || 'Personalausweis', documentType: 'ID_FRONT', document: byType.get('ID_FRONT') ?? null, legacyPreviewUrl: legacyUrls['id-front'] ?? null, statusLabel: '' },
    { slot: 'id-back', label: 'Personalausweis – Rückseite', type: detail?.idType || 'Personalausweis', documentType: 'ID_BACK', document: byType.get('ID_BACK') ?? null, legacyPreviewUrl: legacyUrls['id-back'] ?? null, statusLabel: '' },
    { slot: 'license-front', label: 'Führerschein – Vorderseite', type: 'Führerschein', documentType: 'LICENSE_FRONT', document: byType.get('LICENSE_FRONT') ?? null, legacyPreviewUrl: legacyUrls['license-front'] ?? null, statusLabel: '' },
    { slot: 'license-back', label: 'Führerschein – Rückseite', type: 'Führerschein', documentType: 'LICENSE_BACK', document: byType.get('LICENSE_BACK') ?? null, legacyPreviewUrl: legacyUrls['license-back'] ?? null, statusLabel: '' },
  ];
  return rows.map((row) => ({
    ...row,
    statusLabel: customerDocumentStatusUiLabelDe(
      customerDocumentStatusApiToUi(
        row.document?.status,
        Boolean(row.document || row.legacyPreviewUrl),
      ),
    ),
  }));
}

export function hasLegacyDocumentsOnly(detail: CustomerDetail | null): boolean {
  if (!detail) return false;
  return Boolean(
    detail.idFrontUrl ||
      detail.idBackUrl ||
      detail.licenseFrontUrl ||
      detail.licenseBackUrl,
  );
}

export function eligibilityStageForCreate(
  eligibility: { canCreatePendingBooking: boolean; blockingReasons: string[] } | null,
): EligibilityStage {
  if (!eligibility) return 'blocked';
  if (!eligibility.canCreatePendingBooking || eligibility.blockingReasons.length > 0) {
    return 'blocked';
  }
  return 'allowed';
}

export function eligibilityStageForConfirm(
  eligibility: {
    canConfirmBooking: boolean;
    blockingReasons: string[];
    warnings: string[];
  } | null,
): EligibilityStage {
  if (!eligibility) return 'blocked';
  if (!eligibility.canConfirmBooking) return 'blocked';
  if (eligibility.warnings.length > 0) return 'warning';
  return 'allowed';
}

export function eligibilityStageForPickup(
  eligibility: { canStartRental: boolean; blockingReasons: string[] } | null,
): EligibilityStage {
  if (!eligibility) return 'blocked';
  if (!eligibility.canStartRental || eligibility.blockingReasons.length > 0) {
    return 'blocked';
  }
  return 'allowed';
}

export function overallRentalClearanceTone(
  eligibility: {
    blockingReasons: string[];
    warnings: string[];
    canCreatePendingBooking: boolean;
    canConfirmBooking: boolean;
    canStartRental: boolean;
  } | null,
): 'success' | 'warning' | 'critical' | 'neutral' {
  if (!eligibility) return 'neutral';
  if (
    eligibility.blockingReasons.length > 0 ||
    !eligibility.canCreatePendingBooking ||
    !eligibility.canConfirmBooking ||
    !eligibility.canStartRental
  ) {
    return 'critical';
  }
  if (eligibility.warnings.length > 0) return 'warning';
  return 'success';
}

export function overallRentalClearanceLabel(
  eligibility: {
    blockingReasons: string[];
    warnings: string[];
    canCreatePendingBooking: boolean;
    canConfirmBooking: boolean;
    canStartRental: boolean;
  } | null,
): string {
  const tone = overallRentalClearanceTone(eligibility);
  if (tone === 'critical') return 'Blockiert';
  if (tone === 'warning') return 'Warnung';
  if (tone === 'success') return 'Freigegeben';
  return 'Unbekannt';
}

export function resolveDocumentPreviewUrl(
  fileKey?: string | null,
  legacyUrl?: string | null,
): string | null {
  if (fileKey) {
    return fileKey.startsWith('http') || fileKey.startsWith('/')
      ? fileKey
      : `/uploads/${fileKey}`;
  }
  return legacyUrl ?? null;
}

export function customerDocumentSlotToApiTypeExport(
  slot: 'id-front' | 'id-back' | 'license-front' | 'license-back',
) {
  return customerDocumentSlotToApiType(slot);
}
