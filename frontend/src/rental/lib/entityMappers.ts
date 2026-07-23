// V4.6.64 — shared UI↔API mappers for Customer + Booking.
// Keeps CustomersView / CustomerDetailView / CustomerDetailModal / NewBookingView / BookingsView
// in lock-step with the backend enums + response shapes.

import { api } from '../../lib/api';
import {
  verificationPlanToApiPayload,
  type CustomerVerificationPlanState,
} from '../components/add-customer/AddCustomerVerificationPlanSection';

export type CustomerUiStatus = 'Active' | 'Under Review' | 'Suspended' | 'Blocked' | 'Archived' | 'Inactive';
export type CustomerApiStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED' | 'SUSPENDED' | 'UNDER_REVIEW';

// V4.6.95 — Customer risk is operational metadata, not a score.
// `Customer.riskLevel` does NOT have a real automated writer yet, so the
// frontend must default to "Not Assessed" instead of fabricating "Low Risk".
// Render this as a neutral state in lists and detail views; only switch to
// LOW/MEDIUM/HIGH when the backend actually assigns one of those.
export type CustomerUiRisk =
  | 'Not Assessed'
  | 'Low Risk'
  | 'Medium Risk'
  | 'High Risk';
export type CustomerApiRisk = 'NOT_ASSESSED' | 'LOW' | 'MEDIUM' | 'HIGH';

export type CustomerUiType = 'Individual' | 'Corporate';
export type CustomerApiType = 'INDIVIDUAL' | 'CORPORATE';

export type BookingUiStatus = 'active' | 'confirmed' | 'pending' | 'completed' | 'cancelled' | 'no_show';

const MONTHS_SHORT_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

// ------------------------------------------------
// Customer status mapping
// ------------------------------------------------

export function customerStatusUiToApi(ui: CustomerUiStatus | string | undefined): CustomerApiStatus {
  switch (ui) {
    case 'Active': return 'ACTIVE';
    case 'Suspended': return 'SUSPENDED';
    case 'Under Review': return 'UNDER_REVIEW';
    case 'Blocked': return 'BLOCKED';
    case 'Inactive': return 'INACTIVE';
    case 'Archived': return 'INACTIVE';
    default: return 'ACTIVE';
  }
}

export function customerStatusApiToUi(
  api: CustomerApiStatus | string | undefined,
  archivedAt?: string | Date | null,
): CustomerUiStatus {
  if (archivedAt) return 'Archived';
  switch (api) {
    case 'ACTIVE': return 'Active';
    case 'SUSPENDED': return 'Suspended';
    case 'UNDER_REVIEW': return 'Under Review';
    case 'BLOCKED': return 'Blocked';
    case 'INACTIVE': return 'Inactive';
    default: return 'Active';
  }
}

export type CustomerUiVerification =
  | 'Not Submitted'
  | 'Pending Review'
  | 'Verified'
  | 'Rejected'
  | 'Expired';

export type CustomerApiVerification =
  | 'NOT_SUBMITTED'
  | 'PENDING_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'EXPIRED';

export type CustomerDocumentApiType =
  | 'ID_FRONT'
  | 'ID_BACK'
  | 'LICENSE_FRONT'
  | 'LICENSE_BACK'
  | 'PROOF_OF_ADDRESS'
  | 'OTHER';

export type CustomerDocumentApiStatus =
  | 'UPLOADED'
  | 'PENDING_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'EXPIRED';

export type CustomerUiDocumentStatus =
  | 'Not Submitted'
  | 'Uploaded'
  | 'Pending Review'
  | 'Verified'
  | 'Rejected'
  | 'Expired';

export function customerDocumentSlotToApiType(
  slot: 'id-front' | 'id-back' | 'license-front' | 'license-back',
): CustomerDocumentApiType {
  switch (slot) {
    case 'id-front': return 'ID_FRONT';
    case 'id-back': return 'ID_BACK';
    case 'license-front': return 'LICENSE_FRONT';
    case 'license-back': return 'LICENSE_BACK';
  }
}

