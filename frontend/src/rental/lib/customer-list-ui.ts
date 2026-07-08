import type { CustomerApiRecord } from '../../lib/api';
import type { StatusTone } from '../../components/patterns';
import type {
  CustomerApiVerification,
  CustomerUiVerification,
} from './entityMappers';
import {
  customerRiskApiToUi,
  customerStatusApiToUi,
  customerTypeApiToUi,
  customerVerificationApiToUi,
  customerVerificationUiLabelDe,
} from './entityMappers';
import { resolveDrivingStressScore } from './scoreFormat';

const EM_DASH = '\u2014';

function formatDateShort(raw?: string | Date | null): string {
  if (!raw) return EM_DASH;
  const d = typeof raw === 'string' ? new Date(raw) : raw;
  if (!d || Number.isNaN(d.getTime())) return EM_DASH;
  return d.toLocaleDateString('de-DE');
}

function formatCentsEUR(cents?: number | null): string {
  if (cents == null) return EM_DASH;
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
      cents / 100,
    );
  } catch {
    return `${(cents / 100).toFixed(2)} EUR`;
  }
}

export type RentalClearanceStatus =
  | 'CLEARED'
  | 'PENDING'
  | 'REVIEW_REQUIRED'
  | 'BLOCKED';

export interface RentalClearanceUi {
  status: RentalClearanceStatus;
  label: string;
  reasons: string[];
}

export interface CustomerListRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  type: 'Individual' | 'Corporate';
  status: 'Active' | 'Under Review' | 'Suspended' | 'Blocked' | 'Archived' | 'Inactive';
  riskLevel: 'Not Assessed' | 'Low Risk' | 'Medium Risk' | 'High Risk';
  drivingStressScore?: number | null;
  stressLevel?: 'low' | 'moderate' | 'high' | 'critical' | null;
  hasEnoughData?: boolean;
  totalBookings: number;
  totalRevenue: string;
  lastTrip: string;
  idVerified: boolean;
  licenseVerified: boolean;
  address?: string;
  postalCode?: string;
  zip?: string;
  city?: string;
  country?: string;
  displayAddress?: string;
  idVerificationStatus?: CustomerUiVerification;
  licenseVerificationStatus?: CustomerUiVerification;
  rentalClearance?: RentalClearanceUi | null;
}

export function formatCustomerDisplayAddress(input: {
  address?: string | null;
  postalCode?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
}): string | undefined {
  const street = input.address?.trim();
  const postal = (input.postalCode ?? input.zip)?.trim();
  const city = input.city?.trim();
  const country = input.country?.trim();

  const locality = [postal, city].filter(Boolean).join(' ').trim();
  const parts = [street, locality, country].filter((p) => p && p.length > 0);
  if (parts.length === 0) return undefined;
  return parts.join(', ');
}

export function resolveCustomerVerificationUi(
  status: CustomerApiVerification | string | undefined | null,
  verified?: boolean | null,
): CustomerUiVerification {
  if (status) return customerVerificationApiToUi(status);
  if (verified === true) return 'Verified';
  return 'Not Submitted';
}

/** Card badge label — "Prüfung offen" instead of "In Prüfung". */
export function customerVerificationCardBadgeLabelDe(
  prefix: 'ID' | 'DL',
  ui: CustomerUiVerification | string | undefined,
): string {
  const base = customerVerificationUiLabelDe(ui);
  const label =
    base === 'In Prüfung'
      ? 'Prüfung offen'
      : base;
  return `${prefix}: ${label}`;
}

export function customerVerificationBadgeTone(
  ui: CustomerUiVerification | string | undefined,
): StatusTone {
  switch (ui) {
    case 'Verified':
      return 'success';
    case 'Pending Review':
      return 'warning';
    case 'Rejected':
    case 'Expired':
      return 'critical';
    default:
      return 'neutral';
  }
}

export function rentalClearanceBadgeTone(
  status: RentalClearanceStatus | undefined,
): StatusTone {
  switch (status) {
    case 'CLEARED':
      return 'success';
    case 'PENDING':
      return 'warning';
    case 'REVIEW_REQUIRED':
      return 'info';
    case 'BLOCKED':
      return 'critical';
    default:
      return 'neutral';
  }
}

