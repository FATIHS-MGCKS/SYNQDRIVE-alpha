import {
  VOICE_PLAN_CATALOG,
  VOICE_COST_FALLBACK_CENTS_PER_MINUTE,
  resolveVoicePlan,
} from './voice-plan-catalog';
import { billableMinutesFromSeconds, VOICE_BILLING_GRACE_SECONDS } from './voice-billing-minute.util';
import { computeVoiceUsageCosts, mergeProviderCostUpdate } from './voice-billing-cost.util';
import {
  computeCustomerPriceForUsage,
  computePeriodRevenueForecast,
} from './voice-billing-pricing.util';
import { eurosToCents, marginCents, marginPercent, multiplyCents } from './voice-billing-rounding.util';

describe('voice-plan-catalog', () => {
  it('defines all tariffs with EUR net pricing', () => {
    expect(VOICE_PLAN_CATALOG.START.monthlyFeeCents).toBe(4900);
    expect(VOICE_PLAN_CATALOG.PRO.monthlyFeeCents).toBe(11900);
    expect(VOICE_PLAN_CATALOG.BUSINESS.monthlyFeeCents).toBe(24900);
    expect(VOICE_PLAN_CATALOG.START.setupFeeCents).toBe(14900);
    expect(VOICE_PLAN_CATALOG.PRO.setupFeeCents).toBe(24900);
    expect(VOICE_PLAN_CATALOG.BUSINESS.setupFeeCents).toBe(49900);
    expect(VOICE_PLAN_CATALOG.START.entitlements.includedMinutesPerMonth).toBe(100);
    expect(VOICE_PLAN_CATALOG.PRO.entitlements.includedMinutesPerMonth).toBe(400);
    expect(VOICE_PLAN_CATALOG.BUSINESS.entitlements.includedMinutesPerMonth).toBe(1000);
    expect(VOICE_PLAN_CATALOG.START.entitlements.overageCentsPerMinute).toBe(35);
    expect(VOICE_PLAN_CATALOG.PRO.entitlements.overageCentsPerMinute).toBe(29);
    expect(VOICE_PLAN_CATALOG.BUSINESS.entitlements.overageCentsPerMinute).toBe(25);
  });

  it('exposes entitlements for numbers, branches, concurrency, languages', () => {
    expect(VOICE_PLAN_CATALOG.START.entitlements.localPhoneNumbers).toBe(1);
    expect(VOICE_PLAN_CATALOG.PRO.entitlements.maxBranches).toBe(2);
    expect(VOICE_PLAN_CATALOG.PRO.entitlements.maxConcurrentCalls).toBe(2);
    expect(VOICE_PLAN_CATALOG.BUSINESS.entitlements.localPhoneNumbers).toBe(2);
    expect(VOICE_PLAN_CATALOG.BUSINESS.entitlements.maxBranches).toBeNull();
    expect(VOICE_PLAN_CATALOG.BUSINESS.entitlements.maxConcurrentCalls).toBe(5);
    expect(VOICE_PLAN_CATALOG.START.entitlements.supportedLanguages).toEqual(['de', 'en']);
  });
});

describe('voice-billing-minute.util', () => {
  it('applies 6-second grace then rounds up', () => {
    expect(VOICE_BILLING_GRACE_SECONDS).toBe(6);
    expect(billableMinutesFromSeconds(0)).toBe(0);
    expect(billableMinutesFromSeconds(6)).toBe(0);
    expect(billableMinutesFromSeconds(7)).toBe(1);
    expect(billableMinutesFromSeconds(60)).toBe(1);
    expect(billableMinutesFromSeconds(61)).toBe(2);
  });
});

describe('voice-billing-pricing.util', () => {
  const startPlan = resolveVoicePlan('START');

  it('charges zero while within included minutes', () => {
    const result = computeCustomerPriceForUsage({
      plan: startPlan,
      consumedMinutesInPeriod: 50,
      additionalBillableMinutes: 10,
    });
    expect(result.includedAppliedMinutes).toBe(10);
    expect(result.overageMinutes).toBe(0);
    expect(result.customerPriceCents).toBe(0);
  });

  it('applies overage rate for all tariffs', () => {
    const pro = resolveVoicePlan('PRO');
    const business = resolveVoicePlan('BUSINESS');

    expect(
      computeCustomerPriceForUsage({
        plan: startPlan,
        consumedMinutesInPeriod: 100,
        additionalBillableMinutes: 5,
      }).customerPriceCents,
    ).toBe(multiplyCents(35, 5));

    expect(
      computeCustomerPriceForUsage({
        plan: pro,
        consumedMinutesInPeriod: 400,
        additionalBillableMinutes: 3,
      }).customerPriceCents,
    ).toBe(multiplyCents(29, 3));

    expect(
      computeCustomerPriceForUsage({
        plan: business,
        consumedMinutesInPeriod: 1000,
        additionalBillableMinutes: 2,
      }).customerPriceCents,
    ).toBe(multiplyCents(25, 2));
  });

  it('forecasts monthly revenue with base fee, setup, and overage', () => {
    const forecast = computePeriodRevenueForecast({
      plan: startPlan,
      consumedMinutes: 120,
      setupFeeOutstandingCents: 14900,
    });
    expect(forecast.monthlyBaseFeeCents).toBe(4900);
    expect(forecast.overageMinutes).toBe(20);
    expect(forecast.overageRevenueCents).toBe(700);
    expect(forecast.projectedRevenueCents).toBe(4900 + 700 + 14900);
    expect(forecast.remainingIncludedMinutes).toBe(0);
  });
});

