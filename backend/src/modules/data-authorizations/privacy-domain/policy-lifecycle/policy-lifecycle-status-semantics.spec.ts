import { PrivacyPolicyLifecycleStatus } from '@prisma/client';
import { AuthorizationDecisionCache } from '../../authorization-decision-engine/authorization-decision.cache';
import { AUTHORIZATION_DECISION_OUTCOME } from '../../authorization-decision-engine/authorization-decision.constants';
import { PolicyLifecycleActivationGuardService } from './policy-lifecycle-activation-guard.service';
import { PolicyLifecycleExpiryService } from './policy-lifecycle-expiry.service';
import { PolicyLifecycleEventsService } from './policy-lifecycle-events.service';
import { POLICY_LIFECYCLE_REASON_CODES } from './policy-lifecycle-semantics.constants';
import {
  assertExtensionSourceAllowed,
  assertNewVersionSourceAllowed,
} from './policy-lifecycle-rollback-guard';
import {
  buildPolicyStatusSemantics,
  resolvePolicyStatusDisplayCategory,
} from './policy-lifecycle-status-semantics';
import { isPolicyPastValidUntil } from './policy-lifecycle-time.util';
import {
  isPolicyLifecycleTransitionAllowed,
  POLICY_LIFECYCLE_TRANSITIONS,
  POLICY_FORBIDDEN_TRANSITIONS,
} from './policy-lifecycle.transitions';
import { PolicyLifecycleService, PolicyLifecycleTransitionValidator } from './policy-lifecycle.service';
import {
  PolicyLifecycleDomainError,
  PolicyLifecycleTransitionException,
} from './policy-lifecycle.exceptions';

function noopAudit() {
  return {
    enqueueLifecycleAuditInTransaction: jest.fn().mockResolvedValue(null),
  };
}

