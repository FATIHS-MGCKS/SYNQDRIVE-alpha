import { describe, expect, it } from 'vitest';
import { isMasterElectrifiedFuelType } from './master-ev-fuel-type.util';

describe('isMasterElectrifiedFuelType', () => {
  it('accepts canonical admin labels and raw enums', () => {
    expect(isMasterElectrifiedFuelType('Electric')).toBe(true);
    expect(isMasterElectrifiedFuelType('ELECTRIC')).toBe(true);
    expect(isMasterElectrifiedFuelType('Plug-in Hybrid')).toBe(true);
    expect(isMasterElectrifiedFuelType('Plugin Hybrid')).toBe(true);
    expect(isMasterElectrifiedFuelType('Hybrid')).toBe(true);
  });

  it('rejects non-electrified fuels', () => {
    expect(isMasterElectrifiedFuelType('Gasoline')).toBe(false);
    expect(isMasterElectrifiedFuelType('Diesel')).toBe(false);
    expect(isMasterElectrifiedFuelType('')).toBe(false);
  });
});
