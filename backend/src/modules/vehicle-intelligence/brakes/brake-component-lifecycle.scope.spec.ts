import { BrakeComponentInstallationType, BrakeServiceKind } from '@prisma/client';
import {
  assertExplicitScope,
  normalizeScopeTokens,
  validateAxleScopedSet,
} from './brake-component-lifecycle.scope';

describe('brake-component-lifecycle.scope', () => {
  it('normalizes mixed scope tokens', () => {
    expect(normalizeScopeTokens(['front_pads', 'REAR_DISCS'])).toEqual([
      BrakeComponentInstallationType.FRONT_PADS,
      BrakeComponentInstallationType.REAR_DISCS,
    ]);
  });

  it('requires explicit scope for full service', () => {
    expect(() =>
      assertExplicitScope([], { serviceKind: BrakeServiceKind.FULL_BRAKE_SERVICE }),
    ).toThrow('full_service_requires_explicit_scope');
  });

  it('does not auto-expand full service to all components', () => {
    const scope = normalizeScopeTokens(['front_pads']);
    assertExplicitScope(scope, { serviceKind: BrakeServiceKind.FULL_BRAKE_SERVICE });
    expect(scope).toEqual([BrakeComponentInstallationType.FRONT_PADS]);
  });

  it('allows front axle pair pads + discs', () => {
    expect(() =>
      validateAxleScopedSet([
        BrakeComponentInstallationType.FRONT_PADS,
        BrakeComponentInstallationType.FRONT_DISCS,
      ]),
    ).not.toThrow();
  });

  it('rejects front pads with rear discs cross-axle scope', () => {
    expect(() =>
      validateAxleScopedSet([
        BrakeComponentInstallationType.FRONT_PADS,
        BrakeComponentInstallationType.REAR_DISCS,
      ]),
    ).toThrow('scope_violation:front_pads_with_rear_discs');
  });
});