describe('voice-billing-cost.util', () => {
  it('uses conservative fallback when provider costs are missing', () => {
    const costs = computeVoiceUsageCosts({ billableMinutes: 5 });
    expect(costs.usedFallback).toBe(true);
    expect(costs.costStatus).toBe('ESTIMATED');
    expect(costs.internalCostCents).toBe(VOICE_COST_FALLBACK_CENTS_PER_MINUTE * 5);
  });

  it('uses real provider splits when available', () => {
    const costs = computeVoiceUsageCosts({
      billableMinutes: 3,
      providerCosts: {
        twilioCostCents: 20,
        elevenLabsCostCents: 10,
        llmCostCents: 5,
      },
    });
    expect(costs.costStatus).toBe('FINAL');
    expect(costs.twilioCostCents).toBe(20);
    expect(costs.elevenLabsCostCents).toBe(10);
    expect(costs.llmCostCents).toBe(5);
    expect(costs.internalCostCents).toBe(35);
  });

  it('does not overwrite FINAL costs with estimates', () => {
    const merged = mergeProviderCostUpdate({
      existingCostStatus: 'FINAL',
      existingCosts: { twilioCostCents: 10, elevenLabsCostCents: 5, llmCostCents: 2 },
      incomingCosts: { twilioCostCents: 99 },
      billableMinutes: 2,
    });
    expect(merged).toBeNull();
  });
});

describe('voice-billing-rounding.util', () => {
  it('rounds euros to cents reproducibly', () => {
    expect(eurosToCents(0.355)).toBe(36);
    expect(eurosToCents(0.354)).toBe(35);
    expect(marginCents(1000, 350)).toBe(650);
    expect(marginPercent(1000, 350)).toBe(65);
  });
});