export function customerDocumentStatusApiToUi(
  api: CustomerDocumentApiStatus | string | undefined | null,
  hasDocument: boolean,
): CustomerUiDocumentStatus {
  if (!hasDocument) return 'Not Submitted';
  switch (api) {
    case 'UPLOADED': return 'Uploaded';
    case 'PENDING_REVIEW': return 'Pending Review';
    case 'VERIFIED': return 'Verified';
    case 'REJECTED': return 'Rejected';
    case 'EXPIRED': return 'Expired';
    default: return 'Pending Review';
  }
}

export const CUSTOMER_KYC_DOCUMENT_TYPES: CustomerDocumentApiType[] = [
  'ID_FRONT',
  'ID_BACK',
  'LICENSE_FRONT',
  'LICENSE_BACK',
];

export type PendingCustomerDocumentFiles = Partial<
  Record<CustomerDocumentApiType, File>
>;

export async function uploadPendingCustomerDocuments(
  orgId: string,
  customerId: string,
  files: PendingCustomerDocumentFiles,
): Promise<void> {
  for (const type of CUSTOMER_KYC_DOCUMENT_TYPES) {
    const file = files[type];
    if (file) {
      await api.customers.customerDocuments.upload(orgId, customerId, type, file);
    }
  }
}

export function customerVerificationApiToUi(
  api: CustomerApiVerification | string | undefined | null,
): CustomerUiVerification {
  switch (api) {
    case 'PENDING_REVIEW': return 'Pending Review';
    case 'VERIFIED': return 'Verified';
    case 'REJECTED': return 'Rejected';
    case 'EXPIRED': return 'Expired';
    default: return 'Not Submitted';
  }
}

/** German display labels for customer verification status. */
export function customerVerificationUiLabelDe(
  ui: CustomerUiVerification | string | undefined,
): string {
  switch (ui) {
    case 'Pending Review': return 'In Prüfung';
    case 'Verified': return 'Verifiziert';
    case 'Rejected': return 'Abgelehnt';
    case 'Expired': return 'Abgelaufen';
    default: return 'Nicht eingereicht';
  }
}

export function customerStatusUiLabelDe(ui: CustomerUiStatus | string | undefined): string {
  switch (ui) {
    case 'Active': return 'Aktiv';
    case 'Under Review': return 'In Prüfung';
    case 'Suspended': return 'Suspendiert';
    case 'Blocked': return 'Gesperrt';
    case 'Inactive': return 'Inaktiv';
    case 'Archived': return 'Archiviert';
    default: return String(ui ?? '—');
  }
}

export function customerRiskUiLabelDe(ui: CustomerUiRisk | string | undefined): string {
  switch (ui) {
    case 'Not Assessed': return 'Keine Risikobewertung';
    case 'Low Risk': return 'Niedrig';
    case 'Medium Risk': return 'Mittel';
    case 'High Risk': return 'Hoch';
    default: return 'Keine Risikobewertung';
  }
}

export function customerDocumentStatusUiLabelDe(
  ui: CustomerUiDocumentStatus | string | undefined,
): string {
  switch (ui) {
    case 'Uploaded': return 'Hochgeladen';
    case 'Pending Review': return 'In Prüfung';
    case 'Verified': return 'Verifiziert';
    case 'Rejected': return 'Abgelehnt';
    case 'Expired': return 'Abgelaufen';
    default: return 'Nicht eingereicht';
  }
}

export function invoiceStatusApiToUiLabel(status: string | null | undefined): string {
  switch ((status ?? '').toUpperCase()) {
    case 'PAID': return 'Bezahlt';
    case 'OVERDUE': return 'Überfällig';
    case 'SENT': return 'Versendet';
    case 'OPEN': return 'Offen';
    case 'DRAFT': return 'Entwurf';
    case 'CANCELLED': return 'Storniert';
    case 'PENDING': return 'Ausstehend';
    default: return status || '—';
  }
}

export function fineStatusApiToUiLabel(status: string | null | undefined): string {
  switch ((status ?? '').toUpperCase()) {
    case 'RESOLVED': return 'Erledigt';
    case 'CLOSED': return 'Geschlossen';
    case 'MATCHED': return 'Zugeordnet';
    case 'OPEN': return 'Offen';
    case 'PENDING': return 'Ausstehend';
    case 'DISPUTED': return 'Angefochten';
    default: return status || '—';
  }
}

