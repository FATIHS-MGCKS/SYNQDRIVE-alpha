import { testGateResult } from '../booking-eligibility-gatekeeper/booking-eligibility-test.fixtures';
import {
  assertNoPiiInDerivedFacts,
  buildDataSourcesFromGateResult,
  buildDerivedFactsFromGateResult,
  buildRulesHashFromRevisions,
  resolveRecheckAt,
  sanitizeFactProvenance,
} from './booking-eligibility-decision.util';

describe('booking-eligibility-decision.util', () => {
  it('builds stable rules hash from revision list', () => {
    const hash = buildRulesHashFromRevisions([
      {
        id: 'rev-b',
        rulesHash: 'hash-b',
        version: 2,
      } as never,
      {
        id: 'rev-a',
        rulesHash: 'hash-a',
        version: 1,
      } as never,
    ]);

    expect(hash).toHaveLength(64);
    expect(hash).toBe(
      buildRulesHashFromRevisions([
        {
          id: 'rev-a',
          rulesHash: 'hash-a',
          version: 1,
        } as never,
        {
          id: 'rev-b',
          rulesHash: 'hash-b',
          version: 2,
        } as never,
      ]),
    );
  });

  it('stores derived facts without raw document values', () => {
    const base = testGateResult({
      status: 'MANUAL_APPROVAL_REQUIRED',
      stage: 'CONFIRM',
      allowed: false,
      recheckRequired: true,
    });
    const gateResult = testGateResult({
      ...base,
      domains: {
        ...base.domains,
        rentalRules: {
          evaluated: true,
          result: {
            status: 'MANUAL_APPROVAL_REQUIRED',
            blockingReasons: [],
            warningReasons: [],
            missingFields: ['customer.dateOfBirth'],
            manualApprovalReasons: ['Needs review'],
            effectiveRules: {
              organizationId: 'org-1',
              vehicleId: 'vehicle-1',
              rentalCategoryId: 'cat-1',
            } as never,
            decisionSource: 'RENTAL_RULES_EFFECTIVE',
            facts: [
              {
                field: 'dateOfBirth',
                sourceType: 'OCR_UNVERIFIED',
                sourceId: 'doc-1',
                verificationStatus: 'PENDING_REVIEW',
                verifiedAt: null,
                verifiedBy: null,
                factualValue: '1990-01-01',
                evaluatedAt: '2026-07-23T10:00:00.000Z',
              },
            ],
            customerId: 'customer-1',
            vehicleId: 'vehicle-1',
          },
        },
      },
    });

    const derived = buildDerivedFactsFromGateResult(gateResult);
    expect(derived.factProvenance).toEqual([
      {
        field: 'dateOfBirth',
        sourceType: 'OCR_UNVERIFIED',
        verificationStatus: 'PENDING_REVIEW',
        verifiedAt: null,
      },
    ]);
    expect(JSON.stringify(derived)).not.toContain('1990-01-01');
    assertNoPiiInDerivedFacts(derived);
  });

  it('captures data source evaluation flags', () => {
    const gateResult = testGateResult({ status: 'ELIGIBLE', allowed: true });
    const sources = buildDataSourcesFromGateResult(gateResult);
    expect(sources.customer).toEqual(
      expect.objectContaining({ evaluated: expect.any(Boolean) }),
    );
    expect(sources.rentalRules).toEqual(
      expect.objectContaining({ evaluated: expect.any(Boolean) }),
    );
  });

  it('resolves recheckAt when recheck is required', () => {
    const gateResult = testGateResult({
      recheckRequired: true,
      evaluatedAt: '2026-07-23T10:00:00.000Z',
    });
    const recheckAt = resolveRecheckAt(gateResult);
    expect(recheckAt?.toISOString()).toBe('2026-07-24T10:00:00.000Z');
  });

  it('sanitizes fact provenance without factual values', () => {
    const provenance = sanitizeFactProvenance([
      {
        field: 'licenseIssuedAt',
        sourceType: 'KYC_VERIFIED',
        sourceId: 'check-1',
        verificationStatus: 'VERIFIED',
        verifiedAt: '2026-07-01T00:00:00.000Z',
        verifiedBy: 'user-1',
        factualValue: '2018-05-01',
        evaluatedAt: '2026-07-23T10:00:00.000Z',
      },
    ]);
    expect(provenance[0]).not.toHaveProperty('factualValue');
  });
});
