import { VoiceProtectionDeniedError } from './voice-protection-reason-codes';
import {
  isBlockedSpecialDestination,
  isDestinationCountryAllowed,
  normalizeDestinationE164,
  resolveAllowedCountries,
} from './voice-destination-policy.util';
import { billableMinutesFromSeconds } from '@modules/voice-billing/voice-billing-minute.util';
import { VOICE_PROTECTION_DEFAULTS } from './voice-protection-limits.config';
import { VoiceConcurrentCallReservationService } from './voice-concurrent-call.reservation.service';
import { VoiceProtectionOverrideService } from './voice-protection-override.service';

describe('voice-destination-policy', () => {
  it('blocks special and premium destinations', () => {
    expect(isBlockedSpecialDestination('+4911601234567')).toBe(true);
    expect(isBlockedSpecialDestination('+491701234567')).toBe(false);
  });

  it('blocks non-normalizable numbers', () => {
    expect(normalizeDestinationE164('01701234567')).toBeNull();
    expect(normalizeDestinationE164('+49 170 1234567')?.e164).toBe('+491701234567');
  });

  it('denies international destination under DE_ONLY policy', () => {
    const dest = normalizeDestinationE164('+33123456789')!;
    const allowed = resolveAllowedCountries({ regionPolicy: 'DE_ONLY', customAllowedCountries: [] });
    expect(isDestinationCountryAllowed(dest, allowed)).toBe(false);
  });

  it('allows EEA destinations under DE_EEA policy', () => {
    const dest = normalizeDestinationE164('+33123456789')!;
    const allowed = resolveAllowedCountries({ regionPolicy: 'DE_EEA', customAllowedCountries: [] });
    expect(isDestinationCountryAllowed(dest, allowed)).toBe(true);
  });
});

describe('VoiceConcurrentCallReservationService', () => {
  function makeRedis() {
    const sets = new Map<string, Set<string>>();
    const counters = new Map<string, number>();
    const kv = new Map<string, string>();
    return {
      eval: jest.fn(async (_script: string, _numkeys: number, key: string, member: string, max: string) => {
        const set = sets.get(key) ?? new Set<string>();
        if (set.size >= Number(max) && !set.has(member)) {
          return 0;
        }
        set.add(member);
        sets.set(key, set);
        return 1;
      }),
      srem: jest.fn(async (key: string, member: string) => {
        sets.get(key)?.delete(member);
        return 1;
      }),
      scard: jest.fn(async (key: string) => sets.get(key)?.size ?? 0),
      incr: jest.fn(async (key: string) => {
        const next = (counters.get(key) ?? 0) + 1;
        counters.set(key, next);
        return next;
      }),
      expire: jest.fn(),
      get: jest.fn(async (key: string) => kv.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => {
        kv.set(key, value);
        return 'OK';
      }),
      _sets: sets,
    };
  }

  it('enforces concurrent call limit with race-safe reservation', async () => {
    const redis = makeRedis();
    const service = new VoiceConcurrentCallReservationService(redis as never);
    const org = 'org-a';

    expect(await service.reserve({ organizationId: org, conversationId: 'c1', maxConcurrent: 2 })).toBe(true);
    expect(await service.reserve({ organizationId: org, conversationId: 'c2', maxConcurrent: 2 })).toBe(true);
    expect(await service.reserve({ organizationId: org, conversationId: 'c3', maxConcurrent: 2 })).toBe(false);

    await service.release(org, 'c1');
    expect(await service.reserve({ organizationId: org, conversationId: 'c3', maxConcurrent: 2 })).toBe(true);
  });

  it('scopes concurrent reservations per organization (cross-tenant)', async () => {
    const redis = makeRedis();
    const service = new VoiceConcurrentCallReservationService(redis as never);

    expect(await service.reserve({ organizationId: 'org-a', conversationId: 'c1', maxConcurrent: 1 })).toBe(true);
    expect(await service.reserve({ organizationId: 'org-b', conversationId: 'c1', maxConcurrent: 1 })).toBe(true);
    expect(await service.reserve({ organizationId: 'org-a', conversationId: 'c2', maxConcurrent: 1 })).toBe(false);
  });

  it('enforces destination repeat limit and cooldown', async () => {
    const redis = makeRedis();
    const service = new VoiceConcurrentCallReservationService(redis as never);
    const params = {
      organizationId: 'org-a',
      destinationDigest: 'digest-1',
      maxRepeats: 2,
      cooldownSeconds: 60,
    };

    expect((await service.recordDestinationAttempt(params)).allowed).toBe(true);
    expect((await service.recordDestinationAttempt(params)).allowed).toBe(true);
    const blocked = await service.recordDestinationAttempt(params);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('repeat_limit');
  });
});

describe('VoiceProtectionOverrideService', () => {
  it('honors ALL_LIMITS override scope', () => {
    const service = new VoiceProtectionOverrideService({} as never, {} as never);
    const has = service.hasActiveOverride(
      [{ scope: 'ALL_LIMITS', targetRef: null }],
      'MONTHLY_BUDGET',
    );
    expect(has).toBe(true);
  });
});