export function rentalClearanceTooltip(reasons: string[] | undefined): string | undefined {
  if (!reasons?.length) return undefined;
  return reasons.slice(0, 4).join(' · ');
}

export interface CustomerAddressLines {
  street?: string;
  locality?: string;
  hasAny: boolean;
}

/** Two-line address for mobile cards — street + indented locality (PLZ Stadt, Land). */
export function formatCustomerAddressLines(input: {
  address?: string | null;
  postalCode?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
}): CustomerAddressLines {
  const street = input.address?.trim() || undefined;
  const postal = (input.postalCode ?? input.zip)?.trim();
  const city = input.city?.trim();
  const country = input.country?.trim();
  const cityLine = [postal, city].filter(Boolean).join(' ').trim();
  const locality = [cityLine, country].filter(Boolean).join(', ') || undefined;
  return {
    street,
    locality,
    hasAny: Boolean(street || locality),
  };
}

export type VerificationIconKind =
  | 'verified'
  | 'rejected'
  | 'not-submitted'
  | 'pending'
  | 'expired';

export interface VerificationBadgeMeta {
  kind: VerificationIconKind;
  ariaLabel: string;
  title: string;
  pillClass: string;
  iconClass: string;
}

/** Compact ID/DL badge metadata — visible label is prefix + icon only. */
export function getVerificationBadgeMeta(
  prefix: 'ID' | 'DL',
  ui: CustomerUiVerification | string | undefined,
): VerificationBadgeMeta {
  const title = customerVerificationCardBadgeLabelDe(prefix, ui);
  const ariaLabel = title;

  switch (ui) {
    case 'Verified':
      return {
        kind: 'verified',
        ariaLabel,
        title,
        pillClass:
          'border-[color:color-mix(in_srgb,var(--status-positive)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--status-positive)_10%,transparent)]',
        iconClass: 'text-[color:var(--status-positive)]',
      };
    case 'Rejected':
      return {
        kind: 'rejected',
        ariaLabel,
        title,
        pillClass:
          'border-[color:color-mix(in_srgb,var(--status-critical)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--status-critical)_10%,transparent)]',
        iconClass: 'text-[color:var(--status-critical)]',
      };
    case 'Expired':
      return {
        kind: 'expired',
        ariaLabel,
        title,
        pillClass:
          'border-[color:color-mix(in_srgb,var(--status-critical)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--status-critical)_10%,transparent)]',
        iconClass: 'text-[color:var(--status-critical)]',
      };
    case 'Pending Review':
      return {
        kind: 'pending',
        ariaLabel,
        title,
        pillClass:
          'border-[color:color-mix(in_srgb,var(--status-warning)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--status-warning)_10%,transparent)]',
        iconClass: 'text-[color:var(--status-warning)]',
      };
    default:
      return {
        kind: 'not-submitted',
        ariaLabel,
        title,
        pillClass: 'border-border/50 bg-muted/40',
        iconClass: 'text-muted-foreground',
      };
  }
}

/** Mobile list label — prefers backend-provided clearance label. */
export function rentalClearanceMobileLabel(
  clearance: RentalClearanceUi | null | undefined,
): string | null {
  if (!clearance) return null;
  if (clearance.label?.trim()) return clearance.label;
  switch (clearance.status) {
    case 'CLEARED':
      return 'Mietfreigabe';
    case 'REVIEW_REQUIRED':
      return 'Prüfung nötig';
    case 'PENDING':
      return 'Eingeschränkt';
    case 'BLOCKED':
      return 'Keine Mietfreigabe';
    default:
      return clearance.label || null;
  }
}

export function rentalClearanceMobilePillClass(
  status: RentalClearanceStatus | undefined,
): string {
  switch (status) {
    case 'CLEARED':
      return 'border-[color:color-mix(in_srgb,var(--status-positive)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--status-positive)_10%,transparent)] text-[color:var(--status-positive)]';
    case 'REVIEW_REQUIRED':
      return 'border-[color:color-mix(in_srgb,var(--status-info)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--status-info)_10%,transparent)] text-[color:var(--status-info)]';
    case 'PENDING':
      return 'border-[color:color-mix(in_srgb,var(--status-warning)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--status-warning)_10%,transparent)] text-[color:var(--status-warning)]';
    case 'BLOCKED':
      return 'border-[color:color-mix(in_srgb,var(--status-critical)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--status-critical)_10%,transparent)] text-[color:var(--status-critical)]';
    default:
      return 'border-border/50 bg-muted/40 text-muted-foreground';
  }
}

