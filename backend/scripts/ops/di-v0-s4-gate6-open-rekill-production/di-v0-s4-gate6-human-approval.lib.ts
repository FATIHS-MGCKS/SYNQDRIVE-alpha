import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import { isCanonicalProductionBackendEnv } from './di-v0-s4-gate6-live-authority.lib';
import {
  type Gate6HumanApprovalRecordV2,
  verifyGate6HumanApprovalRecordV2,
} from './di-v0-s4-gate6-human-approval-ed25519.lib';
import {
  evaluateProductionGate6IssuanceTrustAnchors,
  isProductionGate6IssuanceContext,
  type ProductionTrustAnchorFailure,
} from './di-v0-s4-gate6-production-trust-anchor.lib';
import {
  GATE6_PRODUCTION_HUMAN_APPROVAL_PUBLIC_KEY_PATH,
  GATE6_PRODUCTION_HUMAN_APPROVAL_ROOT_KEY_PATH,
} from './di-v0-s4-gate6-production-paths.lib';

export const DI_S4_GATE6_LIVE_OPEN_HUMAN_APPROVAL_FILE_ENV = 'DI_S4_GATE6_LIVE_OPEN_HUMAN_APPROVAL_FILE';
export const DI_S4_GATE6_LIVE_OPEN_APPROVAL_ID_ENV = 'DI_S4_GATE6_LIVE_OPEN_APPROVAL_ID';
export const DI_S4_GATE6_HUMAN_APPROVAL_ROOT_KEY_FILE_ENV = 'DI_S4_GATE6_HUMAN_APPROVAL_ROOT_KEY_FILE';
export const DI_S4_GATE6_HUMAN_APPROVAL_PUBLIC_KEY_FILE_ENV = 'DI_S4_GATE6_HUMAN_APPROVAL_PUBLIC_KEY_FILE';
export { GATE6_PRODUCTION_HUMAN_APPROVAL_PUBLIC_KEY_PATH, GATE6_PRODUCTION_HUMAN_APPROVAL_ROOT_KEY_PATH };

export interface Gate6HumanApprovalRecord {
  v: 1;
  approvalId: string;
  actor: string;
  reason: string;
  requiredSha: string;
  requiredReleaseId: string;
  requiredEnvSha256: string;
  approvedAtMs: number;
  mac: string;
}

export type VerifiedHumanApprovalRecord =
  | { scheme: 'hmac-v1'; record: Gate6HumanApprovalRecord }
  | { scheme: 'ed25519-v2'; record: Gate6HumanApprovalRecordV2 };

export type HumanApprovalFailure =
  | 'HUMAN_APPROVAL_FILE_MISSING'
  | 'HUMAN_APPROVAL_FILE_UNREADABLE'
  | 'HUMAN_APPROVAL_PARSE_INVALID'
  | 'HUMAN_APPROVAL_MAC_INVALID'
  | 'HUMAN_APPROVAL_PINS_MISMATCH'
  | 'HUMAN_APPROVAL_AUDIT_MISMATCH'
  | 'HUMAN_APPROVAL_ROOT_KEY_MISSING'
  | 'HUMAN_APPROVAL_ROOT_KEY_UNREADABLE'
  | 'HUMAN_APPROVAL_ED25519_REQUIRED'
  | 'HUMAN_APPROVAL_HMAC_FORBIDDEN_ON_CANONICAL_PRODUCTION'
  | 'HUMAN_APPROVAL_ED25519_PUBLIC_KEY_MISSING'
  | 'HUMAN_APPROVAL_ED25519_PUBLIC_KEY_UNREADABLE'
  | 'HUMAN_APPROVAL_ED25519_SIGNATURE_INVALID'
  | 'HUMAN_APPROVAL_VALIDITY_WINDOW_INVALID'
  | 'HUMAN_APPROVAL_VALIDITY_WINDOW_EXPIRED'
  | 'HUMAN_APPROVAL_VALIDITY_WINDOW_NOT_YET_VALID'
  | 'INDEPENDENT_APPROVAL_AUTHORITY_BLOCKED'
  | ProductionTrustAnchorFailure;

