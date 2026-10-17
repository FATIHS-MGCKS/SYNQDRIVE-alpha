const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const DTC_02_ADAPTIVE_SCHEDULER_SHADOW_ENABLED_ENV =
  'DTC_02_ADAPTIVE_SCHEDULER_SHADOW_ENABLED';

export const DTC_02_ADAPTIVE_SCHEDULER_SHADOW_VEHICLE_ALLOWLIST_ENV =
  'DTC_02_ADAPTIVE_SCHEDULER_SHADOW_VEHICLE_ALLOWLIST';

export function isDtc02AdaptiveSchedulerShadowEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[DTC_02_ADAPTIVE_SCHEDULER_SHADOW_ENABLED_ENV]?.trim().toLowerCase() === 'true';
}

export function parseDtc02AdaptiveSchedulerShadowAllowlist(
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

export function shouldRunDtc02AdaptiveSchedulerShadowForVehicle(
  vehicleId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isDtc02AdaptiveSchedulerShadowEnabled(env)) return false;
  const parsed = parseDtc02AdaptiveSchedulerShadowAllowlist(
    env[DTC_02_ADAPTIVE_SCHEDULER_SHADOW_VEHICLE_ALLOWLIST_ENV],
  );
  if (!parsed.ok) return false;
  return parsed.allowlist.has(vehicleId.trim().toLowerCase());
}

export function isDtc02AdaptiveSchedulerShadowConfigValid(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isDtc02AdaptiveSchedulerShadowEnabled(env)) return true;
  return parseDtc02AdaptiveSchedulerShadowAllowlist(
    env[DTC_02_ADAPTIVE_SCHEDULER_SHADOW_VEHICLE_ALLOWLIST_ENV],
  ).ok;
}

export function logDtc02AdaptiveSchedulerShadowConfigOnBoot(logger: {
  error: (msg: string) => void;
  log?: (msg: string) => void;
}): void {
  if (!isDtc02AdaptiveSchedulerShadowEnabled()) return;
  const parsed = parseDtc02AdaptiveSchedulerShadowAllowlist(
    process.env[DTC_02_ADAPTIVE_SCHEDULER_SHADOW_VEHICLE_ALLOWLIST_ENV],
  );
  if (!parsed.ok) {
    logger.error(
      `DTC-02 adaptive scheduler shadow INVALID (${parsed.reason}): shadow disabled until allowlist fixed`,
    );
    return;
  }
  logger.log?.(
    `DTC-02 adaptive scheduler shadow armed for ${parsed.allowlist.size} vehicle(s) — projected plans only, no enqueue changes`,
  );
}