export function invoiceStatusTone(
  status: string | null | undefined,
): 'success' | 'warning' | 'critical' | 'info' | 'neutral' {
  switch ((status ?? '').toUpperCase()) {
    case 'PAID': return 'success';
    case 'OVERDUE': return 'critical';
    case 'DRAFT': return 'neutral';
    case 'SENT':
    case 'OPEN':
    case 'PENDING': return 'warning';
    default: return 'neutral';
  }
}

export function fineStatusTone(
  status: string | null | undefined,
): 'success' | 'warning' | 'critical' | 'info' | 'neutral' {
  switch ((status ?? '').toUpperCase()) {
    case 'RESOLVED':
    case 'CLOSED': return 'success';
    case 'MATCHED': return 'info';
    case 'OPEN':
    case 'PENDING': return 'warning';
    case 'DISPUTED': return 'critical';
    default: return 'neutral';
  }
}

export function customerRiskUiToApi(ui: CustomerUiRisk | string | undefined): CustomerApiRisk | undefined {
  switch (ui) {
    case 'Low Risk': return 'LOW';
    case 'Medium Risk': return 'MEDIUM';
    case 'High Risk': return 'HIGH';
    case 'Not Assessed': return 'NOT_ASSESSED';
    default: return undefined;
  }
}

export function customerRiskApiToUi(
  api: CustomerApiRisk | string | undefined | null,
): CustomerUiRisk {
  switch (api) {
    case 'NOT_ASSESSED': return 'Not Assessed';
    case 'LOW': return 'Low Risk';
    case 'MEDIUM': return 'Medium Risk';
    case 'HIGH': return 'High Risk';
    default: return 'Not Assessed';
  }
}

export function customerTypeUiToApi(ui: CustomerUiType | string | undefined): CustomerApiType {
  return ui === 'Corporate' ? 'CORPORATE' : 'INDIVIDUAL';
}

export function customerTypeApiToUi(api: CustomerApiType | string | undefined): CustomerUiType {
  return api === 'CORPORATE' ? 'Corporate' : 'Individual';
}

// ------------------------------------------------
// Booking status mapping
//
// The backend service returns display-cased strings via BOOKING_STATUS_DISPLAY
// (`Pending`, `Confirmed`, `Active`, `Completed`, `Cancelled`). The UI works
// with lowercase enums. Normalize both directions.
// ------------------------------------------------

export function bookingStatusApiToUi(
  api: string | undefined | null,
  statusEnum?: string | null,
): BookingUiStatus {
  const enumRaw = (statusEnum ?? '').toString().toUpperCase();
  if (enumRaw === 'NO_SHOW') return 'no_show';
  if (enumRaw === 'CANCELLED') return 'cancelled';
  if (enumRaw === 'ACTIVE') return 'active';
  if (enumRaw === 'CONFIRMED') return 'confirmed';
  if (enumRaw === 'COMPLETED') return 'completed';
  if (enumRaw === 'PENDING') return 'pending';

  const v = String(api ?? '').toLowerCase();
  if (v === 'no show' || v === 'no_show') return 'no_show';
  if (v === 'active') return 'active';
  if (v === 'confirmed') return 'confirmed';
  if (v === 'pending') return 'pending';
  if (v === 'completed') return 'completed';
  if (v === 'cancelled') return 'cancelled';
  return 'pending';
}

export function bookingStatusUiToApi(
  ui: BookingUiStatus,
): 'ACTIVE' | 'CONFIRMED' | 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' {
  switch (ui) {
    case 'active': return 'ACTIVE';
    case 'confirmed': return 'CONFIRMED';
    case 'pending': return 'PENDING';
    case 'completed': return 'COMPLETED';
    case 'cancelled': return 'CANCELLED';
    case 'no_show': return 'NO_SHOW';
  }
}

// ------------------------------------------------
// Booking API → UI row used by BookingsView / calendar
// ------------------------------------------------