describe('policy-lifecycle status semantics (Prompt 28)', () => {
  describe('status meanings', () => {
    it('marks REJECTED as never operational', () => {
      const semantics = buildPolicyStatusSemantics(PrivacyPolicyLifecycleStatus.REJECTED);
      expect(semantics.wasEverOperational).toBe(false);
      expect(semantics.isTerminal).toBe(true);
      expect(resolvePolicyStatusDisplayCategory(PrivacyPolicyLifecycleStatus.REJECTED)).toBe(
        'terminal_never_active',
      );
    });

    it('marks REVOKED as was operational and terminal', () => {
      const semantics = buildPolicyStatusSemantics(PrivacyPolicyLifecycleStatus.REVOKED);
      expect(semantics.wasEverOperational).toBe(true);
      expect(semantics.isTerminal).toBe(true);
      expect(resolvePolicyStatusDisplayCategory(PrivacyPolicyLifecycleStatus.REVOKED)).toBe(
        'terminal_was_active',
      );
    });

    it('marks SUSPENDED as paused and reversible', () => {
      const semantics = buildPolicyStatusSemantics(PrivacyPolicyLifecycleStatus.SUSPENDED);
      expect(semantics.wasEverOperational).toBe(true);
      expect(semantics.isReversible).toBe(true);
      expect(resolvePolicyStatusDisplayCategory(PrivacyPolicyLifecycleStatus.SUSPENDED)).toBe('paused');
    });

    it('marks EXPIRED and SUPERSEDED as terminal was active', () => {
      expect(resolvePolicyStatusDisplayCategory(PrivacyPolicyLifecycleStatus.EXPIRED)).toBe(
        'terminal_was_active',
      );
      expect(resolvePolicyStatusDisplayCategory(PrivacyPolicyLifecycleStatus.SUPERSEDED)).toBe(
        'terminal_was_active',
      );
    });
  });

  describe('allowed transitions', () => {
    const allowedSamples: Array<[PrivacyPolicyLifecycleStatus, PrivacyPolicyLifecycleStatus]> = [
      [PrivacyPolicyLifecycleStatus.DRAFT, PrivacyPolicyLifecycleStatus.IN_REVIEW],
      [PrivacyPolicyLifecycleStatus.IN_REVIEW, PrivacyPolicyLifecycleStatus.REJECTED],
      [PrivacyPolicyLifecycleStatus.IN_REVIEW, PrivacyPolicyLifecycleStatus.APPROVED],
      [PrivacyPolicyLifecycleStatus.APPROVED, PrivacyPolicyLifecycleStatus.ACTIVE],
      [PrivacyPolicyLifecycleStatus.SCHEDULED, PrivacyPolicyLifecycleStatus.ACTIVE],
      [PrivacyPolicyLifecycleStatus.ACTIVE, PrivacyPolicyLifecycleStatus.SUSPENDED],
      [PrivacyPolicyLifecycleStatus.ACTIVE, PrivacyPolicyLifecycleStatus.REVOKED],
      [PrivacyPolicyLifecycleStatus.ACTIVE, PrivacyPolicyLifecycleStatus.EXPIRED],
      [PrivacyPolicyLifecycleStatus.ACTIVE, PrivacyPolicyLifecycleStatus.SUPERSEDED],
      [PrivacyPolicyLifecycleStatus.SUSPENDED, PrivacyPolicyLifecycleStatus.ACTIVE],
      [PrivacyPolicyLifecycleStatus.SUSPENDED, PrivacyPolicyLifecycleStatus.EXPIRED],
    ];

    it.each(allowedSamples)('allows %s → %s', (from, to) => {
      expect(isPolicyLifecycleTransitionAllowed(from, to)).toBe(true);
      expect(POLICY_LIFECYCLE_TRANSITIONS[from]).toContain(to);
    });
  });

  describe('forbidden transitions', () => {
    it.each(POLICY_FORBIDDEN_TRANSITIONS)('forbids %s → %s', ({ from, to }) => {
      expect(isPolicyLifecycleTransitionAllowed(from, to)).toBe(false);
    });

    it('forbids REJECTED → REVOKED semantically', () => {
      expect(
        isPolicyLifecycleTransitionAllowed(
          PrivacyPolicyLifecycleStatus.REJECTED,
          PrivacyPolicyLifecycleStatus.REVOKED,
        ),
      ).toBe(false);
    });

    it('forbids terminal reactivation', () => {
      for (const terminal of [
        PrivacyPolicyLifecycleStatus.REVOKED,
        PrivacyPolicyLifecycleStatus.REJECTED,
        PrivacyPolicyLifecycleStatus.EXPIRED,
        PrivacyPolicyLifecycleStatus.SUPERSEDED,
      ]) {
        expect(
          isPolicyLifecycleTransitionAllowed(terminal, PrivacyPolicyLifecycleStatus.ACTIVE),
        ).toBe(false);
      }
    });
  });

  describe('rollback guard', () => {
    it('blocks new version from REVOKED/SUPERSEDED/REJECTED/EXPIRED', () => {
      for (const status of [
        PrivacyPolicyLifecycleStatus.REVOKED,
        PrivacyPolicyLifecycleStatus.SUPERSEDED,
        PrivacyPolicyLifecycleStatus.REJECTED,
        PrivacyPolicyLifecycleStatus.EXPIRED,
      ]) {
        expect(() => assertNewVersionSourceAllowed(status)).toThrow(PolicyLifecycleDomainError);
      }
    });

    it('allows new version from ACTIVE and SUSPENDED only', () => {
      expect(() =>
        assertNewVersionSourceAllowed(PrivacyPolicyLifecycleStatus.ACTIVE),
      ).not.toThrow();
      expect(() =>
        assertNewVersionSourceAllowed(PrivacyPolicyLifecycleStatus.SUSPENDED),
      ).not.toThrow();
    });

    it('requires ACTIVE for extension', () => {
      expect(() => assertExtensionSourceAllowed(PrivacyPolicyLifecycleStatus.ACTIVE)).not.toThrow();
      expect(() =>
        assertExtensionSourceAllowed(PrivacyPolicyLifecycleStatus.SUSPENDED),
      ).toThrow();
    });
  });

  describe('expiry job', () => {
    const now = new Date('2026-07-24T12:00:00.000Z');
    const past = new Date('2026-07-23T00:00:00.000Z');

    function buildExpiryHarness() {
      const store = {
        activity: {
          id: 'pa-1',
          organizationId: 'org-1',
          status: PrivacyPolicyLifecycleStatus.ACTIVE,
          validUntil: past,
          policyFamilyId: 'fam-1',
          versionNumber: 1,
        },
        suspended: {
          id: 'pa-2',
          organizationId: 'org-1',
          status: PrivacyPolicyLifecycleStatus.SUSPENDED,
          validUntil: past,
          policyFamilyId: 'fam-2',
          versionNumber: 1,
        },
      };
      const events: Array<{ eventType: string; newStatus: string }> = [];

      const prisma = {
        processingActivity: {
          findMany: jest.fn(async () => [store.activity, store.suspended]),
          findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
            if (where.id === store.activity.id) return { ...store.activity };
            if (where.id === store.suspended.id) return { ...store.suspended };
            return null;
          }),
          update: jest.fn(async ({ where, data }: { where: { id: string }; data: { status: PrivacyPolicyLifecycleStatus } }) => {
            if (where.id === store.activity.id) Object.assign(store.activity, data);
            if (where.id === store.suspended.id) Object.assign(store.suspended, data);
            return { id: where.id, ...data };
          }),
        },
        legalBasisAssessment: { findMany: jest.fn(async () => []) },
        enforcementPolicy: { findMany: jest.fn(async () => []) },
        processingActivityLifecycleEvent: {
          create: jest.fn(async ({ data }: { data: { eventType: string; newStatus: string } }) => {
            events.push(data);
            return data;
          }),
        },
        legalBasisAssessmentLifecycleEvent: { create: jest.fn() },
        enforcementPolicyLifecycleEvent: { create: jest.fn() },
        dataAuthorizationAuditOutbox: { create: jest.fn().mockResolvedValue({ id: 'o1' }) },
        $transaction: jest.fn(),
      };
      prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
        fn(prisma),
      );

      const cache = new AuthorizationDecisionCache(30_000, 100);
      cache.set('org-1|k1', 'v1', {
        decision: AUTHORIZATION_DECISION_OUTCOME.ALLOW,
        enforced: true,
        isShadowMode: false,
        reasonCodes: [],
        cacheHit: false,
      } as never);

      const decisionService = { invalidateOrganizationCache: jest.fn(() => cache.invalidateOrganization('org-1')) };
      const expiry = new PolicyLifecycleExpiryService(
        prisma as never,
        new PolicyLifecycleEventsService(noopAudit() as never),
        decisionService as never,
      );

      return { expiry, store, events, decisionService, cache };
    }

    it('expires ACTIVE and SUSPENDED policies past validUntil', async () => {
      const { expiry, store, events } = buildExpiryHarness();
      const result = await expiry.expireDuePolicies({ now });

      expect(result.expired).toBe(2);
      expect(store.activity.status).toBe(PrivacyPolicyLifecycleStatus.EXPIRED);
      expect(store.suspended.status).toBe(PrivacyPolicyLifecycleStatus.EXPIRED);
      expect(events.every((e) => e.newStatus === PrivacyPolicyLifecycleStatus.EXPIRED)).toBe(true);
    });

    it('is idempotent on repeated runs', async () => {
      const { expiry } = buildExpiryHarness();
      const first = await expiry.expireDuePolicies({ now });
      const second = await expiry.expireDuePolicies({ now });
      expect(first.expired).toBe(2);
      expect(second.expired).toBe(0);
    });

    it('invalidates authorization decision cache for affected orgs', async () => {
      const { expiry, decisionService, cache } = buildExpiryHarness();
      expect(cache.size).toBe(1);
      await expiry.expireDuePolicies({ now });
      expect(decisionService.invalidateOrganizationCache).toHaveBeenCalledWith('org-1');
      expect(cache.size).toBe(0);
    });

    it('uses timezone-safe UTC comparison', () => {
      const validUntil = new Date('2026-07-24T12:00:00.000Z');
      expect(isPolicyPastValidUntil(validUntil, validUntil)).toBe(true);
      expect(isPolicyPastValidUntil(new Date('2026-07-25T00:00:00.000Z'), now)).toBe(false);
    });
  });

  describe('activation guard — invalid assessment at scheduled time', () => {
    it('blocks activation when no valid legal basis exists', async () => {
      const prisma = {
        legalBasisAssessment: {
          findMany: jest.fn().mockResolvedValue([
            {
              status: PrivacyPolicyLifecycleStatus.EXPIRED,
              validFrom: null,
              validUntil: new Date('2020-01-01'),
            },
          ]),
        },
      };
      const guard = new PolicyLifecycleActivationGuardService(prisma as never);
      await expect(
        guard.assertLegalBasisValid('org-1', 'pa-1'),
      ).rejects.toThrow(PolicyLifecycleDomainError);
    });
  });

  describe('REJECTED cannot become REVOKED via transition service', () => {
    const validator = new PolicyLifecycleTransitionValidator();
    const lifecycle = new PolicyLifecycleService(
      { $transaction: jest.fn() } as never,
      validator,
      { recordProcessingActivityEvent: jest.fn() } as never,
    );

    it('rejects REJECTED → REVOKED in transitionVersion', async () => {
      await expect(
        lifecycle.transitionVersion({
          orgId: 'org-1',
          record: {
            id: 'pa-1',
            organizationId: 'org-1',
            policyFamilyId: 'fam-1',
            versionNumber: 1,
            status: PrivacyPolicyLifecycleStatus.REJECTED,
          },
          toStatus: PrivacyPolicyLifecycleStatus.REVOKED,
          input: { reason: 'should not work' },
          loadCurrent: async () => null,
          applyTransition: async () => ({}) as never,
          recordEvent: async () => {},
        }),
      ).rejects.toThrow(PolicyLifecycleTransitionException);
    });
  });

  describe('reason codes', () => {
    it('defines distinct reason code families per terminal status', () => {
      expect(POLICY_LIFECYCLE_REASON_CODES.REJECTED.GOVERNANCE_REJECTION).toMatch(/^POLICY_REJECTED_/);
      expect(POLICY_LIFECYCLE_REASON_CODES.REVOKED.OPERATOR_REVOCATION).toMatch(/^POLICY_REVOKED_/);
      expect(POLICY_LIFECYCLE_REASON_CODES.EXPIRED.VALID_UNTIL_REACHED).toMatch(/^POLICY_EXPIRED_/);
      expect(POLICY_LIFECYCLE_REASON_CODES.SUPERSEDED.NEW_VERSION_ACTIVATED).toMatch(
        /^POLICY_SUPERSEDED_/,
      );
      expect(POLICY_LIFECYCLE_REASON_CODES.SUSPENDED.CONSENT_WITHDRAWN).toMatch(/^POLICY_SUSPENDED_/);
    });
  });
});
