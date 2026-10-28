import { describe, expect, it } from 'vitest';
import {
  formatFrontRearWeightDistribution,
  parseFrontWeightDistributionPct,
} from './vehicle-technical-spec.util';
import { buildMasterVehiclePhysicsSpecPatch } from './master-vehicle-registration';
import type { RegisteredVehicle } from '../data/platform-data';

const baseRv = (): RegisteredVehicle =>
  ({
    id: 'veh-1',
    organizationId: 'org-1',
    make: 'Audi',
    model: 'A4',
    year: 2016,
    engineDisplacementCc: '',
    cylinderCount: '',
    frontToRearWeightDistribution: '',
    curbWeight: '1735',
  }) as RegisteredVehicle;

describe('vehicle technical spec persistence patch', () => {
  it('builds Audi 58/42 weight patch with confirmation', () => {
    const baseline = { ...baseRv(), frontToRearWeightDistribution: '' };
    const current = { ...baseline, frontToRearWeightDistribution: '58/42' };
    const patch = buildMasterVehiclePhysicsSpecPatch(current, baseline);
    expect(patch.frontWeightDistributionPct).toBe(58);
    expect(patch.technicalSpecificationSave).toEqual({
      confirmedFieldKeys: ['frontToRearWeightDistribution'],
    });
  });

  it('builds Tiguan 60/40 patch', () => {
    const baseline = baseRv();
    const current = { ...baseline, frontToRearWeightDistribution: '60/40' };
    const patch = buildMasterVehiclePhysicsSpecPatch(current, baseline);
    expect(patch.frontWeightDistributionPct).toBe(60);
  });

  it('does not patch Arteon unknown weight', () => {
    const rv = baseRv();
    const patch = buildMasterVehiclePhysicsSpecPatch(rv, rv);
    expect(patch.frontToRearWeightDistribution).toBeUndefined();
  });

  it('formats display strings', () => {
    expect(formatFrontRearWeightDistribution(58)).toBe('58/42');
    expect(parseFrontWeightDistributionPct('60/40')).toBe(60);
  });
});
