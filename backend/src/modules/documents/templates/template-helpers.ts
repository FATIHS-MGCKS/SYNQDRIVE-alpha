import { RenderableOrg, RenderableParty } from '../renderers/render-model';

/**
 * Plain, serialisable shapes the bundle service assembles from Prisma rows and
 * hands to templates. Templates never touch Prisma directly — they only read
 * these structures, so the rendered PDF is a faithful snapshot of the data used.
 */

export interface OrgInfo {
  name: string;
  address?: string | null;
  city?: string | null;
  zip?: string | null;
  state?: string | null;
  country?: string | null;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  logoUrl?: string | null;
}

export interface CustomerInfo {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  zip?: string | null;
  country?: string | null;
  licenseNumber?: string | null;
}

export interface VehicleInfo {
  make?: string | null;
  model?: string | null;
  year?: number | null;
  licensePlate?: string | null;
  vin?: string | null;
  color?: string | null;
}

export interface BookingInfo {
  id: string;
  startDate: Date | string;
  endDate: Date | string;
  dailyRateCents?: number | null;
  totalPriceCents?: number | null;
  kmIncluded?: number | null;
  kmDriven?: number | null;
  currency?: string | null;
  pickupLocation?: string | null;
  returnLocation?: string | null;
  pickupStationName?: string | null;
  returnStationName?: string | null;
  pickupStationPhone?: string | null;
  returnStationPhone?: string | null;
  pickupStationEmail?: string | null;
  returnStationEmail?: string | null;
  pickupHandoverInstructions?: string | null;
  returnInstructions?: string | null;
}

export function normalizeCurrency(currency?: string | null): string {
  return (currency || 'EUR').toUpperCase();
}

export function formatMoneyCents(cents: number | null | undefined, currency?: string | null): string {
  const value = (Number.isFinite(cents) ? (cents as number) : 0) / 100;
  try {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: normalizeCurrency(currency),
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${normalizeCurrency(currency)}`;
  }
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function rentalDays(start: Date | string, end: Date | string): number {
  const s = typeof start === 'string' ? new Date(start) : start;
  const e = typeof end === 'string' ? new Date(end) : end;
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 1;
  const ms = e.getTime() - s.getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function orgToRenderable(org: OrgInfo): RenderableOrg {
  const addressLines = [
    org.address,
    [org.zip, org.city].filter(Boolean).join(' '),
    org.country,
  ].filter((l): l is string => !!l && l.trim().length > 0);
  const contactLines = [
    org.phone ? `Tel.: ${org.phone}` : null,
    org.email,
    org.website,
  ].filter((l): l is string => !!l && l.trim().length > 0);
  return {
    name: org.name || 'SynqDrive',
    addressLines,
    contactLines,
    taxId: org.taxId ?? null,
    logoUrl: org.logoUrl ?? null,
  };
}

export function customerDisplayName(c: CustomerInfo): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return name || c.company || 'Kunde';
}

export function customerParty(c: CustomerInfo, heading = 'Kunde'): RenderableParty {
  const lines = [
    customerDisplayName(c),
    c.company && [c.firstName, c.lastName].filter(Boolean).length ? c.company : null,
    c.address,
    [c.zip, c.city].filter(Boolean).join(' '),
    c.country,
    c.email,
    c.phone ? `Tel.: ${c.phone}` : null,
  ].filter((l): l is string => !!l && l.trim().length > 0);
  return { heading, lines };
}

export function sellerParty(org: OrgInfo, heading = 'Vermieter'): RenderableParty {
  const lines = [
    org.name,
    org.address,
    [org.zip, org.city].filter(Boolean).join(' '),
    org.country,
    org.taxId ? `USt-IdNr.: ${org.taxId}` : null,
  ].filter((l): l is string => !!l && l.trim().length > 0);
  return { heading, lines };
}

export function vehicleLabel(v: VehicleInfo): string {
  const base = [v.make, v.model].filter(Boolean).join(' ');
  const year = v.year ? ` (${v.year})` : '';
  return `${base}${year}`.trim() || 'Fahrzeug';
}

/** Human booking reference for UI, documents, and operator-facing text (not internal UUID). */
export function bookingRef(bookingId: string): string {
  return `BK-${bookingId.slice(-6).toUpperCase()}`;
}

/** Default footer lines: org name + contact, plus a managed-legal note. */
export function defaultFooter(org: OrgInfo): string[] {
  const contact = [org.email, org.phone, org.website].filter(Boolean).join(' · ');
  return [org.name + (contact ? ` · ${contact}` : '')].filter(Boolean);
}
