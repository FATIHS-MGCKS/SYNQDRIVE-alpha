import { describe, expect, it } from 'vitest';
import { createInitialHandoverState } from './operatorHandoverPayload';
import { mergeHandoverDraftIntoState, serializeHandoverDraftState } from './operatorHandoverDraft.utils';

describe('operatorHandoverDraft.utils', () => {
  const base = createInitialHandoverState(
    {
      id: 'bk-1',
      vehicleId: 'veh-1',
      vehicleName: 'Test',
      plate: 'AB-123',
      customerName: 'Customer',
      pickupStationId: 'st-1',
      returnStationId: 'st-2',
    },
    'PICKUP',
  );

  it('serializes selectedDamageIds as array', () => {
    const state = { ...base, selectedDamageIds: new Set(['d1', 'd2']) };
    const payload = serializeHandoverDraftState(state);
    expect(payload.selectedDamageIds).toEqual(['d1', 'd2']);
  });

  it('merges draft payload into form state', () => {
    const merged = mergeHandoverDraftIntoState(base, {
      odometerKm: '12345',
      selectedDamageIds: ['d9'],
      technicalObservationDrafts: [{ description: 'Scratch', category: 'body', severity: 'low' }],
    });
    expect(merged.odometerKm).toBe('12345');
    expect([...merged.selectedDamageIds]).toEqual(['d9']);
    expect(merged.technicalObservationDrafts).toHaveLength(1);
  });
});
