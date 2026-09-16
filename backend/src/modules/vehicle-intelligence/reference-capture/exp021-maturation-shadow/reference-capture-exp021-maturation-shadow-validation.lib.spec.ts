import { Exp021MaturationShadowProviderOutcomeClass } from '@prisma/client';
import {
  assertAttemptParentAuthority,
  assertFamilyScheduleMatchesPersisted,
  assertProviderOutcomeConsistency,
  jsonValuesSemanticallyEqual,
  plannedAgesMsExactEqual,
} from './reference-capture-exp021-maturation-shadow-validation.lib';
import {
  Exp021MaturationShadowAttemptAuthorityError,
  Exp021MaturationShadowFamilyIdentityError,
  Exp021MaturationShadowProviderOutcomeConsistencyError,
} from './reference-capture-exp021-maturation-shadow.errors';

describe('EXP-021 maturation shadow validation lib', () => {
  it('compares plannedAgesMsExact with order sensitivity', () => {
    expect(plannedAgesMsExactEqual([40_000, 45_000], [40_000, 45_000])).toBe(true);
    expect(plannedAgesMsExactEqual([45_000, 40_000], [40_000, 45_000])).toBe(false);
  });

  it('fails closed on family schedule drift', () => {
    expect(() =>
      assertFamilyScheduleMatchesPersisted(
        { plannedAgesMsExact: [45_000], policyDelayProbeMs: 8000 },
        { plannedAgesMsExact: [50_000], policyDelayProbeMs: 8000 },
      ),
    ).toThrow(Exp021MaturationShadowFamilyIdentityError);
    expect(() =>
      assertFamilyScheduleMatchesPersisted(
        { plannedAgesMsExact: [45_000], policyDelayProbeMs: 8000 },
        { plannedAgesMsExact: [45_000], policyDelayProbeMs: 9000 },
      ),
    ).toThrow(Exp021MaturationShadowFamilyIdentityError);
  });

  it('treats JSON key order as semantically equal', () => {
    expect(
      jsonValuesSemanticallyEqual(
        { class: 'ACTIVE_MOTION', source: 'X' },
        { source: 'X', class: 'ACTIVE_MOTION' },
      ),
    ).toBe(true);
    expect(
      jsonValuesSemanticallyEqual(
        { class: 'ACTIVE_MOTION', source: 'X' },
        { class: 'IDLE', source: 'X' },
      ),
    ).toBe(false);
  });

  it('derives canonical actual age and drift from requestStartedAt-windowTo', () => {
    const windowTo = new Date('2026-09-16T20:34:00.000Z');
    const requestStartedAt = new Date(windowTo.getTime() + 45_300);
    const authority = assertAttemptParentAuthority({
      slotPlannedAgeMs: 45_000,
      proposedPlannedAgeMs: 45_000,
      stratumQuerySemanticsHash: 'sem',
      stratumSignalSetHash: 'hash',
      proposedQuerySemanticsHash: 'sem',
      proposedSignalSetHash: 'hash',
      requestStartedAt,
      requestCompletedAt: new Date(requestStartedAt.getTime() + 500),
      windowTo,
    });
    expect(authority.actualAgeMs).toBe(45_300);
    expect(authority.schedulerDriftMs).toBe(300);
  });

  it('rejects attempt parent authority mismatches', () => {
    expect(() =>
      assertAttemptParentAuthority({
        slotPlannedAgeMs: 45_000,
        proposedPlannedAgeMs: 46_000,
        stratumQuerySemanticsHash: 'sem',
        stratumSignalSetHash: 'hash',
        proposedQuerySemanticsHash: 'sem',
        proposedSignalSetHash: 'hash',
        requestStartedAt: new Date(),
        windowTo: new Date(),
      }),
    ).toThrow(Exp021MaturationShadowAttemptAuthorityError);
  });

  it('enforces provider outcome consistency matrix', () => {
    expect(() =>
      assertProviderOutcomeConsistency({
        providerRequestSucceeded: false,
        providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_ZERO,
        providerErrorClass: null,
        uniqueBucketLocusCount: 0,
      }),
    ).toThrow(Exp021MaturationShadowProviderOutcomeConsistencyError);

    expect(() =>
      assertProviderOutcomeConsistency({
        providerRequestSucceeded: true,
        providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR,
        providerErrorClass: 'NETWORK',
        uniqueBucketLocusCount: null,
      }),
    ).toThrow(Exp021MaturationShadowProviderOutcomeConsistencyError);

    assertProviderOutcomeConsistency({
      providerRequestSucceeded: false,
      providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR,
      providerErrorClass: 'NETWORK',
      uniqueBucketLocusCount: null,
    });
  });
});