function approvalPayloadString(
  input: Omit<Gate6HumanApprovalRecord, 'mac'>,
): string {
  return [
    String(input.v),
    input.approvalId,
    input.actor.trim(),
    input.reason.trim(),
    input.requiredSha,
    input.requiredReleaseId,
    input.requiredEnvSha256,
    String(input.approvedAtMs),
  ].join('\0');
}

export function computeHumanApprovalMac(rootKey: string, record: Omit<Gate6HumanApprovalRecord, 'mac'>): string {
  return createHmac('sha256', rootKey).update(approvalPayloadString(record), 'utf8').digest('hex');
}

export function createHumanApprovalRecord(
  rootKey: string,
  input: Omit<Gate6HumanApprovalRecord, 'mac' | 'v'>,
): Gate6HumanApprovalRecord {
  const base: Omit<Gate6HumanApprovalRecord, 'mac'> = { v: 1, ...input };
  return { ...base, mac: computeHumanApprovalMac(rootKey, base) };
}

export function resolveHumanApprovalRootKeyPath(env: NodeJS.ProcessEnv = process.env): { ok: true; path: string } | { ok: false; reason: HumanApprovalFailure } {
  const explicit = (env[DI_S4_GATE6_HUMAN_APPROVAL_ROOT_KEY_FILE_ENV] ?? '').trim();
  if (explicit) {
    if (!fs.existsSync(explicit)) return { ok: false, reason: 'HUMAN_APPROVAL_ROOT_KEY_MISSING' };
    return { ok: true, path: explicit };
  }
  if (fs.existsSync(GATE6_PRODUCTION_HUMAN_APPROVAL_ROOT_KEY_PATH)) {
    return { ok: true, path: GATE6_PRODUCTION_HUMAN_APPROVAL_ROOT_KEY_PATH };
  }
  return { ok: false, reason: 'INDEPENDENT_APPROVAL_AUTHORITY_BLOCKED' };
}

export function resolveHumanApprovalPublicKeyPath(env: NodeJS.ProcessEnv = process.env): { ok: true; path: string } | { ok: false; reason: HumanApprovalFailure } {
  if (isProductionGate6IssuanceContext(env)) {
    if ((env[DI_S4_GATE6_HUMAN_APPROVAL_PUBLIC_KEY_FILE_ENV] ?? '').trim()) {
      return { ok: false, reason: 'HUMAN_APPROVAL_PUBLIC_KEY_ENV_OVERRIDE_FORBIDDEN' };
    }
    const anchors = evaluateProductionGate6IssuanceTrustAnchors(env);
    if (!anchors.ok) {
      const reason =
        anchors.failures.find((f) => f.startsWith('HUMAN_APPROVAL_PUBLIC_KEY')) ??
        anchors.failures[0] ??
        'HUMAN_APPROVAL_PUBLIC_KEY_TRUST_ANCHOR_INVALID';
      return { ok: false, reason };
    }
    return { ok: true, path: GATE6_PRODUCTION_HUMAN_APPROVAL_PUBLIC_KEY_PATH };
  }

  const explicit = (env[DI_S4_GATE6_HUMAN_APPROVAL_PUBLIC_KEY_FILE_ENV] ?? '').trim();
  if (explicit) {
    if (!fs.existsSync(explicit)) return { ok: false, reason: 'HUMAN_APPROVAL_ED25519_PUBLIC_KEY_MISSING' };
    return { ok: true, path: explicit };
  }
  if (fs.existsSync(GATE6_PRODUCTION_HUMAN_APPROVAL_PUBLIC_KEY_PATH)) {
    return { ok: true, path: GATE6_PRODUCTION_HUMAN_APPROVAL_PUBLIC_KEY_PATH };
  }
  return { ok: false, reason: 'HUMAN_APPROVAL_ED25519_PUBLIC_KEY_MISSING' };
}

