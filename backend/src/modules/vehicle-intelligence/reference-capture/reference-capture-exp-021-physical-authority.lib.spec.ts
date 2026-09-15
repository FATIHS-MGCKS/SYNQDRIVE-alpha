import {
  assertPhysicalFirstPhaseAuthorityConsistency,
  buildPhysicalFirstPhaseAuthorityPatch,
  Exp021PhaseIdentityConflictError,
  mergeExp021PhysicalAuthority,
  parseExp021PhysicalAuthority,
  resolvePhysicalFirstPhaseStartedAt,
} from './reference-capture-exp-021-physical-authority.lib';

describe('EXP-021 physical authority — first-phase generalization', () => {
  const baseAuthority = {
    canonicalT0At: '2026-09-15T11:39:01.000Z',
    firstQualifyingMovementAt: '2026-09-15T11:39:01.000Z',
    startConfirmedAt: '2026-09-15T11:39:02.000Z',
    persistedAt: '2026-09-15T11:39:02.000Z',
    orchestrationState: 'DRIVING' as const,
  };

  it('reads legacy-only physicalPhase60StartedAt', () => {
    const preflight = mergeExp021PhysicalAuthority({}, {
      ...baseAuthority,
      physicalPhase60StartedAt: '2026-09-15T11:39:01.000Z',
    });
    const authority = parseExp021PhysicalAuthority(preflight);
    expect(resolvePhysicalFirstPhaseStartedAt(authority)).toBe('2026-09-15T11:39:01.000Z');
  });

  it('reads canonical-only physicalFirstPhaseStartedAt', () => {
    const preflight = mergeExp021PhysicalAuthority({}, {
      ...baseAuthority,
      physicalFirstPhaseStartedAt: '2026-09-15T11:39:01.000Z',
    });
    const authority = parseExp021PhysicalAuthority(preflight);
    expect(resolvePhysicalFirstPhaseStartedAt(authority)).toBe('2026-09-15T11:39:01.000Z');
  });

  it('accepts both fields when equal', () => {
    const patch = buildPhysicalFirstPhaseAuthorityPatch('2026-09-15T11:39:01.000Z');
    const preflight = mergeExp021PhysicalAuthority({}, { ...baseAuthority, ...patch });
    expect(parseExp021PhysicalAuthority(preflight)).toBeTruthy();
    expect(resolvePhysicalFirstPhaseStartedAt(parseExp021PhysicalAuthority(preflight))).toBe(
      '2026-09-15T11:39:01.000Z',
    );
  });

  it('fails closed on conflicting first-phase fields', () => {
    expect(() =>
      assertPhysicalFirstPhaseAuthorityConsistency({
        physicalFirstPhaseStartedAt: '2026-09-15T11:39:01.000Z',
        physicalPhase60StartedAt: '2026-09-15T11:40:00.000Z',
      }),
    ).toThrow(Exp021PhaseIdentityConflictError);
    const preflight = mergeExp021PhysicalAuthority({}, {
      ...baseAuthority,
      physicalFirstPhaseStartedAt: '2026-09-15T11:39:01.000Z',
      physicalPhase60StartedAt: '2026-09-15T11:40:00.000Z',
    });
    expect(() => parseExp021PhysicalAuthority(preflight)).toThrow(Exp021PhaseIdentityConflictError);
  });

  it('writes canonical and legacy alias together', () => {
    const patch = buildPhysicalFirstPhaseAuthorityPatch('2026-09-15T11:39:01.000Z');
    expect(patch.physicalFirstPhaseStartedAt).toBe('2026-09-15T11:39:01.000Z');
    expect(patch.physicalPhase60StartedAt).toBe('2026-09-15T11:39:01.000Z');
  });
});
