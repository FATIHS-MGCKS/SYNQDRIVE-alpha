import { describe, expect, it } from 'vitest';
import { buildOperatorHandoverPayload, createInitialHandoverState } from './operatorHandoverPayload';
import {
  collectTechnicalObservationsForPayload,
  createEmptyObservationDraft,
  hasWarningLightsObservationCoverage,
} from './operatorHandoverTechnicalObservations';

const booking = {
  id: 'booking-1',
  vehicleId: 'vehicle-1',
  customerId: 'customer-1',
  vehicleName: 'VW Golf',
  plate: 'B-XY 123',
  customerName: 'Max Mustermann',
  startDate: '2026-06-01',
  endDate: '2026-06-10',
  pickupLocation: 'Berlin',
};

describe('operator handover technical observations', () => {
  it('does not migrate general notes to observations', () => {
    const state = createInitialHandoverState(booking, 'RETURN');
    state.notes = 'Kunde war pünktlich';
    expect(collectTechnicalObservationsForPayload('RETURN', state)).toEqual([]);
  });

  it('includes manual drafts in payload', () => {
    const state = createInitialHandoverState(booking, 'RETURN');
    state.technicalObservationDrafts = [
      createEmptyObservationDraft({
        description: 'Wischer verschlissen',
        category: 'wipers_windows',
        severity: 'low',
      }),
    ];
    const payload = buildOperatorHandoverPayload({ kind: 'RETURN', booking, state });
    expect(payload.technicalObservations).toHaveLength(1);
    expect(payload.technicalObservations?.[0].description).toBe('Wischer verschlissen');
  });

  it('auto-adds warning lights notes when not duplicated', () => {
    const state = createInitialHandoverState(booking, 'RETURN');
    state.checks.warningLightsOn = true;
    state.warningLightsNotes = 'Batterielampe war an';
    const items = collectTechnicalObservationsForPayload('RETURN', state);
    expect(items).toHaveLength(1);
    expect(items[0].category).toBe('lights');
    expect(items[0].description).toBe('Batterielampe war an');
  });

  it('dedupes warning lights when operator already captured same text', () => {
    const state = createInitialHandoverState(booking, 'RETURN');
    state.checks.warningLightsOn = true;
    state.warningLightsNotes = 'Batterielampe war an';
    state.technicalObservationDrafts = [
      createEmptyObservationDraft({
        description: 'Batterielampe war an',
        category: 'electronics_controls',
      }),
    ];
    expect(hasWarningLightsObservationCoverage(state.technicalObservationDrafts, state.warningLightsNotes)).toBe(
      true,
    );
    expect(collectTechnicalObservationsForPayload('RETURN', state)).toHaveLength(1);
  });

  it('keeps warningLightsNotes on protocol fields separately', () => {
    const state = createInitialHandoverState(booking, 'RETURN');
    state.odometerKm = '12000';
    state.checks.warningLightsOn = true;
    state.warningLightsNotes = 'Öldruck';
    const payload = buildOperatorHandoverPayload({ kind: 'RETURN', booking, state });
    expect(payload.warningLightsNotes).toBe('Öldruck');
    expect(payload.technicalObservations?.[0].description).toBe('Öldruck');
  });
});
