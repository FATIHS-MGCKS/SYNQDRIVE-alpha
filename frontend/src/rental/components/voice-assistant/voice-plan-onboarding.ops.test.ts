import { describe, expect, it } from 'vitest';
import type { VoicePlanCatalogEntry } from '../../../lib/api';
import {
  buildPlanComparisonRows,
  isPlanChangeSelection,
  RECOMMENDED_VOICE_PLAN,
  formatBranchLimit,
} from './voice-plan-onboarding.ops';

const mockPlan = (code: 'START' | 'PRO' | 'BUSINESS', overrides?: Partial<VoicePlanCatalogEntry>): VoicePlanCatalogEntry => ({
  code,
  catalogVersion: '2026-07-17',
  currency: 'EUR',
  monthlyFeeCents: code === 'START' ? 4900 : code === 'PRO' ? 11900 : 24900,
  monthlyFeeEuros: code === 'START' ? 49 : code === 'PRO' ? 119 : 249,
  setupFeeCents: code === 'START' ? 14900 : code === 'PRO' ? 24900 : 49900,
  setupFeeEuros: code === 'START' ? 149 : code === 'PRO' ? 249 : 499,
  entitlements: {
    includedMinutesPerMonth: code === 'START' ? 100 : code === 'PRO' ? 400 : 1000,
    overageCentsPerMinute: code === 'START' ? 35 : code === 'PRO' ? 29 : 25,
    localPhoneNumbers: code === 'START' ? 1 : code === 'BUSINESS' ? 2 : 1,
    maxBranches: code === 'START' ? 1 : code === 'PRO' ? 2 : null,
    maxConcurrentCalls: code === 'START' ? 1 : code === 'PRO' ? 2 : 5,
    supportedLanguages: ['de', 'en'],
  },
  ...overrides,
});

describe('voice-plan-onboarding.ops', () => {
  const plans = [mockPlan('START'), mockPlan('PRO'), mockPlan('BUSINESS')];

  it('marks PRO as recommended constant', () => {
    expect(RECOMMENDED_VOICE_PLAN).toBe('PRO');
  });

  it('builds comparison rows from catalog entries without magic numbers', () => {
    const rows = buildPlanComparisonRows(
      plans,
      {
        unlimited: 'Unlimited',
        includedMinutes: 'Minutes',
        overage: 'Overage',
        numbers: 'Numbers',
        locations: 'Locations',
        parallel: 'Parallel',
        setupFee: 'Setup',
        languages: 'Languages',
      },
      'de-DE',
    );

    const minutesRow = rows.find(r => r.key === 'includedMinutes');
    expect(minutesRow?.values.START).toBe('100');
    expect(minutesRow?.values.PRO).toBe('400');
    expect(minutesRow?.values.BUSINESS).toBe('1000');
  });

  it('formats unlimited branches for BUSINESS', () => {
    expect(formatBranchLimit(mockPlan('BUSINESS'), 'Unlimited')).toBe('Unlimited');
    expect(formatBranchLimit(mockPlan('PRO'), 'Unlimited')).toBe('2');
  });

  it('detects plan change selection', () => {
    expect(isPlanChangeSelection('START', 'PRO')).toBe(true);
    expect(isPlanChangeSelection('PRO', 'PRO')).toBe(false);
    expect(isPlanChangeSelection(null, 'START')).toBe(false);
  });
});
