import { describe, expect, it } from 'vitest';
import {
  formatTripAttributionDetail,
  formatTripBookingAttributionLabel,
  TRIP_ATTRIBUTION_SCOPE_LABEL,
} from './trip-attribution-ui.utils';
import type { TripAttribution } from '../../../lib/api';

function attribution(partial: Partial<TripAttribution> & Pick<TripAttribution, 'scope'>): TripAttribution {
  return {
    confidence: 'LOW',
    customerRelevant: false,
    bookingRelevant: false,
    customerChargeable: false,
    bookingId: null,
    customerId: null,
    reason: 'test',
    ...partial,
  };
}

describe('trip attribution UI (Phase 4)', () => {
  it('labels private trips as non-customer-relevant', () => {
    const label = formatTripAttributionDetail(
      attribution({ scope: 'PRIVATE', confidence: 'HIGH' }),
    );
    expect(label).toContain(TRIP_ATTRIBUTION_SCOPE_LABEL.PRIVATE);
    expect(label).toContain('Nicht kunden-');
  });

  it('labels explicit booking assignment with high confidence', () => {
    const label = formatTripAttributionDetail(
      attribution({
        scope: 'BOOKING_ASSIGNED',
        confidence: 'HIGH',
        bookingRelevant: true,
        customerRelevant: true,
        bookingId: 'b1',
      }),
    );
    expect(label).toContain('Buchung verknüpft');
    expect(label).toContain('hohe Zuordnungssicherheit');
  });

  it('shows unconfirmed time-window match for booking row', () => {
    const label = formatTripBookingAttributionLabel(
      attribution({
        scope: 'BOOKING_TIME_WINDOW_MATCH',
        bookingRelevant: true,
        bookingId: 'b2',
      }),
      '1234',
    );
    expect(label).toBe('Buchung 1234');
  });

  it('shows no booking for unassigned trips', () => {
    expect(formatTripBookingAttributionLabel(attribution({ scope: 'UNASSIGNED' }))).toBe(
      'Keine Buchung verknüpft',
    );
  });
});