export function readHumanApprovalRootKey(filePath: string): { ok: true; key: string } | { ok: false; reason: HumanApprovalFailure } {
  try {
    const key = fs.readFileSync(filePath, 'utf8').trim();
    if (!key) return { ok: false, reason: 'HUMAN_APPROVAL_ROOT_KEY_UNREADABLE' };
    return { ok: true, key };
  } catch {
    return { ok: false, reason: 'HUMAN_APPROVAL_ROOT_KEY_UNREADABLE' };
  }
}

export function readHumanApprovalPublicKeyPem(filePath: string): { ok: true; pem: string } | { ok: false; reason: HumanApprovalFailure } {
  try {
    const pem = fs.readFileSync(filePath, 'utf8').trim();
    if (!pem) return { ok: false, reason: 'HUMAN_APPROVAL_ED25519_PUBLIC_KEY_UNREADABLE' };
    return { ok: true, pem };
  } catch {
    return { ok: false, reason: 'HUMAN_APPROVAL_ED25519_PUBLIC_KEY_UNREADABLE' };
  }
}

export function verifyHumanApprovalRecord(
  record: Gate6HumanApprovalRecord,
  rootKey: string,
  pins: { requiredSha: string; requiredReleaseId: string; requiredEnvSha256: string; reason: string; actor: string },
): { ok: true } | { ok: false; failures: HumanApprovalFailure[] } {
  const failures: HumanApprovalFailure[] = [];
  if (record.v !== 1 || !record.approvalId) failures.push('HUMAN_APPROVAL_PARSE_INVALID');
  const expectedMac = computeHumanApprovalMac(rootKey, {
    v: record.v,
    approvalId: record.approvalId,
    actor: record.actor,
    reason: record.reason,
    requiredSha: record.requiredSha,
    requiredReleaseId: record.requiredReleaseId,
    requiredEnvSha256: record.requiredEnvSha256,
    approvedAtMs: record.approvedAtMs,
  });
  try {
    const a = Buffer.from(expectedMac, 'hex');
    const b = Buffer.from(record.mac, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) failures.push('HUMAN_APPROVAL_MAC_INVALID');
  } catch {
    failures.push('HUMAN_APPROVAL_MAC_INVALID');
  }
  if (
    record.requiredSha !== pins.requiredSha ||
    record.requiredReleaseId !== pins.requiredReleaseId ||
    record.requiredEnvSha256 !== pins.requiredEnvSha256
  ) {
    failures.push('HUMAN_APPROVAL_PINS_MISMATCH');
  }
  if (record.reason.trim() !== pins.reason.trim() || record.actor.trim() !== pins.actor.trim()) {
    failures.push('HUMAN_APPROVAL_AUDIT_MISMATCH');
  }
  return failures.length ? { ok: false, failures } : { ok: true };
}

function mustUseEd25519Verification(env: NodeJS.ProcessEnv): boolean {
  if (isCanonicalProductionBackendEnv(env)) return true;
  const explicit = (env[DI_S4_GATE6_HUMAN_APPROVAL_PUBLIC_KEY_FILE_ENV] ?? '').trim();
  if (explicit) return true;
  return fs.existsSync(GATE6_PRODUCTION_HUMAN_APPROVAL_PUBLIC_KEY_PATH);
}

function parseApprovalJson(raw: string): Gate6HumanApprovalRecord | Gate6HumanApprovalRecordV2 | null {
  try {
    const json = JSON.parse(raw) as { v?: number };
    if (json.v === 2) return json as Gate6HumanApprovalRecordV2;
    if (json.v === 1) return json as Gate6HumanApprovalRecord;
    return null;
  } catch {
    return null;
  }
}

