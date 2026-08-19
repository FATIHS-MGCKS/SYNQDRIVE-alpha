// @vitest-environment happy-dom
import { vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { translateKey } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import {
  bookingStatusLabel,
  normalizeBookingStatus,
  type BookingUiStatus,
} from './bookings/bookingStatus';
import { bt, bookingsFormattingLocaleOrDefault } from './bookings-customers/bookings-i18n';
import { ct, customersFormattingLocaleOrDefault } from './bookings-customers/customers-i18n';
import { customerStatusUiLabel } from '../lib/entityMappers';
import { formatDate } from './customer-detail/customerDetailUtils';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P23_BOOKINGS_PREFIXES = [
  'rental/components/bookings/',
  'rental/components/booking-detail/',
  'rental/components/new-booking/',
  'rental/components/booking-payment/',
  'rental/components/BookingsView.tsx',
  'rental/components/NewBookingView.tsx',
  'rental/components/BookingDocumentsSection.tsx',
  'rental/components/customer-detail/CustomerBookingsTab.tsx',
  'rental/lib/booking-',
  'rental/lib/bookingHandoverGates.ts',
  'rental/lib/stationBookingUtils.ts',
];

const P23_CUSTOMERS_PREFIXES = [
  'rental/components/CustomersView.tsx',
  'rental/components/CustomerDetailView.tsx',
  'rental/components/CustomerDetailModal.tsx',
  'rental/components/CustomerDocumentUploadBox.tsx',
  'rental/components/customer-list/',
  'rental/components/customer-detail/',
  'rental/components/customer-verification/',
  'rental/components/add-customer/',
  'rental/components/customer/',
  'rental/components/bookings-customers/customers-i18n.ts',
  'rental/lib/customer-',
  'rental/lib/add-customer-wizard.ts',
];

function isP23BookingsPath(relPath: string): boolean {
  return P23_BOOKINGS_PREFIXES.some(
    (prefix) => relPath === prefix || relPath.startsWith(prefix),
  );
}

function isP23CustomersPath(relPath: string): boolean {
  return P23_CUSTOMERS_PREFIXES.some(
    (prefix) => relPath === prefix || relPath.startsWith(prefix),
  );
}

function p23ScopedFindings(predicate: (file: string) => boolean) {
  return inventory.findings.filter((finding) => predicate(finding.file));
}

describe('rental bookings & customers localization (P2.2.3)', () => {
  describe('bookings', () => {
    it('resolves list/planner labels through canonical i18n', () => {
      expect(bt('en', 'bookings.planner.pending')).toBe(en['bookings.planner.pending']);
      expect(bt('de', 'bookings.confirmed')).toBe(de['bookings.confirmed']);
    });

    it('resolves booking detail labels through canonical i18n', () => {
      expect(bt('en', 'bookings.detail.loadingDossier')).toBe(en['bookings.detail.loadingDossier']);
      expect(bt('de', 'bookings.detail.rentalEligibility')).toBe(de['bookings.detail.rentalEligibility']);
    });

    it('resolves booking create/edit wizard labels through canonical i18n', () => {
      expect(bt('en', 'bookings.wizard.selectCustomer')).toBe(en['bookings.wizard.selectCustomer']);
      expect(bt('de', 'bookings.wizard.createNewCustomer')).toBe(de['bookings.wizard.createNewCustomer']);
    });

    it('localizes booking status presentation', () => {
      const statuses: BookingUiStatus[] = [
        'pending',
        'confirmed',
        'active',
        'completed',
        'cancelled',
        'no_show',
      ];
      for (const status of statuses) {
        expect(bookingStatusLabel(status, 'en')).toBeTruthy();
        expect(bookingStatusLabel(status, 'de')).toBeTruthy();
      }
    });

    it('keeps internal booking status values unchanged', () => {
      expect(normalizeBookingStatus('CONFIRMED')).toBe('confirmed');
      expect(normalizeBookingStatus('NO_SHOW')).toBe('no_show');
      const source = readFileSync(join(__dirname, 'bookings/bookingStatus.tsx'), 'utf8');
      expect(source).toContain("'pending'");
      expect(source).toContain('CONFIRMED');
    });

    it('never renders raw internal booking status strings as presentation labels', () => {
      expect(bookingStatusLabel('confirmed', 'en')).toBe(en['bookings.confirmed']);
      expect(bookingStatusLabel('confirmed', 'en')).not.toBe('CONFIRMED');
      expect(bookingStatusLabel('confirmed', 'de')).toBe(de['bookings.confirmed']);
      expect(bookingStatusLabel('confirmed', 'de')).not.toBe('confirmed');
    });

    it('formats booking calendar/numbers with a non-DE/EN active locale', () => {
      expect(bookingsFormattingLocaleOrDefault('pl')).toBe('pl-PL');
      const formatted = new Date('2026-08-19T15:30:00Z').toLocaleDateString(
        bookingsFormattingLocaleOrDefault('pl'),
        { day: '2-digit', month: 'long', year: 'numeric' },
      );
      expect(formatted).toMatch(/2026/);
      expect(formatted.toLowerCase()).toMatch(/sierp|aug|08|19/i);
      const calendarSource = readFileSync(
        join(__dirname, 'bookings/BookingsCalendarView.tsx'),
        'utf8',
      );
      expect(calendarSource).toContain('toLocaleDateString(locale');
    });

    it('localizes pricing/payment labels without altering amount formatting contract', () => {
      expect(bt('en', 'bookings.wizard.subtotalNet')).toBe(en['bookings.wizard.subtotalNet']);
      expect(bt('de', 'bookings.wizard.depositAtPickup')).toBe(de['bookings.wizard.depositAtPickup']);
      const source = readFileSync(join(__dirname, 'new-booking/BookingSummaryPanel.tsx'), 'utf8');
      expect(source).not.toMatch(/Zwischensumme \(netto\)/);
    });

    it('renders English booking copy', () => {
      expect(bt('en', 'bookings.wizard.summaryTitle')).toBe(en['bookings.wizard.summaryTitle']);
    });

    it('renders German booking copy', () => {
      expect(bt('de', 'bookings.wizard.summaryTitle')).toBe(de['bookings.wizard.summaryTitle']);
    });

    it('falls back partial locales to English for bookings copy', () => {
      const result = translateKey('pl', 'bookings.detail.openCustomerFile');
      expect(result.source).toBe('fallback-en');
      expect(result.text).toBe(en['bookings.detail.openCustomerFile']);
    });

    it('falls back Turkish to English for bookings copy', () => {
      const result = translateKey('tr', 'bookings.wizard.selectVehicle');
      expect(result.source).toBe('fallback-en');
      expect(result.text).toBe(en['bookings.wizard.selectVehicle']);
    });

    it('does not surface raw translation keys for bookings helpers', () => {
      const label = bt('en', 'bookings.planner.pending');
      expect(label).not.toMatch(/^bookings\./);
      expect(label).not.toBe('undefined');
    });
  });

  describe('customers', () => {
    it('localizes customer list labels', () => {
      expect(ct('en', 'customers.table.bookings')).toBe(en['customers.table.bookings']);
      expect(ct('de', 'customers.filter.title')).toBe(de['customers.filter.title']);
    });

    it('localizes customer detail labels', () => {
      expect(ct('en', 'customers.detail.header.clearancePrefix')).toBe(
        en['customers.detail.header.clearancePrefix'],
      );
      expect(ct('de', 'customers.detail.overview.totalBookings')).toBe(
        de['customers.detail.overview.totalBookings'],
      );
    });

    it('localizes create/edit customer labels', () => {
      expect(ct('en', 'customers.wizard.submit')).toBe(en['customers.wizard.submit']);
      expect(ct('de', 'customers.wizard.firstNameRequired')).toBe(de['customers.wizard.firstNameRequired']);
    });

    it('localizes customer status presentation', () => {
      expect(customerStatusUiLabel('Active', 'en')).toBe(en['customers.status.active']);
      expect(customerStatusUiLabel('Blocked', 'de')).toBe(de['customers.status.blocked']);
    });

    it('keeps internal customer status values unchanged', () => {
      const source = readFileSync(join(__dirname, '../lib/entityMappers.ts'), 'utf8');
      expect(source).toContain("case 'Active'");
      expect(source).toContain("case 'Under Review'");
    });

    it('formats customer dates with active locale helper', () => {
      expect(customersFormattingLocaleOrDefault('fr')).toBe('fr-FR');
      const formatted = formatDate('2026-08-19', customersFormattingLocaleOrDefault('fr'));
      expect(formatted).toMatch(/2026/);
      expect(formatted).toMatch(/19|08|août|aug/i);
      const headerSource = readFileSync(
        join(__dirname, 'customer-detail/CustomerDetailHeader.tsx'),
        'utf8',
      );
      expect(headerSource).toContain('formatDate(customerSince, formattingLocale)');
    });

    it('never renders raw internal customer status strings as presentation labels', () => {
      expect(customerStatusUiLabel('Active', 'de')).toBe(de['customers.status.active']);
      expect(customerStatusUiLabel('Active', 'de')).not.toBe('Active');
      expect(customerStatusUiLabel('Under Review', 'en')).toBe(en['customers.status.underReview']);
      expect(customerStatusUiLabel('Under Review', 'en')).not.toBe('Under Review');
    });

    it('renders English customer copy', () => {
      expect(ct('en', 'customers.createCustomer')).toBe(en['customers.createCustomer']);
    });

    it('renders German customer copy', () => {
      expect(ct('de', 'customers.createCustomer')).toBe(de['customers.createCustomer']);
    });

    it('falls back partial locales to English for customers copy', () => {
      const result = translateKey('cs', 'customers.wizard.verificationPlanTitle');
      expect(result.source).toBe('fallback-en');
      expect(result.text).toBe(en['customers.wizard.verificationPlanTitle']);
    });

    it('falls back Turkish to English for customers copy', () => {
      const result = translateKey('tr', 'customers.table.verification');
      expect(result.source).toBe('fallback-en');
      expect(result.text).toBe(en['customers.table.verification']);
    });

    it('does not surface raw translation keys for customers helpers', () => {
      const label = ct('en', 'customers.status.active');
      expect(label).not.toMatch(/^customers\./);
      expect(label).not.toBe('undefined');
    });
  });

  describe('guardrails', () => {
    it('keeps booking clean zone at zero enforce-clean findings', () => {
      const debt = p23ScopedFindings(isP23BookingsPath);
      expect(debt).toHaveLength(0);
    });

    it('keeps customer clean zone at zero enforce-clean findings', () => {
      const debt = p23ScopedFindings(isP23CustomersPath);
      expect(debt).toHaveLength(0);
    });

    it('does not add new ../i18n/ compatibility shim consumers in P2.2.3 touched files', () => {
      const touched = [
        join(__dirname, 'BookingsView.tsx'),
        join(__dirname, 'BookingDocumentsSection.tsx'),
        join(__dirname, 'NewBookingView.tsx'),
        join(__dirname, 'new-booking/CustomerStep.tsx'),
      ];
      for (const filePath of touched) {
        const source = readFileSync(filePath, 'utf8');
        expect(source, filePath).not.toMatch(/from '\.\.\/i18n\//);
      }
    });

    it('reports zero global enforce-clean findings after P2.2.3', () => {
      expect(inventory.summary.enforceCleanRemaining).toBe(0);
    });
  });
});
