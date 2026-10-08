/**
 * Internal-only gate for epoch lifecycle mutations (prepare/activate/pause/close).
 * Environment flag alone does NOT authorize activation.
 */
const OPS_AUTH_ENV = 'APD_SHADOW_EPOCH_INTERNAL_OPS_AUTHORIZED';

let testBypassEnabled = false;

export function enableApdShadowEpochOpsAuthorityForTests(): void {
  testBypassEnabled = true;
}

export function disableApdShadowEpochOpsAuthorityForTests(): void {
  testBypassEnabled = false;
}

export function assertApdShadowEpochInternalOpsAuthorized(caller: string): void {
  if (testBypassEnabled) return;
  const raw = process.env[OPS_AUTH_ENV];
  if (raw == null || raw.trim() === '') {
    throw new Error(
      `APD shadow epoch ${caller} rejected: internal ops authority not configured (${OPS_AUTH_ENV})`,
    );
  }
  const v = raw.trim().toLowerCase();
  if (v !== 'true' && v !== '1' && v !== 'yes') {
    throw new Error(
      `APD shadow epoch ${caller} rejected: internal ops authority disabled`,
    );
  }
}