describe('VoiceUsageLedgerService integration scenarios', () => {
  const ORG_A = 'org-a';
  const ORG_B = 'org-b';

  function makeLedgerHarness() {
    const usageStore = new Map<string, any>();
    const periodStore = new Map<string, any>();
    let usageSeq = 0;

    const usageEvents = {
      findById: jest.fn(async (orgId: string, id: string) => {
        const row = [...usageStore.values()].find((item) => item.id === id && item.organizationId === orgId);
        return row ?? null;
      }),
      findByIdempotencyKey: jest.fn(async (orgId: string, key: string) => {
        return [...usageStore.values()].find(
          (item) => item.organizationId === orgId && item.idempotencyKey === key,
        ) ?? null;
      }),
      persistOrGet: jest.fn(async (input: any) => {
        const existing = [...usageStore.values()].find(
          (item) => item.organizationId === input.organizationId && item.idempotencyKey === input.idempotencyKey,
        );
        if (existing) {
          return { event: existing, created: false };
        }
        const event = { id: `usage-${++usageSeq}`, ...input, costStatus: input.costStatus ?? 'ESTIMATED', occurredAt: new Date() };
        usageStore.set(event.id, event);
        return { event, created: true };
      }),
      sumBillableMinutesInPeriod: jest.fn(async (orgId: string) => {
        const total = [...usageStore.values()]
          .filter((item) => item.organizationId === orgId)
          .reduce((sum, item) => sum + (item.billableMinutes ?? 0), 0);
        return { _sum: { billableMinutes: total } };
      }),
      sumCustomerPriceInPeriod: jest.fn(async (orgId: string) => {
        const rows = [...usageStore.values()].filter((item) => item.organizationId === orgId);
        return {
          _sum: {
            customerPriceCents: rows.reduce((sum, item) => sum + (item.customerPriceCents ?? 0), 0),
            internalCostCents: rows.reduce((sum, item) => sum + (item.internalCostCents ?? 0), 0),
            providerCostCents: rows.reduce((sum, item) => sum + (item.providerCostCents ?? 0), 0),
          },
        };
      }),
      sumDirectionalMinutesInPeriod: jest.fn(async (orgId: string) => {
        const inbound = [...usageStore.values()]
          .filter((item) => item.organizationId === orgId && item.eventType === 'INBOUND_CALL')
          .reduce((sum, item) => sum + (item.billableMinutes ?? 0), 0);
        const outbound = [...usageStore.values()]
          .filter((item) => item.organizationId === orgId && item.eventType === 'OUTBOUND_CALL')
          .reduce((sum, item) => sum + (item.billableMinutes ?? 0), 0);
        return [
          { eventType: 'INBOUND_CALL', _sum: { billableMinutes: inbound } },
          { eventType: 'OUTBOUND_CALL', _sum: { billableMinutes: outbound } },
        ];
      }),
      updateCostsIfNotFinal: jest.fn(),
      _store: usageStore,
    };

    const billingPeriods = {
      upsertOpenPeriod: jest.fn(async (input: any) => {
        const key = `${input.organizationId}:${input.periodStart.toISOString()}`;
        const existing = periodStore.get(key) ?? { id: `period-${periodStore.size + 1}`, ...input, consumedMinutes: 0 };
        periodStore.set(key, { ...existing, ...input });
        return periodStore.get(key);
      }),
      findOpenForOrganization: jest.fn(async (orgId: string, start: Date) => {
        const key = `${orgId}:${start.toISOString()}`;
        return periodStore.get(key) ?? null;
      }),
      refreshAggregates: jest.fn(async (orgId: string, id: string, aggregates: any) => {
        const row = [...periodStore.values()].find((item) => item.id === id && item.organizationId === orgId);
        if (!row) return null;
        Object.assign(row, aggregates);
        return row;
      }),
      _store: periodStore,
    };

    const subscriptionsByOrg = new Map<string, any>();

    const subscriptions = {
      getActiveSubscription: jest.fn(async (orgId: string) => subscriptionsByOrg.get(orgId) ?? null),
      resolvePlanForSubscription: jest.fn((sub: any) => resolveVoicePlan(sub.planCode, sub.planCatalogVersion)),
    };

    const { VoiceUsageLedgerService } = require('./voice-usage-ledger.service');
    const ledger = new VoiceUsageLedgerService(usageEvents, billingPeriods, subscriptions);

    return { ledger, usageEvents, billingPeriods, subscriptions, subscriptionsByOrg };
  }

  it('deduplicates duplicate conversation usage', async () => {
    const { ledger, subscriptionsByOrg, usageEvents } = makeLedgerHarness();
    subscriptionsByOrg.set(ORG_A, {
      planCode: 'START',
      planCatalogVersion: '2026-07-17',
      setupFeeCents: 14900,
      setupFeePaidAt: null,
    });

    const input = {
      organizationId: ORG_A,
      voiceConversationId: 'conv-1',
      direction: 'INBOUND' as const,
      durationSeconds: 120,
    };

    const first = await ledger.recordConversationUsage(input);
    const second = await ledger.recordConversationUsage(input);

    expect(first?.created).toBe(true);
    expect(second?.created).toBe(false);
    expect(second?.deduplicated).toBe(true);
    expect(usageEvents.persistOrGet).toHaveBeenCalledTimes(2);
    expect(usageEvents._store.size).toBe(1);
  });

  it('scopes usage rows per organization (cross-tenant)', async () => {
    const { ledger, subscriptionsByOrg, usageEvents } = makeLedgerHarness();
    subscriptionsByOrg.set(ORG_A, { planCode: 'START', planCatalogVersion: '2026-07-17', setupFeeCents: 0, setupFeePaidAt: new Date() });
    subscriptionsByOrg.set(ORG_B, { planCode: 'PRO', planCatalogVersion: '2026-07-17', setupFeeCents: 0, setupFeePaidAt: new Date() });

    await ledger.recordConversationUsage({
      organizationId: ORG_A,
      voiceConversationId: 'conv-a',
      direction: 'INBOUND',
      durationSeconds: 120,
    });
    await ledger.recordConversationUsage({
      organizationId: ORG_B,
      voiceConversationId: 'conv-b',
      direction: 'OUTBOUND',
      durationSeconds: 120,
    });

    const orgARows = [...usageEvents._store.values()].filter((row) => row.organizationId === ORG_A);
    const orgBRows = [...usageEvents._store.values()].filter((row) => row.organizationId === ORG_B);
    expect(orgARows).toHaveLength(1);
    expect(orgBRows).toHaveLength(1);
    expect(orgARows[0].eventType).toBe('INBOUND_CALL');
    expect(orgBRows[0].eventType).toBe('OUTBOUND_CALL');
  });
});

describe('VoiceSubscriptionService plan change', () => {
  it('stores pending plan for next period', async () => {
    const { VoiceSubscriptionService } = require('./voice-subscription.service');
    const periodEnd = new Date('2026-08-01T00:00:00.000Z');
    const repo = {
      findById: jest.fn().mockResolvedValue({
        id: 'sub-1',
        status: 'ACTIVE',
        currentPeriodEnd: periodEnd,
        planCode: 'START',
        planCatalogVersion: '2026-07-17',
      }),
      update: jest.fn().mockResolvedValue({}),
    };
    const service = new VoiceSubscriptionService(repo);
    await service.changePlan({
      organizationId: ORG_A,
      subscriptionId: 'sub-1',
      newPlanCode: 'PRO',
      timing: 'NEXT_PERIOD',
    });
    expect(repo.update).toHaveBeenCalledWith(
      ORG_A,
      'sub-1',
      expect.objectContaining({
        pendingPlanCode: 'PRO',
        pendingPlanEffectiveAt: periodEnd,
      }),
    );
  });
});

const ORG_A = 'org-a';
