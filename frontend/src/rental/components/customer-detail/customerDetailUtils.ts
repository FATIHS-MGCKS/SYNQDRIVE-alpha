import type { StatusTone } from '../../../components/patterns';
import {
  customerDocumentSlotToApiType,
  customerDocumentStatusApiToUi,
  customerDocumentStatusUiLabelDe,
  customerRiskUiLabelDe,
  customerStatusApiToUi,
  customerStatusUiLabelDe,
  customerVerificationApiToUi,
  type CustomerUiVerification,
} from '../../lib/entityMappers';
import type { ProofOfAddressEligibilityStatus } from '../../lib/customer-verification';
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
  eligibility: { canCreatePendingBooking: boolean } | null,
): EligibilityStage {
  if (!eligibility) return 'blocked';
  if (!eligibility.canCreatePendingBooking) return 'blocked';
  return 'allowed';
}

export function eligibilityStageForConfirm(
  eligibility: {
    canConfirmBooking: boolean;
    warnings: string[];
  } | null,
): EligibilityStage {
  if (!eligibility) return 'blocked';
  if (!eligibility.canConfirmBooking) return 'blocked';
  if (eligibility.warnings.length > 0) return 'warning';
  return 'allowed';
}

export function eligibilityStageForPickup(
  eligibility: { canStartRental: boolean } | null,
): EligibilityStage {
  if (!eligibility) return 'blocked';
  if (!eligibility.canStartRental) return 'blocked';
  return 'allowed';
}

export function overallRentalClearanceTone(
  eligibility: {
    globalBlockingReasons?: string[];
    blockingReasons: string[];
    warnings: string[];
    canCreatePendingBooking: boolean;
    canConfirmBooking: boolean;
    canStartRental: boolean;
  } | null,
): 'success' | 'warning' | 'critical' | 'neutral' {
  if (!eligibility) return 'neutral';
  const globalReasons =
    eligibility.globalBlockingReasons ?? eligibility.blockingReasons;
  if (globalReasons.length > 0 || !eligibility.canCreatePendingBooking) {
    return 'critical';
  }
  if (!eligibility.canConfirmBooking) return 'critical';
  if (!eligibility.canStartRental) return 'warning';
  if (eligibility.warnings.length > 0) return 'warning';
  return 'success';
}

