import { createHash, createHmac, timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  isApprovalIdConsumed,
  resolveApprovalConsumptionRegisterDir,
} from './di-v0-s4-gate6-approval-consumption.lib';
import type { Gate6HumanApprovalRecordV2 } from './di-v0-s4-gate6-human-approval-ed25519.lib';
import {
  approvalIdFromVerified,
  loadAndVerifyHumanApprovalFile,
  type VerifiedHumanApprovalRecord,
} from './di-v0-s4-gate6-human-approval.lib';
import { isProductionBackendEnvSurface } from './di-v0-s4-gate6-live-authority.lib';
import {
  DI_S4_GATE6_DISPATCH_ISSUANCE_MAC_KEY_FILE_ENV,
  DI_S4_GATE6_DISPATCH_ISSUANCE_REGISTER_DIR_ENV,
  GATE6_PRODUCTION_DISPATCH_ISSUANCE_MAC_KEY_PATH,
  GATE6_PRODUCTION_DISPATCH_ISSUANCE_REGISTER_DIR,
} from './di-v0-s4-gate6-production-paths.lib';
import type { LiveOpenDispatchTokenRecord } from './di-v0-s4-gate6-dispatch-token.lib';
import {
  DI_S4_GATE6_LIVE_OPEN_DISPATCH_TOKEN_FILE_ENV,
  dispatchSigningKeySidecarPath,
  peekLiveOpenDispatchToken,
} from './di-v0-s4-gate6-dispatch-token.lib';
import { DI_S4_GATE6_LIVE_OPEN_HUMAN_APPROVAL_FILE_ENV } from './di-v0-s4-gate6-human-approval.lib';

export interface TrustedDispatchIssuanceRecordV1 {
  v: 1;
  nonce: string;
  approvalId: string;
  requiredSha: string;
  requiredReleaseId: string;
  requiredEnvSha256: string;
  reason: string;
  actor: string;
  validFromMs: number;
  validUntilMs: number;
  issuedAtMs: number;
  tokenDigest: string;
  mac: string;
}

export type TrustedDispatchProvenanceFailure =
  | 'TRUSTED_DISPATCH_ISSUANCE_REGISTER_MISSING'
  | 'TRUSTED_DISPATCH_ISSUANCE_MAC_KEY_MISSING'
  | 'TRUSTED_DISPATCH_ISSUANCE_MAC_KEY_UNREADABLE'
  | 'TRUSTED_DISPATCH_ISSUANCE_REGISTER_ENV_OVERRIDE_FORBIDDEN'
  | 'TRUSTED_DISPATCH_ISSUANCE_MAC_KEY_ENV_OVERRIDE_FORBIDDEN'
  | 'TRUSTED_DISPATCH_ISSUANCE_RECORD_MISSING'
  | 'TRUSTED_DISPATCH_ISSUANCE_RECORD_INVALID'
  | 'TRUSTED_DISPATCH_ISSUANCE_MAC_INVALID'
  | 'TRUSTED_DISPATCH_ISSUANCE_DIGEST_MISMATCH'
  | 'TRUSTED_DISPATCH_ISSUANCE_PINS_MISMATCH'
  | 'TRUSTED_DISPATCH_ISSUANCE_ALREADY_SPENT'
  | 'TRUSTED_DISPATCH_APPROVAL_NOT_CONSUMED'
  | 'HUMAN_APPROVAL_FILE_MISSING'
  | 'HUMAN_APPROVAL_REVERIFY_FAILED'
  | 'HUMAN_APPROVAL_TOKEN_MISMATCH'
  | 'DISPATCH_TOKEN_FILE_MISSING'
  | 'DISPATCH_TOKEN_PEEK_FAILED'
  | 'DISPATCH_TOKEN_PINS_MISMATCH'
  | 'PRIVILEGED_ISSUANCE_REGISTER_NOT_WRITABLE';

function issuanceRecordPath(registerDir: string, nonce: string): string {
  return path.join(registerDir, `gate6-dispatch-issuance.${nonce}.json`);
}

