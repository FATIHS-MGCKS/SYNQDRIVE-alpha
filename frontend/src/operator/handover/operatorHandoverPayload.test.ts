import { describe, expect, it } from 'vitest';
import {
  buildOperatorHandoverPayload,
  canAdvanceFromStep,
  canNavigateToStep,
  createInitialHandoverState,
  getOperatorHandoverFinalizeLabel,
  validateOperatorHandover,
  validateOperatorHandoverStep,
} from './operatorHandoverPayload';
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

describe('operator handover validation', () => {
  it('blocks advance from vehicle when station missing', () => {
    const state = createInitialHandoverState(booking, 'PICKUP');
    state.actualStationId = '';
    expect(canAdvanceFromStep('vehicle', 'PICKUP', booking, state)).toBe(false);
    expect(validateOperatorHandoverStep('vehicle', 'PICKUP', booking, state)[0]?.field).toBe(
      'actualStationId',
    );
  });

  it('blocks advance from condition without odometer', () => {
    const state = createInitialHandoverState(booking, 'PICKUP');
    state.odometerKm = '';
    expect(canAdvanceFromStep('condition', 'PICKUP', booking, state)).toBe(false);
  });

  it('blocks tablet jump to review when signatures missing', () => {
    const state = createInitialHandoverState(booking, 'PICKUP');
    state.actualStationId = 'station-1';
    state.odometerKm = '10000';
    state.checks.documentsAcknowledged = true;
    expect(canNavigateToStep('review', 'vehicle', 'PICKUP', booking, state)).toBe(false);
  });

  it('uses binding finalize labels', () => {
    expect(getOperatorHandoverFinalizeLabel('PICKUP')).toContain('verbindlich');
    expect(getOperatorHandoverFinalizeLabel('RETURN')).toContain('verbindlich');
  });

  it('aggregates all issues for review submit', () => {
    const state = createInitialHandoverState(booking, 'PICKUP');
    state.actualStationId = 'station-1';
    state.odometerKm = '10000';
    const issues = validateOperatorHandover('PICKUP', booking, state);
    expect(issues.some((i) => i.step === 'documents')).toBe(true);
    expect(issues.some((i) => i.step === 'signatures')).toBe(true);
  });
});
