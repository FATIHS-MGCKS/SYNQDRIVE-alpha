import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import * as fs from 'fs';

export const DI_S4_GATE6_LIVE_OPEN_HUMAN_APPROVAL_FILE_ENV = 'DI_S4_GATE6_LIVE_OPEN_HUMAN_APPROVAL_FILE';
export const DI_S4_GATE6_LIVE_OPEN_APPROVAL_ID_ENV = 'DI_S4_GATE6_LIVE_OPEN_APPROVAL_ID';
export const DI_S4_GATE6_HUMAN_APPROVAL_ROOT_KEY_FILE_ENV = 'DI_S4_GATE6_HUMAN_APPROVAL_ROOT_KEY_FILE';
export const GATE6_PRODUCTION_HUMAN_APPROVAL_ROOT_KEY_PATH = '/opt/synqdrive/shared/gate6-live-open-approval-root.key';

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

export type HumanApprovalFailure =
  | 'HUMAN_APPROVAL_FILE_MISSING'
  | 'HUMAN_APPROVAL_FILE_UNREADABLE'
  | 'HUMAN_APPROVAL_PARSE_INVALID'
  | 'HUMAN_APPROVAL_MAC_INVALID'
  | 'HUMAN_APPROVAL_PINS_MISMATCH'
  | 'HUMAN_APPROVAL_AUDIT_MISMATCH'
  | 'HUMAN_APPROVAL_ROOT_KEY_MISSING'
  | 'HUMAN_APPROVAL_ROOT_KEY_UNREADABLE'
  | 'INDEPENDENT_APPROVAL_AUTHORITY_BLOCKED';

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

export function readHumanApprovalRootKey(filePath: string): { ok: true; key: string } | { ok: false; reason: HumanApprovalFailure } {
  try {
    const key = fs.readFileSync(filePath, 'utf8').trim();
    if (!key) return { ok: false, reason: 'HUMAN_APPROVAL_ROOT_KEY_UNREADABLE' };
    return { ok: true, key };
  } catch {
    return { ok: false, reason: 'HUMAN_APPROVAL_ROOT_KEY_UNREADABLE' };
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

export function loadAndVerifyHumanApprovalFile(
  env: NodeJS.ProcessEnv,
  pins: { requiredSha: string; requiredReleaseId: string; requiredEnvSha256: string; reason: string; actor: string },
): { ok: true; record: Gate6HumanApprovalRecord } | { ok: false; failures: HumanApprovalFailure[] } {
  const failures: HumanApprovalFailure[] = [];
  const approvalFile = (env[DI_S4_GATE6_LIVE_OPEN_HUMAN_APPROVAL_FILE_ENV] ?? '').trim();
  if (!approvalFile) return { ok: false, failures: ['HUMAN_APPROVAL_FILE_MISSING'] };
  const rootResolved = resolveHumanApprovalRootKeyPath(env);
  if (!rootResolved.ok) return { ok: false, failures: [rootResolved.reason] };

  const rootKey = readHumanApprovalRootKey(rootResolved.path);
  if (!rootKey.ok) return { ok: false, failures: [rootKey.reason] };

  let raw: string;
  try {
    raw = fs.readFileSync(approvalFile, 'utf8');
  } catch {
    return { ok: false, failures: ['HUMAN_APPROVAL_FILE_UNREADABLE'] };
  }
  let record: Gate6HumanApprovalRecord;
  try {
    record = JSON.parse(raw) as Gate6HumanApprovalRecord;
  } catch {
    return { ok: false, failures: ['HUMAN_APPROVAL_PARSE_INVALID'] };
  }
  const verified = verifyHumanApprovalRecord(record, rootKey.key, pins);
  if (!verified.ok) return { ok: false, failures: verified.failures };
  return { ok: true, record };
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