export function formatBookingDate(iso: string | Date): { display: string; day: number; month: number; year: number } {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const day = d.getDate();
  const month = d.getMonth();
  const year = d.getFullYear();
  return {
    display: `${day} ${MONTHS_SHORT_EN[month]} ${year}`,
    day,
    month,
    year,
  };
}

function formatTimeFromIso(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// V4.6.75 — Handover protocol DTO (matches backend HandoverProtocolDto).
export interface HandoverProtocolRow {
  id: string;
  bookingId: string;
  vehicleId: string;
  kind: 'PICKUP' | 'RETURN';
  performedAt: string;
  performedByUserId: string | null;
  performedByName: string | null;
  odometerKm: number;
  fuelPercent: number;
  fuelFull: boolean;
  exteriorClean: boolean;
  interiorClean: boolean;
  tiresSeasonOk: boolean;
  warningLightsOn: boolean;
  warningLightsNotes: string | null;
  notes: string | null;
  customerSignatureName: string | null;
  customerSignatureDataUrl: string | null;
  staffSignatureName: string | null;
  staffSignatureDataUrl: string | null;
  documentsAcknowledged: boolean;
  damageIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BookingUiRow {
  id: string;
  vehicleId: string | null;
  customerId: string | null;
  customer: string;
  customerPhone: string;
  vehicle: string;
  plate: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  startMonth: number;
  startYear: number;
  startDay: number;
  endDay: number;
  endMonth: number;
  endYear: number;
  pickupLocation: string;
  returnLocation: string;
  pickupStationId?: string | null;
  returnStationId?: string | null;
  revenue: string;
  status: BookingUiStatus;
  bookingRef: string;
  insurance: string;
  paymentMethod: string;
  fuelLevel: string;
  mileageStart: number | null;
  mileageEnd: number | null;
  notes: string;
  includedKm: number;
  drivenKm: number | null;
  drivingScore: number | null;
  drivingBehavior: null;
  abuseDetection: null;
  bookingSource: string;
  bookedBy: string;
  pickupHandoverBy: string | null;
  returnHandoverBy: string | null;
  pickupProtocol: HandoverProtocolRow | null;
  returnProtocol: HandoverProtocolRow | null;
  extras: Array<{ id?: string; name?: string; price?: number }>;
  totalPriceCents: number | null;
  _raw: unknown;
}

// V4.6.75 — Normalise a raw protocol payload (server DTO or partial) into
// the typed UI shape used across BookingsView / Dashboard tiles.
function mapApiHandoverProtocol(raw: any): HandoverProtocolRow | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: String(raw.id ?? ''),
    bookingId: String(raw.bookingId ?? ''),
    vehicleId: String(raw.vehicleId ?? ''),
    kind: raw.kind === 'RETURN' ? 'RETURN' : 'PICKUP',
    performedAt: String(raw.performedAt ?? ''),
    performedByUserId: raw.performedByUserId ?? null,
    performedByName: raw.performedByName ?? null,
    odometerKm: typeof raw.odometerKm === 'number' ? raw.odometerKm : 0,
    fuelPercent: typeof raw.fuelPercent === 'number' ? raw.fuelPercent : 0,
    fuelFull: !!raw.fuelFull,
    exteriorClean: !!raw.exteriorClean,
    interiorClean: !!raw.interiorClean,
    tiresSeasonOk: !!raw.tiresSeasonOk,
    warningLightsOn: !!raw.warningLightsOn,
    warningLightsNotes: raw.warningLightsNotes ?? null,
    notes: raw.notes ?? null,
    customerSignatureName: raw.customerSignatureName ?? null,
    customerSignatureDataUrl: raw.customerSignatureDataUrl ?? null,
    staffSignatureName: raw.staffSignatureName ?? null,
    staffSignatureDataUrl: raw.staffSignatureDataUrl ?? null,
    documentsAcknowledged: !!raw.documentsAcknowledged,
    damageIds: Array.isArray(raw.damageIds)
      ? raw.damageIds.filter((x: any): x is string => typeof x === 'string')
      : [],
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
  };
}

function formatFuelPercent(percent: number, full: boolean): string {
  if (full) return 'Voll';
  if (percent >= 88) return 'Voll';
  if (percent >= 63) return '3/4';
  if (percent >= 38) return '1/2';
  if (percent >= 13) return '1/4';
  return 'Leer';
}

