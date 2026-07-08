import type { StatusTone } from '../../../components/patterns';
import {
  customerDocumentSlotToApiType,
  customerDocumentStatusApiToUi,
  customerDocumentStatusUiLabelDe,
  type CustomerUiVerification,
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
    { slot: 'proof-of-address', label: 'Adressnachweis', type: 'Adressnachweis', documentType: 'PROOF_OF_ADDRESS', document: byType.get('PROOF_OF_ADDRESS') ?? null, legacyPreviewUrl: null, statusLabel: '' },
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

export type TimelineUserSummary = {
  chipLabel: string;
  chipTone: StatusTone;
  userTitle: string;
  userDescription?: string;
  timestamp?: string;
};

function isGermanCountry(country?: string | null): boolean {
  if (!country?.trim()) return false;
  const normalized = country.trim().toLowerCase();
  return normalized === 'de' || normalized === 'deutschland' || normalized === 'germany';
}

export function formatKycIdentityDocumentLabel(detail: CustomerDetail | null): string {
  const idType = detail?.idType?.trim() || 'Personalausweis';
  if (!isGermanCountry(detail?.country)) return idType;
  if (idType.toLowerCase().includes('reisepass')) return 'Deutscher Reisepass';
  if (idType.toLowerCase().includes('personalausweis')) return 'Deutscher Personalausweis';
  return `Deutscher ${idType}`;
}

export function formatKycLicenseDocumentLabel(detail: CustomerDetail | null): string {
  if (isGermanCountry(detail?.country)) return 'Deutscher Führerschein';
  return 'Führerschein';
}

export function kycSlotNeedsUpload(
  slot: KycDocSlot,
  options?: { replaceLegacy?: boolean },
): boolean {
  const status = slot.document?.status?.toUpperCase();
  if (status === 'VERIFIED') return false;
  if (slot.document && ['UPLOADED', 'PENDING_REVIEW'].includes(status ?? '')) return false;
  if (!slot.document && slot.legacyPreviewUrl && !options?.replaceLegacy) return false;
  return true;
}

export function findPrimaryKycDocument(
  slots: KycDocSlot[],
  documentTypes: KycDocSlot['documentType'][],
): CustomerDocumentRecord | null {
  const docs = slots
    .filter((slot) => documentTypes.includes(slot.documentType))
    .map((slot) => slot.document)
    .filter((doc): doc is CustomerDocumentRecord => Boolean(doc));

  const verified = docs
    .filter((doc) => doc.status?.toUpperCase() === 'VERIFIED')
    .sort((a, b) => String(b.reviewedAt ?? b.createdAt ?? '').localeCompare(String(a.reviewedAt ?? a.createdAt ?? '')));
  if (verified[0]) return verified[0];

  return docs.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0] ?? null;
}

export function findPendingKycDocument(
  slots: KycDocSlot[],
  documentTypes: KycDocSlot['documentType'][],
): CustomerDocumentRecord | null {
  for (const slot of slots) {
    if (!documentTypes.includes(slot.documentType)) continue;
    const doc = slot.document;
    if (doc && ['UPLOADED', 'PENDING_REVIEW'].includes(doc.status.toUpperCase())) {
      return doc;
    }
  }
  return null;
}

type TimelineEventLike = Record<string, unknown>;

function timelineEventType(event: TimelineEventLike): string {
  return String(event.type ?? event.eventType ?? '').toUpperCase();
}

function timelineMetadata(event: TimelineEventLike): Record<string, unknown> | null {
  const metadata = event.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return metadata as Record<string, unknown>;
}

function verificationKindFromEvent(event: TimelineEventLike): 'id' | 'license' | 'generic' {
  const title = String(event.title ?? '').toLowerCase();
  const metadata = timelineMetadata(event);
  const kind = String(metadata?.kind ?? '').toUpperCase();
  if (kind === 'ID_DOCUMENT' || title.includes('ausweis')) return 'id';
  if (kind === 'DRIVING_LICENSE' || title.includes('führerschein') || title.includes('fuehrerschein')) {
    return 'license';
  }
  return 'generic';
}

function describeVerificationOutcome(event: TimelineEventLike, positive: boolean): {
  userTitle: string;
  userDescription: string;
  chipLabel: string;
  chipTone: StatusTone;
} {
  const kind = verificationKindFromEvent(event);
  const title = String(event.title ?? '').toLowerCase();
  const kindLabel =
    kind === 'id' ? 'Ausweisprüfung' : kind === 'license' ? 'Führerscheinprüfung' : 'Dokumentprüfung';

  let userDescription = positive
    ? 'Prüfung erfolgreich abgeschlossen'
    : 'Das Dokument wurde nicht bestätigt';

  if (title.includes('automatische')) {
    userDescription = positive
      ? 'Automatisch über Verifikationsdienst bestätigt'
      : 'Automatisiert nicht bestätigt';
  } else if (title.includes('manuelle') || title.includes('manuell')) {
    userDescription = positive ? 'Manuell bestätigt' : 'Manuell abgelehnt';
  } else if (title.includes('pickup') || title.includes('übergabe')) {
    userDescription = positive ? 'Bei Fahrzeugübergabe bestätigt' : 'Bei Fahrzeugübergabe abgelehnt';
  }

  return {
    userTitle: positive ? `${kindLabel} erfolgreich` : `${kindLabel} abgelehnt`,
    userDescription,
    chipLabel: kind === 'generic' ? 'Dokument' : 'Verifikation',
    chipTone: positive ? 'success' : 'critical',
  };
}

