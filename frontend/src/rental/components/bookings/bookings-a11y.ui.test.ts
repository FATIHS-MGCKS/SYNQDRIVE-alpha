import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  bookingChipAriaLabel,
  bookingRowActionAria,
  BOOKING_FOCUS_RING,
  BOOKING_TOUCH_TARGET,
} from './bookings-a11y';

const ROOT = resolve(process.cwd(), 'src/rental');

describe('bookings a11y helpers', () => {
  it('builds descriptive chip and action labels', () => {
    expect(bookingChipAriaLabel('BK-001', 'Max Mustermann')).toBe(
      'Buchung BK-001, Kunde Max Mustermann',
    );
    expect(bookingRowActionAria('BK-001', 'edit')).toBe('Buchung BK-001 bearbeiten');
    expect(bookingRowActionAria('BK-001', 'cancel')).toBe('Buchung BK-001 stornieren');
  });

  it('exports shared focus and touch target tokens', () => {
    expect(BOOKING_FOCUS_RING).toContain('focus-visible:ring');
    expect(BOOKING_TOUCH_TARGET).toContain('min-h-11');
  });
});

describe('bookings a11y quality audit', () => {
  it('table view uses aria-labels and 44px action targets', () => {
    const source = readFileSync(resolve(ROOT, 'components/bookings/BookingsTableView.tsx'), 'utf8');
    expect(source).toContain('bookingRowActionAria');
    expect(source).toContain('BOOKING_TOUCH_TARGET');
    expect(source).toContain('aria-label="Vorherige Seite"');
  });

  it('calendar removes nested day button and enlarges booking chips', () => {
    const source = readFileSync(resolve(ROOT, 'components/bookings/BookingsCalendarView.tsx'), 'utf8');
    expect(source).not.toMatch(/<button[^>]*>\s*\{day\}\s*<\/button>/);
    expect(source).toContain('bookingChipAriaLabel');
    expect(source).toContain('min-h-11');
    expect(source).toContain('role="gridcell"');
  });

  it('timeline uses touch scroll and taller booking bars on narrow screens', () => {
    const source = readFileSync(resolve(ROOT, 'components/bookings/BookingsTimelineView.tsx'), 'utf8');
    expect(source).toContain('[-webkit-overflow-scrolling:touch]');
    expect(source).toContain('sticky left-0');
    expect(source).toContain('min-h-11');
    expect(source).toContain('aria-label={bookingChipAriaLabel');
  });

  it('edit dialog uses FormDialog with labelled fields', () => {
    const source = readFileSync(resolve(ROOT, 'components/booking-detail/BookingEditDialog.tsx'), 'utf8');
    expect(source).toContain('FormDialog');
    expect(source).toContain('id="booking-edit-start"');
    expect(source).toContain('onOpenChange');
  });

  it('detail header quick actions use DropdownMenu instead of hover-only menu', () => {
    const source = readFileSync(resolve(ROOT, 'components/booking-detail/BookingDetailHeader.tsx'), 'utf8');
    expect(source).toContain('DropdownMenu');
    expect(source).not.toContain('group-hover:block');
  });

  it('dossier confirm flows use ConfirmDialog', () => {
    const source = readFileSync(resolve(ROOT, 'components/booking-detail/BookingDossier.tsx'), 'utf8');
    expect(source).toContain('ConfirmDialog');
    expect(source).not.toContain('ConfirmModal');
  });

  it('data table supports keyboard row activation and sticky actions', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/patterns/data-table.tsx'), 'utf8');
    expect(source).toContain('tabIndex={onRowClick ? 0 : undefined}');
    expect(source).toContain('sticky right-0');
    expect(source).toContain('aria-label="Aktionen"');
  });
});