export function mapApiBooking(api: any): BookingUiRow {
  const start = formatBookingDate(api.startDate);
  const end = formatBookingDate(api.endDate);
  const currency = (api.currency || 'eur').toLowerCase();
  const symbol = currency === 'eur' ? '€' : currency === 'usd' ? '$' : '';
  const revenueNum =
    typeof api.totalPriceCents === 'number'
      ? api.totalPriceCents / 100
      : typeof api.totalPrice === 'number'
        ? api.totalPrice
        : 0;
  const totalPriceCents =
    typeof api.totalPriceCents === 'number'
      ? api.totalPriceCents
      : typeof api.totalPrice === 'number'
        ? Math.round(api.totalPrice * 100)
        : null;
  const extrasList = Array.isArray(api.extras)
    ? api.extras
    : Array.isArray(api.extrasJson)
      ? api.extrasJson
      : [];
  // V4.6.75 — The booking list/detail endpoints now return pickupProtocol /
  // returnProtocol objects (or null). Mileage/fuel/handover-by are derived
  // from those real records instead of being forced to null. Superseded
  // V4.6.72 placeholder behaviour.
  const pickupProtocol = mapApiHandoverProtocol(api.pickupProtocol);
  const returnProtocol = mapApiHandoverProtocol(api.returnProtocol);
  const fuelLevel = pickupProtocol
    ? formatFuelPercent(pickupProtocol.fuelPercent, pickupProtocol.fuelFull)
    : api.fuelLevel ?? 'Voll';
  return {
    id: api.id,
    vehicleId: api.vehicleId ?? api.vehicle?.id ?? null,
    customerId: api.customerId ?? api.customer?.id ?? null,
    customer: api.customerName ?? api.customer ?? '',
    customerPhone: api.customerPhone ?? '',
    vehicle: api.vehicleName ?? api.vehicle ?? '',
    plate: api.vehicleLicense ?? api.plate ?? '',
    startDate: start.display,
    endDate: end.display,
    startTime: formatTimeFromIso(api.startDate),
    endTime: formatTimeFromIso(api.endDate),
    startMonth: start.month,
    startYear: start.year,
    startDay: start.day,
    endDay: end.day,
    endMonth: end.month,
    endYear: end.year,
    pickupLocation: api.pickupStationName ?? api.station ?? api.pickupLocation ?? '',
    returnLocation: api.returnStationName ?? api.station ?? api.returnLocation ?? '',
    pickupStationId: api.pickupStationId ?? null,
    returnStationId: api.returnStationId ?? null,
    revenue: `${symbol}${revenueNum.toFixed(0)}`,
    status: bookingStatusApiToUi(api.status, api.statusEnum),
    bookingRef: `BK-${String(api.id).slice(-6).toUpperCase()}`,
    insurance: Array.isArray(api.insuranceOptions) && api.insuranceOptions.length > 0
      ? api.insuranceOptions.map((i: any) => (typeof i === 'string' ? i : i?.name ?? i?.id ?? '')).filter(Boolean).join(', ')
      : 'Haftpflicht',
    paymentMethod: api.paymentMethod ?? 'Kreditkarte',
    fuelLevel,
    mileageStart: pickupProtocol?.odometerKm ?? null,
    mileageEnd: returnProtocol?.odometerKm ?? null,
    notes: api.notes ?? '',
    includedKm: typeof api.kmIncluded === 'number' ? api.kmIncluded : 0,
    drivenKm: typeof api.kmDriven === 'number' ? api.kmDriven : null,
    drivingScore: null,
    drivingBehavior: null,
    abuseDetection: null,
    bookingSource: 'App',
    bookedBy: '',
    pickupHandoverBy: pickupProtocol?.performedByName ?? null,
    returnHandoverBy: returnProtocol?.performedByName ?? null,
    pickupProtocol,
    returnProtocol,
    extras: extrasList,
    totalPriceCents,
    _raw: api,
  };
}

// ------------------------------------------------
// Booking create payload (UI form → API body)
// ------------------------------------------------