export function loadAndVerifyHumanApprovalFile(
  env: NodeJS.ProcessEnv,
  pins: { requiredSha: string; requiredReleaseId: string; requiredEnvSha256: string; reason: string; actor: string },
  options?: { nowMs?: number },
): { ok: true; verified: VerifiedHumanApprovalRecord } | { ok: false; failures: HumanApprovalFailure[] } {
  if (isProductionGate6IssuanceContext(env)) {
    const anchors = evaluateProductionGate6IssuanceTrustAnchors(env);
    if (!anchors.ok) {
      return { ok: false, failures: anchors.failures };
    }
  }

  const approvalFile = (env[DI_S4_GATE6_LIVE_OPEN_HUMAN_APPROVAL_FILE_ENV] ?? '').trim();
  if (!approvalFile) return { ok: false, failures: ['HUMAN_APPROVAL_FILE_MISSING'] };

  let raw: string;
  try {
    raw = fs.readFileSync(approvalFile, 'utf8');
  } catch {
    return { ok: false, failures: ['HUMAN_APPROVAL_FILE_UNREADABLE'] };
  }

  const parsed = parseApprovalJson(raw);
  if (!parsed) return { ok: false, failures: ['HUMAN_APPROVAL_PARSE_INVALID'] };

  const ed25519Required = mustUseEd25519Verification(env);

  if (parsed.v === 2) {
    const publicResolved = resolveHumanApprovalPublicKeyPath(env);
    if (!publicResolved.ok) return { ok: false, failures: [publicResolved.reason] };
    const publicKey = readHumanApprovalPublicKeyPem(publicResolved.path);
    if (!publicKey.ok) return { ok: false, failures: [publicKey.reason] };
    const verified = verifyGate6HumanApprovalRecordV2(
      publicKey.pem,
      parsed,
      pins,
      options?.nowMs ?? Date.now(),
    );
    if (!verified.ok) return { ok: false, failures: verified.failures };
    return { ok: true, verified: { scheme: 'ed25519-v2', record: parsed } };
  }

  if (ed25519Required) {
    if (isCanonicalProductionBackendEnv(env)) {
      return { ok: false, failures: ['HUMAN_APPROVAL_HMAC_FORBIDDEN_ON_CANONICAL_PRODUCTION', 'HUMAN_APPROVAL_ED25519_REQUIRED'] };
    }
    return { ok: false, failures: ['HUMAN_APPROVAL_ED25519_REQUIRED'] };
  }

  if (isProductionGate6IssuanceContext(env)) {
    return {
      ok: false,
      failures: ['HUMAN_APPROVAL_HMAC_FORBIDDEN_ON_CANONICAL_PRODUCTION', 'HUMAN_APPROVAL_ED25519_REQUIRED'],
    };
  }

  const record = parsed as Gate6HumanApprovalRecord;
  const rootResolved = resolveHumanApprovalRootKeyPath(env);
  if (!rootResolved.ok) return { ok: false, failures: [rootResolved.reason] };
  const rootKey = readHumanApprovalRootKey(rootResolved.path);
  if (!rootKey.ok) return { ok: false, failures: [rootKey.reason] };
  const verified = verifyHumanApprovalRecord(record, rootKey.key, pins);
  if (!verified.ok) return { ok: false, failures: verified.failures };
  return { ok: true, verified: { scheme: 'hmac-v1', record } };
}

/** Engineering-only helper for tests — not used on Production canonical path. */
export function writeFixtureHumanApprovalFile(
  filePath: string,
  rootKey: string,
  input: Omit<Gate6HumanApprovalRecord, 'mac' | 'v'>,
): Gate6HumanApprovalRecord {
  const record = createHumanApprovalRecord(rootKey, input);
  fs.writeFileSync(filePath, JSON.stringify(record), { encoding: 'utf8', mode: 0o600 });
  return record;
}

export function generateApprovalId(): string {
  return randomBytes(12).toString('hex');
}

export function approvalIdFromVerified(verified: VerifiedHumanApprovalRecord): string {
  return verified.record.approvalId;
}
