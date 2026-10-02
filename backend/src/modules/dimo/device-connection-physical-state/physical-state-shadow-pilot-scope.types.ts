export type PhysicalAuthorityScopeIdentity = {
  organizationId: string;
  vehicleId: string;
  provider: string;
};

export type ShadowPilotScopeConfigEntry = PhysicalAuthorityScopeIdentity;

export type ShadowPilotScopeConfigParseResult =
  | {
      ok: true;
      scopes: readonly ShadowPilotScopeConfigEntry[];
      configInvalid: false;
    }
  | {
      ok: false;
      scopes: readonly ShadowPilotScopeConfigEntry[];
      configInvalid: true;
      reason: 'MALFORMED_JSON' | 'INVALID_ENTRY' | 'EMPTY_IDENTIFIERS';
    };

export type ShadowPilotScopeGateReason =
  | 'ALLOWED'
  | 'DENIED_NOT_CONFIGURED'
  | 'DENIED_SCOPE_NOT_ALLOWLISTED'
  | 'DENIED_INVALID_CONFIG'
  | 'DENIED_UNSAFE_SIDE_EFFECTS_FLAG'
  | 'DENIED_UNSAFE_AUTHORITY_CUTOVER_FLAG'
  | 'BYPASSED_PHYSICAL_AUTHORITY';

export type ShadowPilotScopeGateDecision = {
  allowed: boolean;
  reason: ShadowPilotScopeGateReason;
};