function issuanceLiveOpenSpentPath(registerDir: string, nonce: string): string {
  return path.join(registerDir, `gate6-dispatch-issuance.${nonce}.live-open-spent`);
}

export function computeDispatchTokenDigest(record: LiveOpenDispatchTokenRecord): string {
  const canonical = JSON.stringify({
    v: record.v,
    nonce: record.nonce,
    issuedAtMs: record.issuedAtMs,
    approvalId: record.approvalId,
    requiredSha: record.requiredSha,
    requiredReleaseId: record.requiredReleaseId,
    requiredEnvSha256: record.requiredEnvSha256,
    reason: record.reason.trim(),
    actor: record.actor.trim(),
    mac: record.mac,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function issuancePayloadString(input: Omit<TrustedDispatchIssuanceRecordV1, 'mac'>): string {
  return [
    String(input.v),
    input.nonce,
    input.approvalId,
    input.requiredSha,
    input.requiredReleaseId,
    input.requiredEnvSha256,
    input.reason.trim(),
    input.actor.trim(),
    String(input.validFromMs),
    String(input.validUntilMs),
    String(input.issuedAtMs),
    input.tokenDigest,
  ].join('\0');
}

function computeIssuanceRecordMac(macKey: string, record: Omit<TrustedDispatchIssuanceRecordV1, 'mac'>): string {
  return createHmac('sha256', macKey).update(issuancePayloadString(record), 'utf8').digest('hex');
}

export function approvalValidityWindow(
  verified: VerifiedHumanApprovalRecord,
): { validFromMs: number; validUntilMs: number } {
  if (verified.scheme === 'ed25519-v2') {
    return { validFromMs: verified.record.validFromMs, validUntilMs: verified.record.validUntilMs };
  }
  const approvedAtMs = verified.record.approvedAtMs;
  return { validFromMs: approvedAtMs, validUntilMs: approvedAtMs + 24 * 60 * 60 * 1000 };
}

export function resolveDispatchIssuanceRegisterDir(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; dir: string } | { ok: false; failure: TrustedDispatchProvenanceFailure } {
  if (isProductionBackendEnvSurface(env)) {
    if ((env[DI_S4_GATE6_DISPATCH_ISSUANCE_REGISTER_DIR_ENV] ?? '').trim()) {
      return { ok: false, failure: 'TRUSTED_DISPATCH_ISSUANCE_REGISTER_ENV_OVERRIDE_FORBIDDEN' };
    }
    if (!fs.existsSync(GATE6_PRODUCTION_DISPATCH_ISSUANCE_REGISTER_DIR)) {
      return { ok: false, failure: 'TRUSTED_DISPATCH_ISSUANCE_REGISTER_MISSING' };
    }
    return { ok: true, dir: GATE6_PRODUCTION_DISPATCH_ISSUANCE_REGISTER_DIR };
  }
  const explicit = (env[DI_S4_GATE6_DISPATCH_ISSUANCE_REGISTER_DIR_ENV] ?? '').trim();
  if (!explicit || !fs.existsSync(explicit)) {
    return { ok: false, failure: 'TRUSTED_DISPATCH_ISSUANCE_REGISTER_MISSING' };
  }
  return { ok: true, dir: explicit };
}

export function resolveDispatchIssuanceMacKey(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; key: string } | { ok: false; failure: TrustedDispatchProvenanceFailure } {
  if (isProductionBackendEnvSurface(env)) {
    if ((env[DI_S4_GATE6_DISPATCH_ISSUANCE_MAC_KEY_FILE_ENV] ?? '').trim()) {
      return { ok: false, failure: 'TRUSTED_DISPATCH_ISSUANCE_MAC_KEY_ENV_OVERRIDE_FORBIDDEN' };
    }
    if (!fs.existsSync(GATE6_PRODUCTION_DISPATCH_ISSUANCE_MAC_KEY_PATH)) {
      return { ok: false, failure: 'TRUSTED_DISPATCH_ISSUANCE_MAC_KEY_MISSING' };
    }
    try {
      const key = fs.readFileSync(GATE6_PRODUCTION_DISPATCH_ISSUANCE_MAC_KEY_PATH, 'utf8').trim();
      if (!key) return { ok: false, failure: 'TRUSTED_DISPATCH_ISSUANCE_MAC_KEY_UNREADABLE' };
      return { ok: true, key };
    } catch {
      return { ok: false, failure: 'TRUSTED_DISPATCH_ISSUANCE_MAC_KEY_UNREADABLE' };
    }
  }
  const explicit = (env[DI_S4_GATE6_DISPATCH_ISSUANCE_MAC_KEY_FILE_ENV] ?? '').trim();
  if (!explicit || !fs.existsSync(explicit)) {
    return { ok: false, failure: 'TRUSTED_DISPATCH_ISSUANCE_MAC_KEY_MISSING' };
  }
  try {
    const key = fs.readFileSync(explicit, 'utf8').trim();
    if (!key) return { ok: false, failure: 'TRUSTED_DISPATCH_ISSUANCE_MAC_KEY_UNREADABLE' };
    return { ok: true, key };
  } catch {
    return { ok: false, failure: 'TRUSTED_DISPATCH_ISSUANCE_MAC_KEY_UNREADABLE' };
  }
}

export function privilegedIssuanceRegisterWritable(registerDir: string): boolean {
  try {
    fs.accessSync(registerDir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function recordTrustedDispatchIssuance(
  env: NodeJS.ProcessEnv,
  input: {
    tokenRecord: LiveOpenDispatchTokenRecord;
    verifiedApproval: VerifiedHumanApprovalRecord;
  },
): { ok: true } | { ok: false; failure: TrustedDispatchProvenanceFailure } {
  const register = resolveDispatchIssuanceRegisterDir(env);
  if (!register.ok) return { ok: false, failure: register.failure };
  if (!privilegedIssuanceRegisterWritable(register.dir)) {
    return { ok: false, failure: 'PRIVILEGED_ISSUANCE_REGISTER_NOT_WRITABLE' };
  }
  const macKey = resolveDispatchIssuanceMacKey(env);
  if (!macKey.ok) return { ok: false, failure: macKey.failure };

  const window = approvalValidityWindow(input.verifiedApproval);
  const tokenDigest = computeDispatchTokenDigest(input.tokenRecord);
  const base: Omit<TrustedDispatchIssuanceRecordV1, 'mac'> = {
    v: 1,
    nonce: input.tokenRecord.nonce,
    approvalId: input.tokenRecord.approvalId,
    requiredSha: input.tokenRecord.requiredSha,
    requiredReleaseId: input.tokenRecord.requiredReleaseId,
    requiredEnvSha256: input.tokenRecord.requiredEnvSha256,
    reason: input.tokenRecord.reason,
    actor: input.tokenRecord.actor,
    validFromMs: window.validFromMs,
    validUntilMs: window.validUntilMs,
    issuedAtMs: input.tokenRecord.issuedAtMs,
    tokenDigest,
  };
  const record: TrustedDispatchIssuanceRecordV1 = {
    ...base,
    mac: computeIssuanceRecordMac(macKey.key, base),
  };
  const filePath = issuanceRecordPath(register.dir, record.nonce);
  try {
    const fd = fs.openSync(filePath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o440);
    try {
      fs.writeSync(fd, JSON.stringify(record), undefined, 'utf8');
    } finally {
      fs.closeSync(fd);
    }
    return { ok: true };
  } catch {
    return { ok: false, failure: 'TRUSTED_DISPATCH_ISSUANCE_RECORD_INVALID' };
  }
}

function verifyIssuanceRecordMac(
  macKey: string,
  record: TrustedDispatchIssuanceRecordV1,
): { ok: true } | { ok: false; failure: TrustedDispatchProvenanceFailure } {
  const expected = computeIssuanceRecordMac(macKey, {
    v: record.v,
    nonce: record.nonce,
    approvalId: record.approvalId,
    requiredSha: record.requiredSha,
    requiredReleaseId: record.requiredReleaseId,
    requiredEnvSha256: record.requiredEnvSha256,
    reason: record.reason,
    actor: record.actor,
    validFromMs: record.validFromMs,
    validUntilMs: record.validUntilMs,
    issuedAtMs: record.issuedAtMs,
    tokenDigest: record.tokenDigest,
  });
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(record.mac, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, failure: 'TRUSTED_DISPATCH_ISSUANCE_MAC_INVALID' };
    }
    return { ok: true };
  } catch {
    return { ok: false, failure: 'TRUSTED_DISPATCH_ISSUANCE_MAC_INVALID' };
  }
}

export function finalizeTrustedDispatchIssuanceSpendForLiveOpen(
  env: NodeJS.ProcessEnv,
  nonce: string,
): { ok: true } | { ok: false; failure: TrustedDispatchProvenanceFailure } {
  const register = resolveDispatchIssuanceRegisterDir(env);
  if (!register.ok) return { ok: false, failure: register.failure };
  return reserveDispatchIssuanceForLiveOpen(register.dir, nonce);
}

function reserveDispatchIssuanceForLiveOpen(
  registerDir: string,
  nonce: string,
): { ok: true } | { ok: false; failure: TrustedDispatchProvenanceFailure } {
  const spent = issuanceLiveOpenSpentPath(registerDir, nonce);
  if (fs.existsSync(spent)) {
    return { ok: false, failure: 'TRUSTED_DISPATCH_ISSUANCE_ALREADY_SPENT' };
  }
  try {
    const fd = fs.openSync(spent, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o400);
    try {
      fs.writeSync(fd, `${process.pid}\n${Date.now()}\n`, undefined, 'utf8');
    } finally {
      fs.closeSync(fd);
    }
    return { ok: true };
  } catch {
    if (fs.existsSync(spent)) {
      return { ok: false, failure: 'TRUSTED_DISPATCH_ISSUANCE_ALREADY_SPENT' };
    }
    return { ok: false, failure: 'TRUSTED_DISPATCH_ISSUANCE_RECORD_INVALID' };
  }
}

export function verifyTrustedDispatchProvenanceForLiveOpen(
  env: NodeJS.ProcessEnv,
  options?: { nowMs?: number; consumeIssuance?: boolean },
): { ok: true; token: LiveOpenDispatchTokenRecord } | { ok: false; failures: TrustedDispatchProvenanceFailure[] } {
  const failures: TrustedDispatchProvenanceFailure[] = [];
  const nowMs = options?.nowMs ?? Date.now();
  const consumeIssuance = options?.consumeIssuance ?? false;

  const tokenFile = (env[DI_S4_GATE6_LIVE_OPEN_DISPATCH_TOKEN_FILE_ENV] ?? '').trim();
  if (!tokenFile) failures.push('DISPATCH_TOKEN_FILE_MISSING');
  const signingKeyFile =
    (env.DI_S4_GATE6_DISPATCH_SIGNING_KEY_FILE ?? '').trim() || dispatchSigningKeySidecarPath(tokenFile);
  if (!tokenFile) {
    return { ok: false, failures };
  }

  const peeked = peekLiveOpenDispatchToken(tokenFile, { signingKeyFile, nowMs });
  if (!peeked.ok) {
    failures.push('DISPATCH_TOKEN_PEEK_FAILED');
    return { ok: false, failures };
  }
  const token = peeked.record;

  const approvalFile = (env[DI_S4_GATE6_LIVE_OPEN_HUMAN_APPROVAL_FILE_ENV] ?? '').trim();
  if (!approvalFile) failures.push('HUMAN_APPROVAL_FILE_MISSING');

  const pins = {
    requiredSha: env.DI_S4_TINY_STAGING_REQUIRED_SHA ?? '',
    requiredReleaseId: env.DI_S4_TINY_STAGING_REQUIRED_RELEASE_ID ?? '',
    requiredEnvSha256: env.DI_S4_TINY_STAGING_REQUIRED_PRE_ENV_SHA256 ?? '',
    reason: (env.DI_S4_GATE6_OPERATOR_REASON ?? '').trim(),
    actor: (env.DI_S4_GATE6_OPERATOR_ACTOR ?? '').trim(),
  };

  if (approvalFile) {
    const verified = loadAndVerifyHumanApprovalFile(env, pins, { nowMs });
    if (!verified.ok) {
      failures.push('HUMAN_APPROVAL_REVERIFY_FAILED');
    } else {
      const approvalId = approvalIdFromVerified(verified.verified);
      if (approvalId !== token.approvalId) failures.push('HUMAN_APPROVAL_TOKEN_MISMATCH');
      const window = approvalValidityWindow(verified.verified);
      if (verified.verified.scheme === 'ed25519-v2') {
        const v2 = verified.verified.record as Gate6HumanApprovalRecordV2;
        if (
          v2.requiredSha !== token.requiredSha ||
          v2.requiredReleaseId !== token.requiredReleaseId ||
          v2.requiredEnvSha256 !== token.requiredEnvSha256 ||
          v2.reason.trim() !== token.reason.trim() ||
          v2.actor.trim() !== token.actor.trim()
        ) {
          failures.push('HUMAN_APPROVAL_TOKEN_MISMATCH');
        }
      }
      if (nowMs < window.validFromMs || nowMs > window.validUntilMs) {
        failures.push('HUMAN_APPROVAL_REVERIFY_FAILED');
      }
    }
  }

  const consumptionResolved = resolveApprovalConsumptionRegisterDir(env);
  if (!consumptionResolved.ok || !isApprovalIdConsumed(consumptionResolved.dir, token.approvalId)) {
    failures.push('TRUSTED_DISPATCH_APPROVAL_NOT_CONSUMED');
  }

  const register = resolveDispatchIssuanceRegisterDir(env);
  if (!register.ok) {
    failures.push(register.failure);
  } else {
    const macKey = resolveDispatchIssuanceMacKey(env);
    if (!macKey.ok) {
      failures.push(macKey.failure);
    } else {
      const recordPath = issuanceRecordPath(register.dir, token.nonce);
      if (!fs.existsSync(recordPath)) {
        failures.push('TRUSTED_DISPATCH_ISSUANCE_RECORD_MISSING');
      } else {
        try {
          const parsed = JSON.parse(fs.readFileSync(recordPath, 'utf8')) as TrustedDispatchIssuanceRecordV1;
          const macOk = verifyIssuanceRecordMac(macKey.key, parsed);
          if (!macOk.ok) failures.push(macOk.failure);
          const digest = computeDispatchTokenDigest(token);
          if (parsed.tokenDigest !== digest) failures.push('TRUSTED_DISPATCH_ISSUANCE_DIGEST_MISMATCH');
          if (
            parsed.approvalId !== token.approvalId ||
            parsed.requiredSha !== token.requiredSha ||
            parsed.requiredReleaseId !== token.requiredReleaseId ||
            parsed.requiredEnvSha256 !== token.requiredEnvSha256 ||
            parsed.reason.trim() !== token.reason.trim() ||
            parsed.actor.trim() !== token.actor.trim() ||
            parsed.issuedAtMs !== token.issuedAtMs
          ) {
            failures.push('TRUSTED_DISPATCH_ISSUANCE_PINS_MISMATCH');
          }
          if (consumeIssuance && failures.length === 0) {
            const spent = reserveDispatchIssuanceForLiveOpen(register.dir, token.nonce);
            if (!spent.ok) failures.push(spent.failure);
          }
        } catch {
          failures.push('TRUSTED_DISPATCH_ISSUANCE_RECORD_INVALID');
        }
      }
    }
  }

  if (
    token.requiredSha !== pins.requiredSha ||
    token.requiredReleaseId !== pins.requiredReleaseId ||
    token.requiredEnvSha256 !== pins.requiredEnvSha256 ||
    token.reason.trim() !== pins.reason.trim() ||
    token.actor.trim() !== pins.actor.trim()
  ) {
    failures.push('DISPATCH_TOKEN_PINS_MISMATCH');
  }

  if (failures.length) return { ok: false, failures };
  return { ok: true, token };
}
