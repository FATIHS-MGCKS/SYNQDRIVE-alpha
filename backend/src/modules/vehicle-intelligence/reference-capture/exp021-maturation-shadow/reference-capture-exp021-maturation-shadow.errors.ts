export class Exp021MaturationShadowFamilyIdentityError extends Error {
  readonly code = 'EXP021_MATURATION_SHADOW_FAMILY_IDENTITY';

  constructor(message: string) {
    super(message);
    this.name = 'Exp021MaturationShadowFamilyIdentityError';
  }
}

export class Exp021MaturationShadowStratumSemanticMismatchError extends Error {
  readonly code = 'EXP021_MATURATION_SHADOW_STRATUM_SEMANTIC_MISMATCH';

  constructor(message: string) {
    super(message);
    this.name = 'Exp021MaturationShadowStratumSemanticMismatchError';
  }
}

export class Exp021MaturationShadowAttemptImmutabilityError extends Error {
  readonly code = 'EXP021_MATURATION_SHADOW_ATTEMPT_IMMUTABILITY';

  constructor(message: string) {
    super(message);
    this.name = 'Exp021MaturationShadowAttemptImmutabilityError';
  }
}

export class Exp021MaturationShadowOffScheduleSlotError extends Error {
  readonly code = 'EXP021_MATURATION_SHADOW_OFF_SCHEDULE_SLOT';

  constructor(message: string) {
    super(message);
    this.name = 'Exp021MaturationShadowOffScheduleSlotError';
  }
}

export class Exp021MaturationShadowAttemptAuthorityError extends Error {
  readonly code = 'EXP021_MATURATION_SHADOW_ATTEMPT_AUTHORITY';

  constructor(message: string) {
    super(message);
    this.name = 'Exp021MaturationShadowAttemptAuthorityError';
  }
}

export class Exp021MaturationShadowProviderOutcomeConsistencyError extends Error {
  readonly code = 'EXP021_MATURATION_SHADOW_PROVIDER_OUTCOME_CONSISTENCY';

  constructor(message: string) {
    super(message);
    this.name = 'Exp021MaturationShadowProviderOutcomeConsistencyError';
  }
}
