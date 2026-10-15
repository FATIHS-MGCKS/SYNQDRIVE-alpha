import {
  VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_ENABLED_ENV,
  VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_JSON_ENV,
  isVsi03P2cSourceObservationCaptureEnabled,
} from './vsi03-p2c.config';

export const VSI03_P2C_CAPTURE_ALLOWLIST_SCHEMA_VERSION = 1 as const;

export type Vsi03P2cCaptureAllowlistEntry = {
  organizationId: string;
  vehicleId: string;
};

export type Vsi03P2cCaptureAllowlistDocument = {
  version: typeof VSI03_P2C_CAPTURE_ALLOWLIST_SCHEMA_VERSION;
  entries: Vsi03P2cCaptureAllowlistEntry[];
};

export type Vsi03P2cCaptureAllowlistParseResult =
  | { ok: true; entries: ReadonlySet<string> }
  | { ok: false; reason: string };

export type Vsi03P2cCaptureAdmissionReason =
  | 'CAPTURE_FLAG_OFF'
  | 'ALLOWLIST_NOT_ENABLED'
  | 'ALLOWLIST_MALFORMED'
  | 'ALLOWLIST_EMPTY'
  | 'NOT_IN_ALLOWLIST';

export type Vsi03P2cCaptureAdmissionResult =
  | { admitted: true }
  | { admitted: false; reason: Vsi03P2cCaptureAdmissionReason };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function entryKey(organizationId: string, vehicleId: string): string {
  return `${organizationId.trim().toLowerCase()}::${vehicleId.trim().toLowerCase()}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isVsi03P2cCapturePilotAllowlistEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_ENABLED_ENV]?.trim().toLowerCase() === 'true';
}

export function parseVsi03P2cCapturePilotAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): Vsi03P2cCaptureAllowlistParseResult {
  const raw = env[VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_JSON_ENV]?.trim();
  if (!raw) {
    return { ok: false, reason: 'ALLOWLIST_JSON_MISSING' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'ALLOWLIST_JSON_INVALID' };
  }

  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'ALLOWLIST_JSON_NOT_OBJECT' };
  }

  const doc = parsed as Partial<Vsi03P2cCaptureAllowlistDocument>;
  if (doc.version !== VSI03_P2C_CAPTURE_ALLOWLIST_SCHEMA_VERSION) {
    return { ok: false, reason: 'ALLOWLIST_VERSION_UNSUPPORTED' };
  }

  if (!Array.isArray(doc.entries) || doc.entries.length === 0) {
    return { ok: false, reason: 'ALLOWLIST_ENTRIES_EMPTY' };
  }

  const keys = new Set<string>();
  for (const entry of doc.entries) {
    if (entry == null || typeof entry !== 'object') {
      return { ok: false, reason: 'ALLOWLIST_ENTRY_INVALID' };
    }
    const organizationId = (entry as Vsi03P2cCaptureAllowlistEntry).organizationId;
    const vehicleId = (entry as Vsi03P2cCaptureAllowlistEntry).vehicleId;
    if (!isNonEmptyString(organizationId) || !isNonEmptyString(vehicleId)) {
      return { ok: false, reason: 'ALLOWLIST_ENTRY_IDS_REQUIRED' };
    }
    if (!UUID_RE.test(organizationId.trim()) || !UUID_RE.test(vehicleId.trim())) {
      return { ok: false, reason: 'ALLOWLIST_ENTRY_IDS_MUST_BE_UUID' };
    }
    keys.add(entryKey(organizationId, vehicleId));
  }

  if (keys.size === 0) {
    return { ok: false, reason: 'ALLOWLIST_ENTRIES_EMPTY' };
  }

  return { ok: true, entries: keys };
}

/**
 * Synchronous gate: global capture flag + pilot allowlist membership only.
 * Eligibility (registry, active link) is enforced separately before writes.
 */
export function evaluateVsi03P2cCaptureAdmission(
  input: { organizationId: string; vehicleId: string },
  env: NodeJS.ProcessEnv = process.env,
): Vsi03P2cCaptureAdmissionResult {
  if (!isVsi03P2cSourceObservationCaptureEnabled(env)) {
    return { admitted: false, reason: 'CAPTURE_FLAG_OFF' };
  }

  if (!isVsi03P2cCapturePilotAllowlistEnabled(env)) {
    return { admitted: false, reason: 'ALLOWLIST_NOT_ENABLED' };
  }

  const parsed = parseVsi03P2cCapturePilotAllowlist(env);
  if (!parsed.ok) {
    return { admitted: false, reason: 'ALLOWLIST_MALFORMED' };
  }

  const key = entryKey(input.organizationId, input.vehicleId);
  if (!parsed.entries.has(key)) {
    return { admitted: false, reason: 'NOT_IN_ALLOWLIST' };
  }

  return { admitted: true };
}

export function buildVsi03P2cCapturePilotAllowlistJson(
  entries: Vsi03P2cCaptureAllowlistEntry[],
): string {
  return JSON.stringify({
    version: VSI03_P2C_CAPTURE_ALLOWLIST_SCHEMA_VERSION,
    entries,
  });
}
