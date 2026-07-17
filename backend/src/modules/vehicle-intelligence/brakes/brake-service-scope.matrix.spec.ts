import { BrakeComponentInstallationType, BrakeServiceKind } from '@prisma/client';
import {
  inferScopeFromMeasurements,
  profileForExplicitScope,
  resolveServiceComponentScope,
} from './brake-service-scope.matrix';

describe('brake-service-scope.matrix', () => {
  const emptyMeasured = {
    frontPadMm: null,
    rearPadMm: null,
    frontDiscMm: null,
    rearDiscMm: null,
  };

  it('maps INSPECTION_ONLY to no components', () => {
    expect(
      resolveServiceComponentScope({
        kind: BrakeServiceKind.INSPECTION_ONLY,
        measured: { ...emptyMeasured, frontPadMm: 6.2 },
      }),
    ).toEqual({ profile: 'INSPECTION_ONLY', components: [] });
  });

  it('maps BRAKE_FLUID_SERVICE to no pad/disc components', () => {
    expect(
      resolveServiceComponentScope({
        kind: BrakeServiceKind.BRAKE_FLUID_SERVICE,
        measured: { ...emptyMeasured, rearPadMm: 7.1 },
      }),
    ).toEqual({ profile: 'BRAKE_FLUID_SERVICE', components: [] });
  });

  it('maps FRONT_PADS_REPLACED scope profile', () => {
    expect(profileForExplicitScope(['front_pads'])).toBe('FRONT_PADS_REPLACED');
    expect(
      resolveServiceComponentScope({
        kind: BrakeServiceKind.PADS_SERVICE,
        scope: ['front_pads'],
        measured: { ...emptyMeasured, frontPadMm: 11 },
      }),
    ).toEqual({
      profile: 'FRONT_PADS_REPLACED',
      components: [BrakeComponentInstallationType.FRONT_PADS],
    });
  });

  it('maps FRONT_PADS_AND_DISCS scope profile', () => {
    expect(
      profileForExplicitScope(['front_pads', 'front_discs']),
    ).toBe('FRONT_PADS_AND_DISCS');
  });

  it('rejects FULL_BRAKE_SERVICE without explicit scope', () => {
    expect(() =>
      resolveServiceComponentScope({
        kind: BrakeServiceKind.FULL_BRAKE_SERVICE,
        measured: emptyMeasured,
      }),
    ).toThrow('full_service_requires_explicit_scope');
  });

  it('does not auto-expand FULL_BRAKE_SERVICE to all components', () => {
    expect(
      resolveServiceComponentScope({
        kind: BrakeServiceKind.FULL_BRAKE_SERVICE,
        scope: ['front_pads'],
        measured: { ...emptyMeasured, frontPadMm: 10 },
      }),
    ).toEqual({
      profile: 'FULL_BRAKE_SERVICE',
      components: [BrakeComponentInstallationType.FRONT_PADS],
    });
  });

  it('rejects thickness outside resolved scope', () => {
    expect(() =>
      resolveServiceComponentScope({
        kind: BrakeServiceKind.PADS_SERVICE,
        scope: ['front_pads'],
        measured: { ...emptyMeasured, frontPadMm: 10, rearPadMm: 9 },
      }),
    ).toThrow('thickness_outside_scope:rearPadMm');
  });

  it('infers scope from measurements for pads service', () => {
    expect(
      inferScopeFromMeasurements({
        frontPadMm: 8.8,
        rearPadMm: 8.1,
        frontDiscMm: null,
        rearDiscMm: null,
      }),
    ).toEqual([
      BrakeComponentInstallationType.FRONT_PADS,
      BrakeComponentInstallationType.REAR_PADS,
    ]);
  });

  it('rejects pads service without scope or measurements', () => {
    expect(() =>
      resolveServiceComponentScope({
        kind: BrakeServiceKind.PADS_SERVICE,
        measured: emptyMeasured,
      }),
    ).toThrow('explicit_scope_required');
  });

  it('rejects discs on pads service scope', () => {
    expect(() =>
      resolveServiceComponentScope({
        kind: BrakeServiceKind.PADS_SERVICE,
        scope: ['front_discs'],
        measured: { ...emptyMeasured, frontDiscMm: 28 },
      }),
    ).toThrow('scope_violation:FRONT_DISCS');
  });
});
