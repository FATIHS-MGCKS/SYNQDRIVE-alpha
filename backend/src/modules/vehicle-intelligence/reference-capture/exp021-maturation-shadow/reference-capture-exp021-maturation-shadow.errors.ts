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