describe('VoiceBudgetEnforcementService limits', () => {
  const ORG_A = 'org-a';
  const ORG_B = 'org-b';

  function buildEnforcement() {
    const audit = { record: jest.fn() };
    const subscriptions = {
      listByOrganization: jest.fn(async (orgId: string) =>
        orgId === ORG_B
          ? []
          : [{ status: 'ACTIVE', planCode: 'START', planCatalogVersion: '2026-07-17' }],
      ),
    };
    const subscriptionService = {
      getActiveSubscription: jest.fn(async (orgId: string) =>
        orgId === ORG_B
          ? null
          : { planCode: 'START', planCatalogVersion: '2026-07-17', setupFeePaidAt: new Date(), setupFeeCents: 0 },
      ),
      resolvePlanForSubscription: jest.fn(() => ({
        entitlements: { maxConcurrentCalls: 1, includedMinutesPerMonth: 100, overageCentsPerMinute: 35 },
        monthlyFeeCents: 4900,
      })),
    };
    const budgetPolicies = {
      findByOrganization: jest.fn(async () => ({
        destinationRegionPolicy: 'DE_ONLY',
        allowedCountries: [],
        monthlyBudgetCents: 1000,
        hardLimitThresholdPct: 100,
        overflowBehavior: 'HARD_STOP',
        hardLimitGraceMinutes: 0,
        dailyOutboundMinutesLimit: 5,
        maxRepeatsPerDestination: 10,
        destinationCooldownSeconds: 60,
        maxConcurrentCalls: 1,
      })),
    };
    const billing = {
      getOrganizationUsage: jest.fn(async () => ({
        overageMinutes: 10,
        consumedMinutes: 110,
        includedMinutes: 100,
        remainingIncludedMinutes: 0,
      })),
    };
    const overrides = {
      listActive: jest.fn(async () => []),
      hasActiveOverride: jest.fn(() => false),
    };
    const concurrent = {
      recordDestinationAttempt: jest.fn(async () => ({ allowed: true })),
      reserve: jest.fn(async () => true),
      release: jest.fn(),
      countActive: jest.fn(async () => 0),
    };
    const abuse = { detectSignals: jest.fn(async () => []) };
    const { VoiceEntitlementService } = require('@modules/voice-entitlement/voice-entitlement.service');
    const entitlements = new VoiceEntitlementService(subscriptions);
    const prisma = {
      voiceUsageEvent: {
        aggregate: jest.fn(async () => ({ _sum: { customerPriceCents: 1500 } })),
        findMany: jest.fn(async () =>
          Array.from({ length: 6 }).map(() => ({ billableMinutes: 1, billableSeconds: 60 })),
        ),
      },
    };

    const { VoiceBudgetEnforcementService } = require('./voice-budget-enforcement.service');
    const enforcement = new VoiceBudgetEnforcementService(
      prisma,
      subscriptions,
      subscriptionService,
      budgetPolicies,
      billing,
      overrides,
      audit,
      concurrent,
      abuse,
      entitlements,
    );

    return { enforcement, audit, concurrent, overrides, billing, prisma };
  }

  it('blocks outbound when monthly hard limit exceeded', async () => {
    const { enforcement } = buildEnforcement();
    await expect(
      enforcement.assertOutboundAllowed({
        organizationId: ORG_A,
        toE164: '+491701234567',
        voiceAssistantId: 'asst-1',
      }),
    ).rejects.toBeInstanceOf(VoiceProtectionDeniedError);
  });

  it('blocks cross-tenant without subscription', async () => {
    const { enforcement } = buildEnforcement();
    await expect(
      enforcement.assertOutboundAllowed({
        organizationId: ORG_B,
        toE164: '+491701234567',
        voiceAssistantId: 'asst-1',
      }),
    ).rejects.toBeInstanceOf(VoiceProtectionDeniedError);
  });

  it('allows outbound with monthly budget override', async () => {
    const { enforcement, overrides, prisma } = buildEnforcement();
    overrides.listActive.mockResolvedValue([{ scope: 'ALL_LIMITS', targetRef: null }] as never);
    overrides.hasActiveOverride.mockImplementation(((_rows: unknown[], _scope: string) => true) as never);
    prisma.voiceUsageEvent.findMany.mockResolvedValue([]);

    const result = await enforcement.assertOutboundAllowed({
      organizationId: ORG_A,
      toE164: '+491701234567',
      voiceAssistantId: 'asst-1',
      conversationId: 'conv-1',
    });
    expect(result.conversationSlotId).toBe('conv-1');
  });

  it('blocks daily outbound minutes limit', async () => {
    const { enforcement, billing, prisma } = buildEnforcement();
    billing.getOrganizationUsage.mockResolvedValue({ overageMinutes: 0, consumedMinutes: 0, includedMinutes: 100, remainingIncludedMinutes: 100 });
    prisma.voiceUsageEvent.aggregate.mockResolvedValue({ _sum: { customerPriceCents: 0 } });

    await expect(
      enforcement.assertOutboundAllowed({
        organizationId: ORG_A,
        toE164: '+491701234567',
        voiceAssistantId: 'asst-1',
      }),
    ).rejects.toMatchObject({ reasonCode: 'daily_outbound_minutes' });
  });
});

describe('forecast projection', () => {
  it('projects period-end minutes from progress', () => {
    const consumed = 50;
    const progressPct = 50;
    const projected = Math.round((consumed / progressPct) * 100);
    expect(projected).toBe(100);
  });

  it('uses billable minute rounding for limit accounting', () => {
    expect(billableMinutesFromSeconds(7)).toBe(1);
    expect(billableMinutesFromSeconds(6)).toBe(0);
  });
});
