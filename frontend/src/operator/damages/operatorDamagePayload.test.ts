import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPERATOR_DAMAGE_FORM,
  OPERATOR_DAMAGE_LOCATION_CHIPS,
  applyLocationChip,
  buildOperatorDamagePayload,
  resolveDamageSource,
  validateOperatorDamageStep,
} from './operatorDamagePayload';

describe('operator damage capture', () => {
  it('maps handover kind to pickup/return damage sources', () => {
    expect(resolveDamageSource(undefined, 'PICKUP')).toBe('PICKUP_HANDOVER');
    expect(resolveDamageSource(undefined, 'RETURN')).toBe('RETURN_HANDOVER');
    expect(resolveDamageSource('INSPECTION')).toBe('INSPECTION');
  });

  it('requires at least one photo before leaving photos step', () => {
    expect(validateOperatorDamageStep('photos', DEFAULT_OPERATOR_DAMAGE_FORM, 0)).toBe(
      'PHOTOS_REQUIRED',
    );
    expect(validateOperatorDamageStep('photos', DEFAULT_OPERATOR_DAMAGE_FORM, 1)).toBeNull();
  });

  it('suggests tire damage type when tire chip selected', () => {
    const tireChip = OPERATOR_DAMAGE_LOCATION_CHIPS.find((c) => c.id === 'tire')!;
    const next = applyLocationChip(DEFAULT_OPERATOR_DAMAGE_FORM, tireChip);
    expect(next.damageType).toBe('TIRE_DAMAGE');
    expect(next.locationLabel).toBe('Reifen/Felge');
  });

  it('builds create payload with booking and customer linkage', () => {
    const payload = buildOperatorDamagePayload(
      { ...DEFAULT_OPERATOR_DAMAGE_FORM, description: 'Kratzer Tür' },
      {
        source: 'PICKUP_HANDOVER',
        bookingId: 'bk-1',
        customerId: 'cust-1',
        reportedBy: 'operator-1',
        images: [{ imageData: 'data:image/jpeg;base64,abc' }],
      },
    );
    expect(payload.bookingId).toBe('bk-1');
    expect(payload.customerId).toBe('cust-1');
    expect(payload.images).toHaveLength(1);
    expect(payload.source).toBe('PICKUP_HANDOVER');
  });
});
