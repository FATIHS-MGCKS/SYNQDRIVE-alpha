import { createHmac, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export const DI_S4_GATE6_LIVE_OPEN_DISPATCH_TOKEN_FILE_ENV = 'DI_S4_GATE6_LIVE_OPEN_DISPATCH_TOKEN_FILE';
export const DI_S4_GATE6_DISPATCH_TOKEN_DIR_ENV = 'DI_S4_GATE6_DISPATCH_TOKEN_DIR';

export const DISPATCH_TOKEN_TTL_MS = 120_000;

export interface LiveOpenDispatchTokenRecord {
  v: 1;
  secret: string;
  nonce: string;
  issuedAtMs: number;
  gate6Ack: 'YES';
  gate6Authorized: 'YES';
  requiredSha: string;
  requiredReleaseId: string;
  requiredEnvSha256: string;
  reason: string;
  actor: string;
  mac: string;
}

export type DispatchTokenFailure =
  | 'DISPATCH_TOKEN_FILE_MISSING'
  | 'DISPATCH_TOKEN_FILE_UNREADABLE'
  | 'DISPATCH_TOKEN_PARSE_INVALID'
  | 'DISPATCH_TOKEN_MAC_INVALID'
  | 'DISPATCH_TOKEN_EXPIRED'
  | 'DISPATCH_TOKEN_ALREADY_CONSUMED'
  | 'DISPATCH_TOKEN_DIR_MISSING';

function tokenPayloadString(input: Omit<LiveOpenDispatchTokenRecord, 'mac' | 'secret'> & { secret: string }): string {
  return [
    String(input.v),
    input.nonce,
    String(input.issuedAtMs),
    input.gate6Ack,
    input.gate6Authorized,
    input.requiredSha,
    input.requiredReleaseId,
    input.requiredEnvSha256,
    input.reason.trim(),
    input.actor.trim(),
  ].join('\0');
}

export function computeDispatchTokenMac(secret: string, record: Omit<LiveOpenDispatchTokenRecord, 'mac'>): string {
  return createHmac('sha256', secret).update(tokenPayloadString({ ...record, secret }), 'utf8').digest('hex');
}

export function issueLiveOpenDispatchToken(
  tokenDir: string,
  input: {
    requiredSha: string;
    requiredReleaseId: string;
    requiredEnvSha256: string;
    reason: string;
    actor: string;
    issuedAtMs?: number;
  },
): { filePath: string; record: LiveOpenDispatchTokenRecord } {
  const secret = randomBytes(32).toString('hex');
  const nonce = randomBytes(16).toString('hex');
  const issuedAtMs = input.issuedAtMs ?? Date.now();
  const base: Omit<LiveOpenDispatchTokenRecord, 'mac'> = {
    v: 1,
    secret,
    nonce,
    issuedAtMs,
    gate6Ack: 'YES',
    gate6Authorized: 'YES',
    requiredSha: input.requiredSha,
    requiredReleaseId: input.requiredReleaseId,
    requiredEnvSha256: input.requiredEnvSha256,
    reason: input.reason.trim(),
    actor: input.actor.trim(),
  };
  const record: LiveOpenDispatchTokenRecord = {
    ...base,
    mac: computeDispatchTokenMac(secret, base),
  };
  if (!fs.existsSync(tokenDir)) {
    throw new Error('DISPATCH_TOKEN_DIR_MISSING');
  }
  const filePath = path.join(tokenDir, `s4f7as-live-open-dispatch.${nonce}.json`);
  fs.writeFileSync(filePath, JSON.stringify(record), { encoding: 'utf8', mode: 0o600 });
  return { filePath, record };
}

export function consumeLiveOpenDispatchToken(
  filePath: string,
  nowMs: number = Date.now(),
): { ok: true; record: LiveOpenDispatchTokenRecord; consumed: true } | { ok: false; failures: DispatchTokenFailure[]; consumed: false } {
  const failures: DispatchTokenFailure[] = [];
  if (!filePath.trim()) failures.push('DISPATCH_TOKEN_FILE_MISSING');
  if (failures.length) return { ok: false, failures, consumed: false };
  if (!fs.existsSync(filePath)) {
    return { ok: false, failures: ['DISPATCH_TOKEN_ALREADY_CONSUMED'], consumed: false };
  }
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { ok: false, failures: ['DISPATCH_TOKEN_FILE_UNREADABLE'], consumed: false };
  }
  let parsed: LiveOpenDispatchTokenRecord;
  try {
    parsed = JSON.parse(raw) as LiveOpenDispatchTokenRecord;
  } catch {
    return { ok: false, failures: ['DISPATCH_TOKEN_PARSE_INVALID'], consumed: false };
  }
  if (parsed.v !== 1 || !parsed.secret || !parsed.nonce) {
    return { ok: false, failures: ['DISPATCH_TOKEN_PARSE_INVALID'], consumed: false };
  }
  const expectedMac = computeDispatchTokenMac(parsed.secret, {
    v: parsed.v,
    secret: parsed.secret,
    nonce: parsed.nonce,
    issuedAtMs: parsed.issuedAtMs,
    gate6Ack: parsed.gate6Ack,
    gate6Authorized: parsed.gate6Authorized,
    requiredSha: parsed.requiredSha,
    requiredReleaseId: parsed.requiredReleaseId,
    requiredEnvSha256: parsed.requiredEnvSha256,
    reason: parsed.reason,
    actor: parsed.actor,
  });
  if (expectedMac !== parsed.mac) {
    return { ok: false, failures: ['DISPATCH_TOKEN_MAC_INVALID'], consumed: false };
  }
  if (nowMs - parsed.issuedAtMs > DISPATCH_TOKEN_TTL_MS) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* best effort */
    }
    return { ok: false, failures: ['DISPATCH_TOKEN_EXPIRED'], consumed: false };
  }
  try {
    fs.unlinkSync(filePath);
  } catch {
    return { ok: false, failures: ['DISPATCH_TOKEN_FILE_UNREADABLE'], consumed: false };
  }
  return { ok: true, record: parsed, consumed: true };
}
