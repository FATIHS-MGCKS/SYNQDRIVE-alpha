import { isDtc01aSafetyFoundationEnabled } from './dtc-01a.config';

export const DTC_02_WEBHOOK_CAPABILITY_ENABLED_ENV = 'DTC_02_WEBHOOK_CAPABILITY_ENABLED';
export const DTC_02_WEBHOOK_CAPABILITY_VEHICLE_ALLOWLIST_ENV =
  'DTC_02_WEBHOOK_CAPABILITY_VEHICLE_ALLOWLIST';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isDtc02WebhookCapabilityEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[DTC_02_WEBHOOK_CAPABILITY_ENABLED_ENV]?.trim().toLowerCase() === 'true';
}

export function parseDtc02WebhookCapabilityVehicleAllowlist(
  raw: string | undefined,
): { ok: true; allowlist: ReadonlySet<string> } | { ok: false; reason: string } {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return { ok: false, reason: 'ALLOWLIST_EMPTY' };
  }
  const ids = trimmed
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) {
    return { ok: false, reason: 'ALLOWLIST_EMPTY' };
  }
  const allowlist = new Set<string>();
  for (const id of ids) {
    if (!UUID_RE.test(id)) {
      return { ok: false, reason: `ALLOWLIST_INVALID_VEHICLE_ID:${id}` };
    }
    allowlist.add(id.toLowerCase());
  }
  return { ok: true, allowlist };
}

/**
 * DTC-02 P2 webhook capability — default OFF, requires DTC-01A and per-vehicle allowlist.
 * Does not enable behavior without explicit env + vehicle id (no global open mode).
 */
export function shouldUseDtc02WebhookCapabilityForVehicle(
  vehicleId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isDtc02WebhookCapabilityEnabled(env)) return false;
  if (!isDtc01aSafetyFoundationEnabled(env)) return false;
  const parsed = parseDtc02WebhookCapabilityVehicleAllowlist(
    env[DTC_02_WEBHOOK_CAPABILITY_VEHICLE_ALLOWLIST_ENV],
  );
  if (!parsed.ok) return false;
  return parsed.allowlist.has(vehicleId.trim().toLowerCase());
}

export function logDtc02WebhookCapabilityConfigOnBoot(logger: {
  error: (msg: string) => void;
  log?: (msg: string) => void;
}): void {
  if (!isDtc02WebhookCapabilityEnabled()) return;
  if (!isDtc01aSafetyFoundationEnabled()) {
    logger.error(
      'DTC-02 webhook capability enabled but DTC_01A_SAFETY_FOUNDATION_ENABLED is not true — P2 ingress inactive',
    );
    return;
  }
  const parsed = parseDtc02WebhookCapabilityVehicleAllowlist(
    process.env[DTC_02_WEBHOOK_CAPABILITY_VEHICLE_ALLOWLIST_ENV],
  );
  if (!parsed.ok) {
    logger.error(
      `DTC-02 webhook capability INVALID (${parsed.reason}): P2 ingress inactive until allowlist fixed`,
    );
    return;
  }
  logger.log?.(
    `DTC-02 webhook capability armed for ${parsed.allowlist.size} allowlisted vehicle(s) (default OFF elsewhere)`,
  );
}
