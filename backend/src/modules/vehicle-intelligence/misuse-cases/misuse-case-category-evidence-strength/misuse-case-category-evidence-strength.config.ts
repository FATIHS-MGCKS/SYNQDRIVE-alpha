import {
  MisuseAttributionScope,
  MisuseCaseDecisionEligibility,
  MisuseCaseStatus,
  MisuseCaseType,
  MisuseEvidenceSourceType,
} from '@prisma/client';

/** Category evidence strength contract version — bump when profiles change (P51). */
export const MISUSE_CATEGORY_EVIDENCE_STRENGTH_VERSION = 'misuse-category-evidence-v1';

/**
 * Prompt-51 category keys mapped to canonical MisuseCaseType values.
 */
export const MISUSE_CATEGORY_EVIDENCE_KEYS = {
  AGGRESSIVE_DRIVING_PATTERN: MisuseCaseType.AGGRESSIVE_DRIVING_PATTERN,
  COLD_ENGINE_ABUSE: MisuseCaseType.COLD_ENGINE_ABUSE,
  LAUNCH_LIKE_USE: MisuseCaseType.LAUNCH_ABUSE_PATTERN,
  BRAKE_ABUSE: MisuseCaseType.BRAKE_ABUSE_PATTERN,
  REV_IN_IDLE: MisuseCaseType.REPEATED_ENGINE_REV_IN_IDLE,
  POSSIBLE_IMPACT: MisuseCaseType.POSSIBLE_COLLISION_OR_IMPACT,
  COLLISION: MisuseCaseType.DIMO_COLLISION_REPORTED,
  OVERHEATING: MisuseCaseType.OVERHEATING_DAMAGE_RISK,
  DTC_AFTER_ABUSE: MisuseCaseType.DTC_AFTER_ABUSE_OR_IMPACT,
} as const;

export type MisuseCategoryEvidenceKey = keyof typeof MISUSE_CATEGORY_EVIDENCE_KEYS;

export type CoverageRequirement = 'NONE' | 'SPARSE' | 'GOOD';

export type AttributionRequirement = 'LOW' | 'MEDIUM' | 'HIGH';

export type HealthEligibility = 'NONE' | 'INFORMATIONAL' | 'LIMITED' | 'FULL';

export type CustomerEligibility =
  | 'NONE'
  | 'INFORMATIONAL_ONLY'
  | 'REVIEW_ONLY'
  | 'MANUAL_CONFIRMATION_ONLY'
  | 'OPERATIONAL';

export type MisuseCategoryEffectCaps = {
  maxStatus: MisuseCaseStatus;
  maxDecisionEligibility: MisuseCaseDecisionEligibility;
  healthEligibility: HealthEligibility;
  customerEligibility: CustomerEligibility;
};

export type MisuseCategoryNormalization = {
  /** Proxy-only qualified evidence cannot satisfy the profile alone. */
  proxyOnlyInsufficient: boolean;
  /** Source types that always run in shadow maturity until published. */
  shadowSourceTypes: MisuseEvidenceSourceType[];
  /** Reject when coverage/data quality indicates a telemetry integrity issue. */
  rejectOnDataQualityIssue: boolean;
};

export type MisuseCategoryEvidenceProfile = {
  key: MisuseCategoryEvidenceKey;
  caseType: MisuseCaseType;
  allowedSourceTypes: readonly MisuseEvidenceSourceType[];
  minCoverage: CoverageRequirement;
  minAttribution: AttributionRequirement;
  minAttributionScopes: readonly MisuseAttributionScope[];
  minRepetition: number;
  normalization: MisuseCategoryNormalization;
  shadowEffect: MisuseCategoryEffectCaps;
  publishedEffect: MisuseCategoryEffectCaps;
};

const BEHAVIOR_NATIVE: MisuseEvidenceSourceType[] = [
  MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
  MisuseEvidenceSourceType.DRIVING_EVENT,
];

const BEHAVIOR_CONTEXT: MisuseEvidenceSourceType[] = [
  ...BEHAVIOR_NATIVE,
  MisuseEvidenceSourceType.EVENT_CONTEXT_ASSESSMENT,
];

const SHADOW_CONTEXT_ONLY: MisuseEvidenceSourceType[] = [
  MisuseEvidenceSourceType.EVENT_CONTEXT_ASSESSMENT,
  MisuseEvidenceSourceType.DERIVED_PATTERN,
];

