import { createHmac, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export const DI_S4_GATE6_LIVE_OPEN_DISPATCH_TOKEN_FILE_ENV = 'DI_S4_GATE6_LIVE_OPEN_DISPATCH_TOKEN_FILE';
export const DI_S4_GATE6_DISPATCH_TOKEN_DIR_ENV = 'DI_S4_GATE6_DISPATCH_TOKEN_DIR';
export const DI_S4_GATE6_DISPATCH_SIGNING_KEY_FILE_ENV = 'DI_S4_GATE6_DISPATCH_SIGNING_KEY_FILE';

export const DISPATCH_TOKEN_TTL_MS = 120_000;

export interface LiveOpenDispatchTokenRecord {
  v: 2;
  nonce: string;
  issuedAtMs: number;
  approvalId: string;
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
  | 'DISPATCH_TOKEN_DIR_MISSING'
  | 'DISPATCH_SIGNING_KEY_MISSING'
  | 'DISPATCH_SIGNING_KEY_MISMATCH'
  | 'DISPATCH_TOKEN_REPLAY_DETECTED';

function tokenPayloadString(input: Omit<LiveOpenDispatchTokenRecord, 'mac'>): string {
  return [
    String(input.v),
    input.nonce,
    String(input.issuedAtMs),
    input.approvalId,
    input.requiredSha,
    input.requiredReleaseId,
    input.requiredEnvSha256,
    input.reason.trim(),
    input.actor.trim(),
  ].join('\0');
}

export function computeDispatchTokenMac(signingKey: string, record: Omit<LiveOpenDispatchTokenRecord, 'mac'>): string {
  return createHmac('sha256', signingKey).update(tokenPayloadString(record), 'utf8').digest('hex');
}

export function dispatchSigningKeySidecarPath(tokenFilePath: string): string {
  return `${tokenFilePath}.hmac-key`;
}

export function dispatchTokenSpentMarkerPath(tokenFilePath: string): string {
  return `${tokenFilePath}.spent`;
}

function writeSigningKeySidecar(tokenFilePath: string, signingKey: string): string {
  const keyPath = dispatchSigningKeySidecarPath(tokenFilePath);
  fs.writeFileSync(keyPath, signingKey, { encoding: 'utf8', mode: 0o600 });
  return keyPath;
}

function readSigningKey(signingKeyFile: string): string | null {
  try {
    const key = fs.readFileSync(signingKeyFile, 'utf8').trim();
    return key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

function removeSidecars(tokenFilePath: string): void {
  const keyPath = dispatchSigningKeySidecarPath(tokenFilePath);
  const spent = dispatchTokenSpentMarkerPath(tokenFilePath);
  try {
    fs.unlinkSync(keyPath);
  } catch {
    /* best effort */
  }
  try {
    fs.unlinkSync(spent);
  } catch {
    /* best effort */
  }
}

/**
 * Issuance authority: requires verified human approval id; signing key is stored only in sidecar file (not in JSON).
 */
export function issueLiveOpenDispatchToken(
  tokenDir: string,
  input: {
    approvalId: string;
    requiredSha: string;
    requiredReleaseId: string;
    requiredEnvSha256: string;
    reason: string;
    actor: string;
    issuedAtMs?: number;
  },
): { filePath: string; signingKeyFilePath: string; record: LiveOpenDispatchTokenRecord } {
  const signingKey = randomBytes(32).toString('hex');
  const nonce = randomBytes(16).toString('hex');
  const issuedAtMs = input.issuedAtMs ?? Date.now();
  const base: Omit<LiveOpenDispatchTokenRecord, 'mac'> = {
    v: 2,
    nonce,
    issuedAtMs,
    approvalId: input.approvalId,
    requiredSha: input.requiredSha,
    requiredReleaseId: input.requiredReleaseId,
    requiredEnvSha256: input.requiredEnvSha256,
    reason: input.reason.trim(),
    actor: input.actor.trim(),
  };
  const record: LiveOpenDispatchTokenRecord = {
    ...base,
    mac: computeDispatchTokenMac(signingKey, base),
  };
  if (!fs.existsSync(tokenDir)) {
    throw new Error('DISPATCH_TOKEN_DIR_MISSING');
  }
  const filePath = path.join(tokenDir, `s4f7as-live-open-dispatch.${nonce}.json`);
  fs.writeFileSync(filePath, JSON.stringify(record), { encoding: 'utf8', mode: 0o600 });
  const signingKeyFilePath = writeSigningKeySidecar(filePath, signingKey);
  return { filePath, signingKeyFilePath, record };
}

function atomicClaimTokenForConsume(tokenFilePath: string): { ok: true; claimedPath: string } | { ok: false; failure: DispatchTokenFailure } {
  const spent = dispatchTokenSpentMarkerPath(tokenFilePath);
  if (fs.existsSync(spent)) {
    return { ok: false, failure: 'DISPATCH_TOKEN_REPLAY_DETECTED' };
  }
  if (!fs.existsSync(tokenFilePath)) {
    return { ok: false, failure: 'DISPATCH_TOKEN_ALREADY_CONSUMED' };
  }
  const claimed = `${tokenFilePath}.claiming.${process.pid}.${Date.now()}`;
  try {
    fs.renameSync(tokenFilePath, claimed);
    return { ok: true, claimedPath: claimed };
  } catch {
    if (fs.existsSync(spent)) return { ok: false, failure: 'DISPATCH_TOKEN_REPLAY_DETECTED' };
    return { ok: false, failure: 'DISPATCH_TOKEN_ALREADY_CONSUMED' };
  }
}

function markTokenSpent(originalTokenPath: string): void {
  fs.writeFileSync(dispatchTokenSpentMarkerPath(originalTokenPath), `${Date.now()}\n`, { encoding: 'utf8', mode: 0o600 });
}

/**
 * Read-only dispatch token validation (MAC + TTL). Does not claim, spend, or remove sidecars.
 */
export function peekLiveOpenDispatchToken(
  filePath: string,
  options: { signingKeyFile: string; nowMs?: number },
): { ok: true; record: LiveOpenDispatchTokenRecord } | { ok: false; failures: DispatchTokenFailure[] } {
  const nowMs = options.nowMs ?? Date.now();
  const failures: DispatchTokenFailure[] = [];
  if (!filePath.trim()) failures.push('DISPATCH_TOKEN_FILE_MISSING');
  const signingKeyFile = (options.signingKeyFile ?? '').trim();
  if (!signingKeyFile) failures.push('DISPATCH_SIGNING_KEY_MISSING');
  if (failures.length) return { ok: false, failures };

  const spent = dispatchTokenSpentMarkerPath(filePath);
  if (fs.existsSync(spent)) {
    return { ok: false, failures: ['DISPATCH_TOKEN_REPLAY_DETECTED'] };
  }
  if (!fs.existsSync(filePath)) {
    return { ok: false, failures: ['DISPATCH_TOKEN_FILE_MISSING'] };
  }

  const expectedKeyPath = dispatchSigningKeySidecarPath(filePath);
  if (path.resolve(signingKeyFile) !== path.resolve(expectedKeyPath)) {
    failures.push('DISPATCH_SIGNING_KEY_MISMATCH');
  }
  const signingKey = readSigningKey(signingKeyFile);
  if (!signingKey) failures.push('DISPATCH_SIGNING_KEY_MISSING');

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { ok: false, failures: ['DISPATCH_TOKEN_FILE_UNREADABLE'] };
  }

  let parsed: LiveOpenDispatchTokenRecord;
  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    if (json.v !== 2 || json.secret) {
      failures.push('DISPATCH_TOKEN_PARSE_INVALID');
    }
    parsed = json as unknown as LiveOpenDispatchTokenRecord;
  } catch {
    return { ok: false, failures: ['DISPATCH_TOKEN_PARSE_INVALID'] };
  }

  if (parsed.v !== 2 || !parsed.nonce || !parsed.approvalId) {
    failures.push('DISPATCH_TOKEN_PARSE_INVALID');
  } else if (signingKey) {
    const expectedMac = computeDispatchTokenMac(signingKey, {
      v: parsed.v,
      nonce: parsed.nonce,
      issuedAtMs: parsed.issuedAtMs,
      approvalId: parsed.approvalId,
      requiredSha: parsed.requiredSha,
      requiredReleaseId: parsed.requiredReleaseId,
      requiredEnvSha256: parsed.requiredEnvSha256,
      reason: parsed.reason,
      actor: parsed.actor,
    });
    if (expectedMac !== parsed.mac) failures.push('DISPATCH_TOKEN_MAC_INVALID');
  }

  if (nowMs - parsed.issuedAtMs > DISPATCH_TOKEN_TTL_MS) {
    failures.push('DISPATCH_TOKEN_EXPIRED');
  }

  if (failures.length) return { ok: false, failures };
  return { ok: true, record: parsed };
}

export function consumeLiveOpenDispatchToken(
  filePath: string,
  options: { signingKeyFile: string; nowMs?: number } ,
): { ok: true; record: LiveOpenDispatchTokenRecord; consumed: true } | { ok: false; failures: DispatchTokenFailure[]; consumed: false } {
  const nowMs = options.nowMs ?? Date.now();
  const failures: DispatchTokenFailure[] = [];
  if (!filePath.trim()) failures.push('DISPATCH_TOKEN_FILE_MISSING');
  const signingKeyFile = (options.signingKeyFile ?? '').trim();
  if (!signingKeyFile) failures.push('DISPATCH_SIGNING_KEY_MISSING');
  if (failures.length) return { ok: false, failures, consumed: false };

  const claim = atomicClaimTokenForConsume(filePath);
  if (!claim.ok) return { ok: false, failures: [claim.failure], consumed: false };
  const claimedPath = claim.claimedPath;

  const expectedKeyPath = dispatchSigningKeySidecarPath(filePath);
  if (path.resolve(signingKeyFile) !== path.resolve(expectedKeyPath)) {
    failures.push('DISPATCH_SIGNING_KEY_MISMATCH');
  }
  const signingKey = readSigningKey(signingKeyFile);
  if (!signingKey) failures.push('DISPATCH_SIGNING_KEY_MISSING');

  let raw: string;
  try {
    raw = fs.readFileSync(claimedPath, 'utf8');
  } catch {
    try {
      fs.renameSync(claimedPath, filePath);
    } catch {
      /* unclaim failed */
    }
    return { ok: false, failures: ['DISPATCH_TOKEN_FILE_UNREADABLE'], consumed: false };
  }

  let parsed: LiveOpenDispatchTokenRecord;
  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    if (json.v !== 2 || json.secret) {
      failures.push('DISPATCH_TOKEN_PARSE_INVALID');
    }
    parsed = json as unknown as LiveOpenDispatchTokenRecord;
  } catch {
    failures.push('DISPATCH_TOKEN_PARSE_INVALID');
    try {
      fs.renameSync(claimedPath, filePath);
    } catch {
      /* */
    }
    return { ok: false, failures, consumed: false };
  }

  if (parsed.v !== 2 || !parsed.nonce || !parsed.approvalId) {
    failures.push('DISPATCH_TOKEN_PARSE_INVALID');
  } else if (signingKey) {
    const expectedMac = computeDispatchTokenMac(signingKey, {
      v: parsed.v,
      nonce: parsed.nonce,
      issuedAtMs: parsed.issuedAtMs,
      approvalId: parsed.approvalId,
      requiredSha: parsed.requiredSha,
      requiredReleaseId: parsed.requiredReleaseId,
      requiredEnvSha256: parsed.requiredEnvSha256,
      reason: parsed.reason,
      actor: parsed.actor,
    });
    if (expectedMac !== parsed.mac) failures.push('DISPATCH_TOKEN_MAC_INVALID');
  }

  if (nowMs - parsed.issuedAtMs > DISPATCH_TOKEN_TTL_MS) {
    failures.push('DISPATCH_TOKEN_EXPIRED');
  }

  if (failures.length) {
    try {
      fs.unlinkSync(claimedPath);
    } catch {
      /* */
    }
    removeSidecars(filePath);
    markTokenSpent(filePath);
    return { ok: false, failures, consumed: false };
  }

  try {
    fs.unlinkSync(claimedPath);
  } catch {
    return { ok: false, failures: ['DISPATCH_TOKEN_FILE_UNREADABLE'], consumed: false };
  }
  removeSidecars(filePath);
  markTokenSpent(filePath);
  return { ok: true, record: parsed, consumed: true };
}