export interface BuildBookingCreatePayloadArgs {
  customerId: string;
  vehicleId: string;
  pickupDate: string;
  pickupTime: string;
  returnDate: string;
  returnTime: string;
  pickupStationId?: string | null;
  returnStationId?: string | null;
  /** Legacy hints — backend Pricing Service is source of truth. */
  dailyRateEuro?: number;
  totalPriceEuro?: number;
  includedKm?: number;
  insuranceLabels?: string[];
  extras?: Array<{ id: string; name?: string; price?: number }>;
  pricingInput?: {
    selectedMileagePackageId?: string;
    selectedInsuranceOptionIds?: string[];
    selectedExtraOptionIds?: string[];
    manualDiscountCents?: number;
    manualAdjustmentCents?: number;
  };
  quoteId?: string;
  notes?: string;
  currency?: string;
  status?: 'PENDING' | 'CONFIRMED' | 'ACTIVE';
}

export function buildBookingCreatePayload(args: BuildBookingCreatePayloadArgs) {
  const startIso = new Date(`${args.pickupDate}T${args.pickupTime || '10:00'}:00`).toISOString();
  const endIso = new Date(`${args.returnDate}T${args.returnTime || '10:00'}:00`).toISOString();
  if (!args.quoteId) {
    throw new Error('quoteId is required to create a booking');
  }
  return {
    customerId: args.customerId,
    vehicleId: args.vehicleId,
    pickupStationId: args.pickupStationId ?? undefined,
    returnStationId: args.returnStationId ?? undefined,
    startDate: startIso,
    endDate: endIso,
    quoteId: args.quoteId,
    ...(args.includedKm != null ? { kmIncluded: Math.max(0, Math.round(args.includedKm)) } : {}),
    ...(args.insuranceLabels ? { insuranceOptions: args.insuranceLabels } : {}),
    ...(args.extras ? { extrasJson: args.extras } : {}),
    ...(args.pricingInput ? { pricingInput: args.pricingInput } : {}),
    ...(args.currency ? { currency: args.currency.toLowerCase() } : {}),
    status: args.status || 'PENDING',
    notes: args.notes || '',
  };
}

// ------------------------------------------------
// Customer create payload (UI form → API body)
// ------------------------------------------------

export interface BuildCustomerCreatePayloadArgs {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street?: string;
  zip?: string;
  city?: string;
  country?: string;
  type: CustomerUiType | string;
  company?: string;
  licenseNumber?: string;
  licenseIssuedAt?: string;
  licenseExpiry?: string;
  licenseClass?: string;
  idType?: string;
  idNumber?: string;
  idExpiry?: string;
  idVerified?: boolean;
  licenseVerified?: boolean;
  riskLevel?: CustomerUiRisk | string;
  status?: CustomerUiStatus | string;
  notes?: string;
  allowDuplicateOverride?: boolean;
  verificationPlan?: CustomerVerificationPlanState;
}

export function buildCustomerCreatePayload(args: BuildCustomerCreatePayloadArgs) {
  const toIso = (d?: string) => (d && d.length > 0 ? new Date(d).toISOString() : null);
  return {
    firstName: args.firstName.trim(),
    lastName: args.lastName.trim(),
    email: args.email?.trim() || undefined,
    phone: args.phone?.trim() || undefined,
    address: args.street?.trim() || undefined,
    postalCode: args.zip?.trim() || undefined,
    city: args.city?.trim() || undefined,
    country: args.country?.trim() || undefined,
    companyName: args.company?.trim() || undefined,
    customerType: customerTypeUiToApi(args.type),
    licenseNumber: args.licenseNumber?.trim() || undefined,
    licenseIssuedAt: toIso(args.licenseIssuedAt) ?? undefined,
    licenseExpiry: toIso(args.licenseExpiry) ?? undefined,
    idNumber: args.idNumber?.trim() || undefined,
    idExpiry: toIso(args.idExpiry) ?? undefined,
    notes: args.notes?.trim() || undefined,
    allowDuplicateOverride: args.allowDuplicateOverride,
    ...(args.verificationPlan
      ? { verificationPlan: verificationPlanToApiPayload(args.verificationPlan) }
      : {}),
  };
}
