import { isErdRechargeShadowParityEnabled } from './erd-recharge-shadow-parity.config';
import { ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV } from './erd-recharge-shadow-parity.constants';

export type ErdRechargeShadowRuntimeAuthorizationMode =
  | 'GLOBAL'
  | 'SCOPED_CANARY'
  | 'DISABLED'
  | 'INVALID_SCOPED_CONFIG';

export type ErdRechargeShadowRuntimeAuthorization = {
  authorized: boolean;
  mode: ErdRechargeShadowRuntimeAuthorizationMode;
  scopedEntryCount: number;
};

export type ErdRechargeShadowCanaryAllowlistParseResult = {
  valid: boolean;
  pairs: ReadonlySet<string>;
};

function parseAllowlistToken(
  token: string,
): { organizationId: string; vehicleId: string } | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.includes('*')) {
    return null;
  }
  const firstColon = trimmed.indexOf(':');
  if (firstColon === -1) {
    return null;
  }
  if (trimmed.indexOf(':', firstColon + 1) !== -1) {
    return null;
  }
  const organizationId = trimmed.slice(0, firstColon).trim();
  const vehicleId = trimmed.slice(firstColon + 1).trim();
  if (!organizationId || !vehicleId) {
    return null;
  }
  return { organizationId, vehicleId };
}

/** Pure parser — malformed ANY token invalidates the entire scoped config. */
export function parseErdRechargeShadowCanaryAllowlist(
  raw: string | undefined,
): ErdRechargeShadowCanaryAllowlistParseResult {
  const trimmed = raw?.trim() ?? '';
  if (trimmed === '') {
    return { valid: true, pairs: new Set() };
  }

  const pairs = new Set<string>();
  for (const token of trimmed.split(',')) {
    const parsed = parseAllowlistToken(token);
    if (!parsed) {
      return { valid: false, pairs: new Set() };
    }
    pairs.add(`${parsed.organizationId}:${parsed.vehicleId}`);
  }
  return { valid: true, pairs };
}

export function resolveErdRechargeShadowRuntimeAuthorization(input: {
  organizationId: string;
  vehicleId: string;
  env?: NodeJS.ProcessEnv;
}): ErdRechargeShadowRuntimeAuthorization {
  const env = input.env ?? process.env;
  const allowlistRaw = env[ERD_RECHARGE_SHADOW_PARITY_CANARY_ALLOWLIST_ENV];
  const parsed = parseErdRechargeShadowCanaryAllowlist(allowlistRaw);

  if (isErdRechargeShadowParityEnabled(env)) {
    return {
      authorized: true,
      mode: 'GLOBAL',
      scopedEntryCount: parsed.valid ? parsed.pairs.size : 0,
    };
  }

  if (!parsed.valid) {
    return {
      authorized: false,
      mode: 'INVALID_SCOPED_CONFIG',
      scopedEntryCount: 0,
    };
  }

  if (parsed.pairs.size === 0) {
    return {
      authorized: false,
      mode: 'DISABLED',
      scopedEntryCount: 0,
    };
  }

  const lookupKey = `${input.organizationId}:${input.vehicleId}`;
  if (parsed.pairs.has(lookupKey)) {
    return {
      authorized: true,
      mode: 'SCOPED_CANARY',
      scopedEntryCount: parsed.pairs.size,
    };
  }

  return {
    authorized: false,
    mode: 'DISABLED',
    scopedEntryCount: parsed.pairs.size,
  };
}