export function customerRiskMobilePillClass(
  risk: CustomerListRow['riskLevel'],
): string {
  switch (risk) {
    case 'Low Risk':
      return 'border-[color:color-mix(in_srgb,var(--status-positive)_25%,transparent)] bg-[color:color-mix(in_srgb,var(--status-positive)_8%,transparent)] text-[color:var(--status-positive)]';
    case 'Medium Risk':
      return 'border-[color:color-mix(in_srgb,var(--status-warning)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--status-warning)_10%,transparent)] text-[color:var(--status-warning)]';
    case 'High Risk':
      return 'border-[color:color-mix(in_srgb,var(--status-critical)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--status-critical)_10%,transparent)] text-[color:var(--status-critical)]';
    default:
      return 'border-border/55 bg-muted/45 text-muted-foreground';
  }
}

function mapRentalClearance(
  raw: CustomerApiRecord['rentalClearance'],
): RentalClearanceUi | null | undefined {
  if (!raw || typeof raw !== 'object') return raw ?? null;
  const status = raw.status;
  if (
    status !== 'CLEARED' &&
    status !== 'PENDING' &&
    status !== 'REVIEW_REQUIRED' &&
    status !== 'BLOCKED'
  ) {
    return null;
  }
  return {
    status,
    label: typeof raw.label === 'string' ? raw.label : '',
    reasons: Array.isArray(raw.reasons)
      ? raw.reasons.filter((r): r is string => typeof r === 'string')
      : [],
  };
}

/** Map API customer list row to UI list model (shared by CustomersView + mobile cards). */
export function mapApiCustomerToListRow(c: CustomerApiRecord): CustomerListRow {
  const stressScore = resolveDrivingStressScore(c);
  const totalBookings =
    typeof c.totalBookings === 'number'
      ? c.totalBookings
      : typeof c.bookingCount === 'number'
        ? c.bookingCount
        : Array.isArray(c.bookings)
          ? c.bookings.length
          : 0;

  const postalCode =
    typeof c.postalCode === 'string'
      ? c.postalCode
      : typeof c.zip === 'string'
        ? c.zip
        : undefined;

  const addressFields = {
    address: typeof c.address === 'string' ? c.address : undefined,
    postalCode,
    zip: typeof c.zip === 'string' ? c.zip : postalCode,
    city: typeof c.city === 'string' ? c.city : undefined,
    country: typeof c.country === 'string' ? c.country : undefined,
  };

  return {
    id: c.id,
    name: c.name ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
    email: c.email ?? '',
    phone: c.phone ?? '',
    company:
      typeof c.company === 'string'
        ? c.company
        : typeof c.companyName === 'string'
          ? c.companyName
          : undefined,
    type: customerTypeApiToUi(
      typeof c.customerType === 'string' ? c.customerType : typeof c.type === 'string' ? c.type : undefined,
    ),
    status: customerStatusApiToUi(c.status ?? undefined, c.archivedAt),
    riskLevel: customerRiskApiToUi(c.riskLevel ?? undefined),
    drivingStressScore: stressScore,
    stressLevel: c.stressLevel ?? null,
    hasEnoughData: typeof c.hasEnoughData === 'boolean' ? c.hasEnoughData : undefined,
    totalBookings,
    totalRevenue: formatCentsEUR(
      typeof c.totalRevenueCents === 'number' ? c.totalRevenueCents : null,
    ),
    lastTrip: formatDateShort(c.lastBookingDate ?? (typeof c.lastTrip === 'string' ? c.lastTrip : null)),
    idVerified: c.idVerified === true,
    licenseVerified: c.licenseVerified === true,
    ...addressFields,
    displayAddress: formatCustomerDisplayAddress(addressFields),
    idVerificationStatus: resolveCustomerVerificationUi(
      typeof c.idVerificationStatus === 'string' ? c.idVerificationStatus : undefined,
      c.idVerified,
    ),
    licenseVerificationStatus: resolveCustomerVerificationUi(
      typeof c.licenseVerificationStatus === 'string' ? c.licenseVerificationStatus : undefined,
      c.licenseVerified,
    ),
    rentalClearance: mapRentalClearance(c.rentalClearance),
  };
}