export function mapTimelineEventToUserSummary(event: TimelineEventLike): TimelineUserSummary {
  const type = timelineEventType(event);
  const rawTitle = String(event.title ?? '').trim();
  const rawDescription = String(event.description ?? '').trim();
  const timestamp = event.createdAt ? formatDateTime(String(event.createdAt)) : undefined;

  if (type === 'DOCUMENT_VERIFIED') {
    const mapped = describeVerificationOutcome(event, true);
    return { ...mapped, timestamp };
  }

  if (type === 'DOCUMENT_REJECTED') {
    const mapped = describeVerificationOutcome(event, false);
    return { ...mapped, timestamp };
  }

  if (type === 'DOCUMENT_UPLOADED') {
    return {
      chipLabel: 'Dokument',
      chipTone: 'neutral',
      userTitle: 'Dokument hochgeladen',
      userDescription: rawTitle.replace(/^Dokument hochgeladen:\s*/i, '') || 'Neues Dokument eingereicht',
      timestamp,
    };
  }

  if (type === 'CREATED') {
    return {
      chipLabel: 'Kunde',
      chipTone: 'neutral',
      userTitle: 'Kunde angelegt',
      userDescription: 'Kundendatensatz wurde erstellt',
      timestamp,
    };
  }

  if (type === 'NOTE_ADDED') {
    return {
      chipLabel: 'Notiz',
      chipTone: 'neutral',
      userTitle: rawTitle || 'Notiz hinzugefügt',
      userDescription: rawDescription || undefined,
      timestamp,
    };
  }

  if (type === 'STATUS_CHANGED') {
    return {
      chipLabel: 'Status',
      chipTone: 'watch',
      userTitle: rawTitle || 'Status geändert',
      userDescription: rawDescription || 'Kundenstatus wurde aktualisiert',
      timestamp,
    };
  }

  if (type === 'RISK_CHANGED') {
    return {
      chipLabel: 'Risiko',
      chipTone: 'warning',
      userTitle: rawTitle || 'Risiko aktualisiert',
      userDescription: rawDescription || 'Risikoeinstufung wurde geändert',
      timestamp,
    };
  }

  if (type.startsWith('BOOKING_')) {
    return {
      chipLabel: 'Buchung',
      chipTone: 'neutral',
      userTitle: rawTitle || 'Buchungsereignis',
      userDescription: rawDescription || undefined,
      timestamp,
    };
  }

  if (type === 'PAYMENT_RECEIVED' || type === 'INVOICE_CREATED') {
    return {
      chipLabel: 'Finanzen',
      chipTone: 'neutral',
      userTitle: rawTitle || 'Finanzereignis',
      userDescription: rawDescription || undefined,
      timestamp,
    };
  }

  if (type === 'FINE_CREATED') {
    return {
      chipLabel: 'Bußgeld',
      chipTone: 'warning',
      userTitle: rawTitle || 'Bußgeld erfasst',
      userDescription: rawDescription || undefined,
      timestamp,
    };
  }

  const cleanedDescription =
    rawDescription &&
    !/kanonische verifikationsprüfung|webhook\/source of truth/i.test(rawDescription)
      ? rawDescription
      : undefined;

  return {
    chipLabel: 'Aktivität',
    chipTone: 'neutral',
    userTitle: rawTitle || 'Aktualisierung',
    userDescription: cleanedDescription,
    timestamp,
  };
}

export function formatDocumentVerificationMeta(
  document: CustomerDocumentRecord | null,
  verificationUi: CustomerUiVerification,
): string | null {
  if (!document) {
    if (verificationUi === 'Not Submitted') return 'Noch kein Dokument eingereicht';
    return null;
  }

  const lines: string[] = [];

  if (document.status?.toUpperCase() === 'VERIFIED') {
    if (document.reviewedByUserId) {
      lines.push('Verifiziert durch Manuell');
    } else {
      lines.push('Verifiziert automatisch');
    }
    if (document.reviewedAt) {
      lines.push(formatDateTime(document.reviewedAt));
    }
  } else if (document.createdAt) {
    lines.push(`Eingereicht am ${formatDateTime(document.createdAt)}`);
  }

  return lines.length > 0 ? lines.join(' · ') : null;
}

export function licenseVerificationHint(
  licenseUi: string,
  eligibilityBlockingReasons?: string[],
): string | null {
  if (licenseUi === 'Verified') return null;
  const pool = eligibilityBlockingReasons ?? [];
  return pool.find((text) => /führerschein|fuehrerschein|pickup/i.test(text.toLowerCase())) ?? null;
}