export function overallRentalClearanceLabel(
  eligibility: {
    globalBlockingReasons?: string[];
    blockingReasons: string[];
    warnings: string[];
    canCreatePendingBooking: boolean;
    canConfirmBooking: boolean;
    canStartRental: boolean;
  } | null,
): string {
  const tone = overallRentalClearanceTone(eligibility);
  if (!eligibility) return 'Unbekannt';
  const globalReasons =
    eligibility.globalBlockingReasons ?? eligibility.blockingReasons;
  if (globalReasons.length > 0 || !eligibility.canCreatePendingBooking) {
    return 'Blockiert';
  }
  if (!eligibility.canConfirmBooking) return 'Eingeschränkt';
  if (!eligibility.canStartRental) return 'Pickup-Prüfung erforderlich';
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

export type TimelineFilterCategory =
  | 'document'
  | 'booking'
  | 'status'
  | 'risk'
  | 'payment'
  | 'fine'
  | 'note';

export type TimelineUserSummary = {
  chipLabel: string;
  chipTone: StatusTone;
  userTitle: string;
  userDescription?: string;
  timestamp?: string;
};

export type TimelineUserEntry = TimelineUserSummary & {
  filterType: TimelineFilterCategory;
  userTypeLabel: string;
  createdByLabel?: string;
  formattedTimestamp: string;
  tone: StatusTone;
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

const ID_DOCUMENT_TYPES = ['ID_FRONT', 'ID_BACK'] as const;
const LICENSE_DOCUMENT_TYPES = ['LICENSE_FRONT', 'LICENSE_BACK'] as const;
const PROOF_OF_ADDRESS_TYPES = ['PROOF_OF_ADDRESS'] as const;

type KycDocumentType = KycDocSlot['documentType'];

function isCanonicalVerificationVerified(
  verificationStatus?: string | null,
  verifiedFlag?: boolean | null,
): boolean {
  if (verifiedFlag === true) return true;
  if (String(verificationStatus ?? '').toUpperCase() === 'VERIFIED') return true;
  return customerVerificationApiToUi(verificationStatus ?? undefined) === 'Verified';
}

function isDocumentGroupVerifiedBySlots(
  slots: KycDocSlot[],
  documentTypes: readonly KycDocumentType[],
): boolean {
  return slots
    .filter((slot) => documentTypes.includes(slot.documentType))
    .some((slot) => slot.document?.status?.toUpperCase() === 'VERIFIED');
}

export function isIdDocumentGroupFulfilled(
  detail: CustomerDetail | null,
  kycDocSlots: KycDocSlot[],
): boolean {
  return (
    isCanonicalVerificationVerified(detail?.idVerificationStatus, detail?.idVerified) ||
    isDocumentGroupVerifiedBySlots(kycDocSlots, ID_DOCUMENT_TYPES)
  );
}

export function isLicenseDocumentGroupFulfilled(
  detail: CustomerDetail | null,
  kycDocSlots: KycDocSlot[],
): boolean {
  return (
    isCanonicalVerificationVerified(detail?.licenseVerificationStatus, detail?.licenseVerified) ||
    isDocumentGroupVerifiedBySlots(kycDocSlots, LICENSE_DOCUMENT_TYPES)
  );
}

export function isProofOfAddressGroupFulfilled(
  kycDocSlots: KycDocSlot[],
  proofOfAddressEligibility?: ProofOfAddressEligibilityStatus | null,
): boolean {
  if (
    proofOfAddressEligibility === 'not_required' ||
    proofOfAddressEligibility === 'verified'
  ) {
    return true;
  }
  return isDocumentGroupVerifiedBySlots(kycDocSlots, PROOF_OF_ADDRESS_TYPES);
}

export function mapMissingUploadSlotsFromBackend(
  missingSlots: Array<{ slot: string; label: string; documentType: string }> | undefined,
  kycDocSlots: KycDocSlot[],
  replaceLegacy?: boolean,
): KycDocSlot[] {
  if (!missingSlots?.length) return [];
  return missingSlots.map((slot) => {
    const slotKey = slot.slot as KycDocSlot['slot'];
    const existing = kycDocSlots.find((row) => row.documentType === slot.documentType);
    if (existing) {
      if (!replaceLegacy && !existing.document && existing.legacyPreviewUrl) {
        return existing;
      }
      return {
        ...existing,
        label: slot.label,
        slot: slotKey,
      };
    }
    return {
      slot: slotKey,
      label: slot.label,
      type: slot.label,
      documentType: slot.documentType as KycDocSlot['documentType'],
      document: null,
      legacyPreviewUrl: null,
      statusLabel: '',
    };
  });
}

export function getMissingUploadSlots({
  detail,
  kycDocSlots,
  replaceLegacy,
  proofOfAddressEligibility,
}: {
  detail: CustomerDetail | null;
  kycDocSlots: KycDocSlot[];
  replaceLegacy?: boolean;
  proofOfAddressEligibility?: ProofOfAddressEligibilityStatus | null;
}): KycDocSlot[] {
  const idFulfilled = isIdDocumentGroupFulfilled(detail, kycDocSlots);
  const licenseFulfilled = isLicenseDocumentGroupFulfilled(detail, kycDocSlots);
  const poaFulfilled = isProofOfAddressGroupFulfilled(kycDocSlots, proofOfAddressEligibility);

  return kycDocSlots.filter((slot) => {
    if (
      (slot.documentType === 'ID_FRONT' || slot.documentType === 'ID_BACK') &&
      idFulfilled
    ) {
      return false;
    }
    if (
      (slot.documentType === 'LICENSE_FRONT' || slot.documentType === 'LICENSE_BACK') &&
      licenseFulfilled
    ) {
      return false;
    }
    if (slot.documentType === 'PROOF_OF_ADDRESS' && poaFulfilled) {
      return false;
    }
    return kycSlotNeedsUpload(slot, { replaceLegacy });
  });
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

function isTechnicalTimelineDescription(text: string): boolean {
  return /kanonische verifikationsprüfung|webhook\/source of truth/i.test(text);
}

function sanitizeTimelineDescription(text?: string | null): string | undefined {
  const trimmed = String(text ?? '').trim();
  if (!trimmed || isTechnicalTimelineDescription(trimmed)) return undefined;
  return trimmed;
}

function customerStatusLabelFromApi(raw?: unknown): string | undefined {
  const value = String(raw ?? '').trim();
  if (!value) return undefined;
  return customerStatusUiLabelDe(customerStatusApiToUi(value));
}

function customerRiskLabelFromApi(raw?: unknown): string | undefined {
  const value = String(raw ?? '').trim().toUpperCase();
  if (!value) return undefined;
  switch (value) {
    case 'NOT_ASSESSED':
      return customerRiskUiLabelDe('Not Assessed');
    case 'LOW':
      return customerRiskUiLabelDe('Low Risk');
    case 'MEDIUM':
      return customerRiskUiLabelDe('Medium Risk');
    case 'HIGH':
      return customerRiskUiLabelDe('High Risk');
    default:
      return undefined;
  }
}

export function timelineEventFilterCategory(event: TimelineEventLike): TimelineFilterCategory {
  const type = timelineEventType(event);
  if (type.includes('NOTE')) return 'note';
  if (type.includes('DOCUMENT')) return 'document';
  if (type.includes('BOOKING') || type === 'PICKUP_COMPLETED' || type === 'RETURN_COMPLETED') {
    return 'booking';
  }
  if (type.includes('STATUS')) return 'status';
  if (type.includes('RISK')) return 'risk';
  if (type.includes('PAYMENT') || type.includes('INVOICE')) return 'payment';
  if (type.includes('FINE')) return 'fine';
  return 'status';
}

export function timelineEventMatchesFilter(
  event: TimelineEventLike,
  filter: TimelineFilterCategory | 'all',
): boolean {
  if (filter === 'all') return true;
  return timelineEventFilterCategory(event) === filter;
}

function describeStatusChanged(event: TimelineEventLike): Pick<TimelineUserSummary, 'userTitle' | 'userDescription' | 'chipLabel' | 'chipTone'> {
  const rawTitle = String(event.title ?? '').trim();
  const metadata = timelineMetadata(event);
  const lowered = rawTitle.toLowerCase();

  if (lowered.includes('archived') || lowered.includes('archiviert')) {
    return {
      chipLabel: 'Status',
      chipTone: 'watch',
      userTitle: 'Kunde archiviert',
      userDescription: 'Kundendatensatz wurde archiviert',
    };
  }

  const toLabel = customerStatusLabelFromApi(metadata?.to);
  const fromLabel = customerStatusLabelFromApi(metadata?.from);
  const parsedTo = rawTitle.match(/status changed to\s+([A-Z_]+)/i)?.[1];
  const resolvedTo = toLabel ?? customerStatusLabelFromApi(parsedTo);

  return {
    chipLabel: 'Status',
    chipTone: 'watch',
    userTitle: 'Kundenstatus geändert',
    userDescription: resolvedTo
      ? fromLabel
        ? `Von „${fromLabel}“ auf „${resolvedTo}“`
        : `Status auf „${resolvedTo}“ gesetzt`
      : sanitizeTimelineDescription(String(event.description ?? '')) ?? 'Kundenstatus wurde aktualisiert',
  };
}

function describeRiskChanged(event: TimelineEventLike): Pick<TimelineUserSummary, 'userTitle' | 'userDescription' | 'chipLabel' | 'chipTone'> {
  const metadata = timelineMetadata(event);
  const rawTitle = String(event.title ?? '').trim();
  const parsedRisk = rawTitle.match(/risk set to\s+([A-Z_]+)/i)?.[1];
  const riskLabel =
    customerRiskLabelFromApi(metadata?.riskLevel) ?? customerRiskLabelFromApi(parsedRisk);

  return {
    chipLabel: 'Risiko',
    chipTone: 'warning',
    userTitle: 'Risikobewertung aktualisiert',
    userDescription: riskLabel
      ? `Risiko auf „${riskLabel}“ gesetzt`
      : sanitizeTimelineDescription(String(event.description ?? '')) ?? 'Risikoeinstufung wurde geändert',
  };
}

function describeBookingEvent(type: string, rawTitle: string, rawDescription: string): Pick<TimelineUserSummary, 'userTitle' | 'userDescription' | 'chipLabel' | 'chipTone'> {
  const titleMap: Record<string, string> = {
    BOOKING_CREATED: 'Buchung angelegt',
    BOOKING_CONFIRMED: 'Buchung bestätigt',
    BOOKING_CANCELLED: 'Buchung storniert',
    BOOKING_NO_SHOW: 'No-Show erfasst',
    PICKUP_COMPLETED: 'Fahrzeugübergabe abgeschlossen',
    RETURN_COMPLETED: 'Fahrzeugrückgabe abgeschlossen',
  };

  return {
    chipLabel: 'Buchung',
    chipTone: type === 'BOOKING_CANCELLED' || type === 'BOOKING_NO_SHOW' ? 'warning' : 'neutral',
    userTitle: titleMap[type] ?? (rawTitle || 'Buchungsereignis'),
    userDescription: sanitizeTimelineDescription(rawDescription),
  };
}

function resolveTimelineCreatedByLabel(event: TimelineEventLike): string | undefined {
  const createdByName = String(event.createdByName ?? '').trim();
  if (createdByName) return `von ${createdByName}`;

  const type = timelineEventType(event);
  const title = String(event.title ?? '').toLowerCase();
  const metadata = timelineMetadata(event);
  const provider = String(metadata?.provider ?? '').toLowerCase();

  if (title.includes('automatische') || provider === 'didit') {
    return 'über Verifikationsdienst';
  }
  if (title.includes('manuelle') || title.includes('manuell')) {
    return 'manuell geprüft';
  }
  if (title.includes('pickup') || title.includes('übergabe')) {
    return 'bei Fahrzeugübergabe';
  }

  if (
    !event.createdByUserId &&
    (type === 'DOCUMENT_VERIFIED' || type === 'DOCUMENT_REJECTED' || type === 'CREATED')
  ) {
    return type === 'CREATED' ? 'System' : 'automatisch';
  }

  return undefined;
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
    chipLabel: 'Dokument',
    chipTone: positive ? 'success' : 'critical',
  };
}

export function mapTimelineEventToUserSummary(event: TimelineEventLike): TimelineUserSummary {
  const type = timelineEventType(event);
  const rawTitle = String(event.title ?? '').trim();
  const rawDescription = sanitizeTimelineDescription(String(event.description ?? '').trim());
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

  if (type === 'NOTE_ADDED' || type === 'NOTE_CREATED') {
    const metadata = timelineMetadata(event);
    const titleLower = rawTitle.toLowerCase();
    if (
      (titleLower.includes('dokument') && titleLower.includes('e-mail')) ||
      (metadata?.bookingId && Array.isArray(metadata.documentIds))
    ) {
      const recipient = typeof metadata?.to === 'string' ? metadata.to : null;
      return {
        chipLabel: 'Versand',
        chipTone: 'success',
        userTitle: 'Dokumente per E-Mail gesendet',
        userDescription: recipient
          ? `Empfänger: ${recipient}`
          : rawDescription || 'Buchungsunterlagen versendet',
        timestamp,
      };
    }
    return {
      chipLabel: 'Notiz',
      chipTone: 'neutral',
      userTitle: rawTitle && !/^note added$/i.test(rawTitle) ? rawTitle : 'Notiz hinzugefügt',
      userDescription: rawDescription,
      timestamp,
    };
  }

  if (type === 'STATUS_CHANGED') {
    return { ...describeStatusChanged(event), timestamp };
  }

  if (type === 'RISK_CHANGED' || type === 'RISK_UPDATED') {
    return { ...describeRiskChanged(event), timestamp };
  }

  if (type.startsWith('BOOKING_') || type === 'PICKUP_COMPLETED' || type === 'RETURN_COMPLETED') {
    return { ...describeBookingEvent(type, rawTitle, rawDescription ?? ''), timestamp };
  }

  if (type === 'PAYMENT_RECEIVED') {
    return {
      chipLabel: 'Zahlung',
      chipTone: 'success',
      userTitle: rawTitle || 'Zahlung eingegangen',
      userDescription: rawDescription,
      timestamp,
    };
  }

  if (type === 'INVOICE_CREATED') {
    return {
      chipLabel: 'Zahlung',
      chipTone: 'neutral',
      userTitle: rawTitle || 'Rechnung erstellt',
      userDescription: rawDescription,
      timestamp,
    };
  }

  if (type === 'FINE_CREATED') {
    return {
      chipLabel: 'Bußgeld',
      chipTone: 'warning',
      userTitle: rawTitle || 'Bußgeld erfasst',
      userDescription: rawDescription,
      timestamp,
    };
  }

  if (type === 'UPDATED') {
    const metadata = event.metadata as Record<string, unknown> | undefined;
    if (metadata?.eventKind === 'VERIFICATION_PLAN_SELECTED') {
      return {
        chipLabel: 'Verifikation',
        chipTone: 'neutral',
        userTitle: rawTitle || 'Verifikationsweg festgelegt',
        userDescription: rawDescription || 'Prüfweg für Dokumente wurde festgelegt.',
        timestamp,
      };
    }
    const lowered = rawTitle.toLowerCase();
    if (lowered.includes('dokumentenprüfung') || lowered.includes('prüfung')) {
      return {
        chipLabel: 'Dokument',
        chipTone: 'watch',
        userTitle: rawTitle.includes('erforderlich') ? 'Manuelle Prüfung erforderlich' : 'Dokumentenprüfung aktualisiert',
        userDescription: rawDescription ?? 'Weitere Prüfung notwendig',
        timestamp,
      };
    }
    return {
      chipLabel: 'Kunde',
      chipTone: 'neutral',
      userTitle: 'Kundendaten aktualisiert',
      userDescription: rawDescription,
      timestamp,
    };
  }

  if (type === 'DAMAGE_REPORTED') {
    return {
      chipLabel: 'Schaden',
      chipTone: 'warning',
      userTitle: rawTitle || 'Schaden gemeldet',
      userDescription: rawDescription,
      timestamp,
    };
  }

  if (type === 'TASK_CREATED') {
    return {
      chipLabel: 'Aufgabe',
      chipTone: 'neutral',
      userTitle: rawTitle || 'Aufgabe erstellt',
      userDescription: rawDescription,
      timestamp,
    };
  }

  return {
    chipLabel: 'Aktivität',
    chipTone: 'neutral',
    userTitle: rawTitle || 'Aktualisierung',
    userDescription: rawDescription,
    timestamp,
  };
}

export function mapTimelineEventToUserEntry(event: TimelineEventLike): TimelineUserEntry {
  const summary = mapTimelineEventToUserSummary(event);
  const filterType = timelineEventFilterCategory(event);

  return {
    ...summary,
    filterType,
    userTypeLabel: summary.chipLabel,
    createdByLabel: resolveTimelineCreatedByLabel(event),
    formattedTimestamp: summary.timestamp ?? EM_DASH,
    tone: summary.chipTone,
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
