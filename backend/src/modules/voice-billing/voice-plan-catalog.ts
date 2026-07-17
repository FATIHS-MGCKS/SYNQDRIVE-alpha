/**
 * Versioned Voice AI plan catalog — single source of truth for tariffs and entitlements.
 * Currency: EUR (net). Do not scatter magic numbers outside this module.
 */
export const VOICE_PLAN_CATALOG_VERSION = '2026-07-17' as const;
export const VOICE_BILLING_CURRENCY = 'EUR' as const;

export const VOICE_PLAN_CODES = ['START', 'PRO', 'BUSINESS'] as const;
export type VoicePlanCode = (typeof VOICE_PLAN_CODES)[number];

export type VoicePlanEntitlements = {
  includedMinutesPerMonth: number;
  overageCentsPerMinute: number;
  localPhoneNumbers: number;
  /** null = unlimited branches */
  maxBranches: number | null;
  maxConcurrentCalls: number;
  supportedLanguages: readonly string[];
};

export type VoicePlanDefinition = {
  code: VoicePlanCode;
  catalogVersion: typeof VOICE_PLAN_CATALOG_VERSION;
  currency: typeof VOICE_BILLING_CURRENCY;
  monthlyFeeCents: number;
  setupFeeCents: number;
  entitlements: VoicePlanEntitlements;
};

const STANDARD_LANGUAGES = ['de', 'en'] as const;

export const VOICE_PLAN_CATALOG: Record<VoicePlanCode, VoicePlanDefinition> = {
  START: {
    code: 'START',
    catalogVersion: VOICE_PLAN_CATALOG_VERSION,
    currency: VOICE_BILLING_CURRENCY,
    monthlyFeeCents: 4900,
    setupFeeCents: 14900,
    entitlements: {
      includedMinutesPerMonth: 100,
      overageCentsPerMinute: 35,
      localPhoneNumbers: 1,
      maxBranches: 1,
      maxConcurrentCalls: 1,
      supportedLanguages: STANDARD_LANGUAGES,
    },
  },
  PRO: {
    code: 'PRO',
    catalogVersion: VOICE_PLAN_CATALOG_VERSION,
    currency: VOICE_BILLING_CURRENCY,
    monthlyFeeCents: 11900,
    setupFeeCents: 24900,
    entitlements: {
      includedMinutesPerMonth: 400,
      overageCentsPerMinute: 29,
      localPhoneNumbers: 1,
      maxBranches: 2,
      maxConcurrentCalls: 2,
      supportedLanguages: STANDARD_LANGUAGES,
    },
  },
  BUSINESS: {
    code: 'BUSINESS',
    catalogVersion: VOICE_PLAN_CATALOG_VERSION,
    currency: VOICE_BILLING_CURRENCY,
    monthlyFeeCents: 24900,
    setupFeeCents: 49900,
    entitlements: {
      includedMinutesPerMonth: 1000,
      overageCentsPerMinute: 25,
      localPhoneNumbers: 2,
      maxBranches: null,
      maxConcurrentCalls: 5,
      supportedLanguages: STANDARD_LANGUAGES,
    },
  },
};

/** Conservative blended provider cost fallback (planning / estimated rows). */
export const VOICE_COST_FALLBACK_CENTS_PER_MINUTE = 12;

/** Default monthly number rental estimate when no provider invoice is available (cents). */
export const VOICE_COST_FALLBACK_NUMBER_RENTAL_CENTS = 150;

export function isVoicePlanCode(value: string): value is VoicePlanCode {
  return (VOICE_PLAN_CODES as readonly string[]).includes(value);
}

export function resolveVoicePlan(
  planCode: string,
  catalogVersion: string = VOICE_PLAN_CATALOG_VERSION,
): VoicePlanDefinition {
  if (!isVoicePlanCode(planCode)) {
    throw new Error(`Unknown voice plan code: ${planCode}`);
  }
  const plan = VOICE_PLAN_CATALOG[planCode];
  if (plan.catalogVersion !== catalogVersion) {
    throw new Error(
      `Voice plan catalog version mismatch for ${planCode}: expected ${plan.catalogVersion}, got ${catalogVersion}`,
    );
  }
  return plan;
}

export function listVoicePlans(): VoicePlanDefinition[] {
  return VOICE_PLAN_CODES.map((code) => VOICE_PLAN_CATALOG[code]);
}