const REVIEW_SHADOW: MisuseCategoryEffectCaps = {
  maxStatus: MisuseCaseStatus.REVIEW_REQUIRED,
  maxDecisionEligibility: MisuseCaseDecisionEligibility.REVIEW_ONLY,
  healthEligibility: 'INFORMATIONAL',
  customerEligibility: 'REVIEW_ONLY',
};

const CANDIDATE_SHADOW: MisuseCategoryEffectCaps = {
  maxStatus: MisuseCaseStatus.CANDIDATE,
  maxDecisionEligibility: MisuseCaseDecisionEligibility.INFORMATIONAL_ONLY,
  healthEligibility: 'INFORMATIONAL',
  customerEligibility: 'INFORMATIONAL_ONLY',
};

export const MISUSE_CATEGORY_EVIDENCE_PROFILES: Record<
  MisuseCategoryEvidenceKey,
  MisuseCategoryEvidenceProfile
> = {
  AGGRESSIVE_DRIVING_PATTERN: {
    key: 'AGGRESSIVE_DRIVING_PATTERN',
    caseType: MisuseCaseType.AGGRESSIVE_DRIVING_PATTERN,
    allowedSourceTypes: [
      ...BEHAVIOR_CONTEXT,
      MisuseEvidenceSourceType.DERIVED_PATTERN,
      MisuseEvidenceSourceType.MANUAL_VERIFICATION,
    ],
    minCoverage: 'SPARSE',
    minAttribution: 'LOW',
    minAttributionScopes: [
      MisuseAttributionScope.BOOKING_CUSTOMER,
      MisuseAttributionScope.ASSIGNED_DRIVER,
      MisuseAttributionScope.VEHICLE_ONLY,
      MisuseAttributionScope.UNKNOWN,
      MisuseAttributionScope.PRIVATE_UNASSIGNED,
    ],
    minRepetition: 2,
    normalization: {
      proxyOnlyInsufficient: true,
      shadowSourceTypes: SHADOW_CONTEXT_ONLY,
      rejectOnDataQualityIssue: true,
    },
    shadowEffect: REVIEW_SHADOW,
    publishedEffect: {
      maxStatus: MisuseCaseStatus.ACTIVE,
      maxDecisionEligibility: MisuseCaseDecisionEligibility.MANUAL_CONFIRMATION_ONLY,
      healthEligibility: 'INFORMATIONAL',
      customerEligibility: 'MANUAL_CONFIRMATION_ONLY',
    },
  },
  COLD_ENGINE_ABUSE: {
    key: 'COLD_ENGINE_ABUSE',
    caseType: MisuseCaseType.COLD_ENGINE_ABUSE,
    allowedSourceTypes: [
      MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
      MisuseEvidenceSourceType.EVENT_CONTEXT_ASSESSMENT,
      MisuseEvidenceSourceType.MANUAL_VERIFICATION,
    ],
    minCoverage: 'GOOD',
    minAttribution: 'MEDIUM',
    minAttributionScopes: [
      MisuseAttributionScope.BOOKING_CUSTOMER,
      MisuseAttributionScope.ASSIGNED_DRIVER,
      MisuseAttributionScope.VEHICLE_ONLY,
    ],
    minRepetition: 2,
    normalization: {
      proxyOnlyInsufficient: true,
      shadowSourceTypes: [MisuseEvidenceSourceType.EVENT_CONTEXT_ASSESSMENT],
      rejectOnDataQualityIssue: true,
    },
    shadowEffect: REVIEW_SHADOW,
    publishedEffect: {
      maxStatus: MisuseCaseStatus.REVIEW_REQUIRED,
      maxDecisionEligibility: MisuseCaseDecisionEligibility.MANUAL_CONFIRMATION_ONLY,
      healthEligibility: 'LIMITED',
      customerEligibility: 'MANUAL_CONFIRMATION_ONLY',
    },
  },
  LAUNCH_LIKE_USE: {
    key: 'LAUNCH_LIKE_USE',
    caseType: MisuseCaseType.LAUNCH_ABUSE_PATTERN,
    allowedSourceTypes: [
      ...BEHAVIOR_CONTEXT,
      MisuseEvidenceSourceType.DERIVED_PATTERN,
      MisuseEvidenceSourceType.MANUAL_VERIFICATION,
    ],
    minCoverage: 'SPARSE',
    minAttribution: 'MEDIUM',
    minAttributionScopes: [
      MisuseAttributionScope.BOOKING_CUSTOMER,
      MisuseAttributionScope.ASSIGNED_DRIVER,
      MisuseAttributionScope.VEHICLE_ONLY,
    ],
    minRepetition: 2,
    normalization: {
      proxyOnlyInsufficient: true,
      shadowSourceTypes: SHADOW_CONTEXT_ONLY,
      rejectOnDataQualityIssue: true,
    },
    shadowEffect: CANDIDATE_SHADOW,
    publishedEffect: {
      maxStatus: MisuseCaseStatus.REVIEW_REQUIRED,
      maxDecisionEligibility: MisuseCaseDecisionEligibility.MANUAL_CONFIRMATION_ONLY,
      healthEligibility: 'INFORMATIONAL',
      customerEligibility: 'MANUAL_CONFIRMATION_ONLY',
    },
  },
  BRAKE_ABUSE: {
    key: 'BRAKE_ABUSE',
    caseType: MisuseCaseType.BRAKE_ABUSE_PATTERN,
    allowedSourceTypes: [
      ...BEHAVIOR_CONTEXT,
      MisuseEvidenceSourceType.DERIVED_PATTERN,
      MisuseEvidenceSourceType.MANUAL_VERIFICATION,
    ],
    minCoverage: 'SPARSE',
    minAttribution: 'LOW',
    minAttributionScopes: [
      MisuseAttributionScope.BOOKING_CUSTOMER,
      MisuseAttributionScope.ASSIGNED_DRIVER,
      MisuseAttributionScope.VEHICLE_ONLY,
      MisuseAttributionScope.UNKNOWN,
    ],
    minRepetition: 2,
    normalization: {
      proxyOnlyInsufficient: true,
      shadowSourceTypes: [MisuseEvidenceSourceType.DERIVED_PATTERN],
      rejectOnDataQualityIssue: true,
    },
    shadowEffect: REVIEW_SHADOW,
    publishedEffect: {
      maxStatus: MisuseCaseStatus.ACTIVE,
      maxDecisionEligibility: MisuseCaseDecisionEligibility.MANUAL_CONFIRMATION_ONLY,
      healthEligibility: 'LIMITED',
      customerEligibility: 'MANUAL_CONFIRMATION_ONLY',
    },
  },
  REV_IN_IDLE: {
    key: 'REV_IN_IDLE',
    caseType: MisuseCaseType.REPEATED_ENGINE_REV_IN_IDLE,
    allowedSourceTypes: [
      MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
      MisuseEvidenceSourceType.EVENT_CONTEXT_ASSESSMENT,
      MisuseEvidenceSourceType.MANUAL_VERIFICATION,
    ],
    minCoverage: 'GOOD',
    minAttribution: 'MEDIUM',
    minAttributionScopes: [
      MisuseAttributionScope.BOOKING_CUSTOMER,
      MisuseAttributionScope.ASSIGNED_DRIVER,
      MisuseAttributionScope.VEHICLE_ONLY,
    ],
    minRepetition: 3,
    normalization: {
      proxyOnlyInsufficient: true,
      shadowSourceTypes: [MisuseEvidenceSourceType.EVENT_CONTEXT_ASSESSMENT],
      rejectOnDataQualityIssue: true,
    },
    shadowEffect: REVIEW_SHADOW,
    publishedEffect: {
      maxStatus: MisuseCaseStatus.REVIEW_REQUIRED,
      maxDecisionEligibility: MisuseCaseDecisionEligibility.MANUAL_CONFIRMATION_ONLY,
      healthEligibility: 'INFORMATIONAL',
      customerEligibility: 'MANUAL_CONFIRMATION_ONLY',
    },
  },
  POSSIBLE_IMPACT: {
    key: 'POSSIBLE_IMPACT',
    caseType: MisuseCaseType.POSSIBLE_COLLISION_OR_IMPACT,
    allowedSourceTypes: [
      MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
      MisuseEvidenceSourceType.DRIVING_EVENT,
      MisuseEvidenceSourceType.DERIVED_PATTERN,
      MisuseEvidenceSourceType.MANUAL_VERIFICATION,
    ],
    minCoverage: 'SPARSE',
    minAttribution: 'MEDIUM',
    minAttributionScopes: [
      MisuseAttributionScope.BOOKING_CUSTOMER,
      MisuseAttributionScope.ASSIGNED_DRIVER,
      MisuseAttributionScope.VEHICLE_ONLY,
    ],
    minRepetition: 1,
    normalization: {
      proxyOnlyInsufficient: true,
      shadowSourceTypes: [MisuseEvidenceSourceType.DERIVED_PATTERN],
      rejectOnDataQualityIssue: true,
    },
    shadowEffect: CANDIDATE_SHADOW,
    publishedEffect: {
      maxStatus: MisuseCaseStatus.REVIEW_REQUIRED,
      maxDecisionEligibility: MisuseCaseDecisionEligibility.MANUAL_CONFIRMATION_ONLY,
      healthEligibility: 'LIMITED',
      customerEligibility: 'MANUAL_CONFIRMATION_ONLY',
    },
  },
  COLLISION: {
    key: 'COLLISION',
    caseType: MisuseCaseType.DIMO_COLLISION_REPORTED,
    allowedSourceTypes: [
      MisuseEvidenceSourceType.DIMO_EVENT,
      MisuseEvidenceSourceType.DRIVING_EVENT,
      MisuseEvidenceSourceType.MANUAL_VERIFICATION,
    ],
    minCoverage: 'GOOD',
    minAttribution: 'MEDIUM',
    minAttributionScopes: [
      MisuseAttributionScope.BOOKING_CUSTOMER,
      MisuseAttributionScope.ASSIGNED_DRIVER,
      MisuseAttributionScope.VEHICLE_ONLY,
    ],
    minRepetition: 1,
    normalization: {
      proxyOnlyInsufficient: true,
      shadowSourceTypes: [],
      rejectOnDataQualityIssue: true,
    },
    shadowEffect: REVIEW_SHADOW,
    publishedEffect: {
      maxStatus: MisuseCaseStatus.REVIEW_REQUIRED,
      maxDecisionEligibility: MisuseCaseDecisionEligibility.MANUAL_CONFIRMATION_ONLY,
      healthEligibility: 'FULL',
      customerEligibility: 'MANUAL_CONFIRMATION_ONLY',
    },
  },
  OVERHEATING: {
    key: 'OVERHEATING',
    caseType: MisuseCaseType.OVERHEATING_DAMAGE_RISK,
    allowedSourceTypes: [
      MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
      MisuseEvidenceSourceType.EVENT_CONTEXT_ASSESSMENT,
      MisuseEvidenceSourceType.DTC,
      MisuseEvidenceSourceType.MANUAL_VERIFICATION,
    ],
    minCoverage: 'GOOD',
    minAttribution: 'LOW',
    minAttributionScopes: [
      MisuseAttributionScope.BOOKING_CUSTOMER,
      MisuseAttributionScope.ASSIGNED_DRIVER,
      MisuseAttributionScope.VEHICLE_ONLY,
      MisuseAttributionScope.UNKNOWN,
    ],
    minRepetition: 1,
    normalization: {
      proxyOnlyInsufficient: true,
      shadowSourceTypes: [MisuseEvidenceSourceType.EVENT_CONTEXT_ASSESSMENT],
      rejectOnDataQualityIssue: true,
    },
    shadowEffect: REVIEW_SHADOW,
    publishedEffect: {
      maxStatus: MisuseCaseStatus.REVIEW_REQUIRED,
      maxDecisionEligibility: MisuseCaseDecisionEligibility.MANUAL_CONFIRMATION_ONLY,
      healthEligibility: 'FULL',
      customerEligibility: 'MANUAL_CONFIRMATION_ONLY',
    },
  },
  DTC_AFTER_ABUSE: {
    key: 'DTC_AFTER_ABUSE',
    caseType: MisuseCaseType.DTC_AFTER_ABUSE_OR_IMPACT,
    allowedSourceTypes: [
      MisuseEvidenceSourceType.DTC,
      MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
      MisuseEvidenceSourceType.DRIVING_EVENT,
      MisuseEvidenceSourceType.DIMO_EVENT,
      MisuseEvidenceSourceType.MANUAL_VERIFICATION,
    ],
    minCoverage: 'SPARSE',
    minAttribution: 'MEDIUM',
    minAttributionScopes: [
      MisuseAttributionScope.BOOKING_CUSTOMER,
      MisuseAttributionScope.ASSIGNED_DRIVER,
      MisuseAttributionScope.VEHICLE_ONLY,
    ],
    minRepetition: 1,
    normalization: {
      proxyOnlyInsufficient: false,
      shadowSourceTypes: [],
      rejectOnDataQualityIssue: true,
    },
    shadowEffect: REVIEW_SHADOW,
    publishedEffect: {
      maxStatus: MisuseCaseStatus.REVIEW_REQUIRED,
      maxDecisionEligibility: MisuseCaseDecisionEligibility.MANUAL_CONFIRMATION_ONLY,
      healthEligibility: 'LIMITED',
      customerEligibility: 'MANUAL_CONFIRMATION_ONLY',
    },
  },
};

export const PROFILED_MISUSE_CASE_TYPES = new Set<MisuseCaseType>(
  Object.values(MISUSE_CATEGORY_EVIDENCE_PROFILES).map((p) => p.caseType),
);
