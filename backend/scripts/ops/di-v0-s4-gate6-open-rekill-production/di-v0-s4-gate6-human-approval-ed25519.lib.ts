import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'crypto';

export const GATE6_HUMAN_APPROVAL_ED25519_ALGORITHM = 'ed25519';

export interface Gate6HumanApprovalRecordV2 {
  v: 2;
  approvalId: string;
  actor: string;
  reason: string;
  requiredSha: string;
  requiredReleaseId: string;
  requiredEnvSha256: string;
  validFromMs: number;
  validUntilMs: number;
  signature: string;
}

export type Ed25519ApprovalFailure =
  | 'HUMAN_APPROVAL_PARSE_INVALID'
  | 'HUMAN_APPROVAL_ED25519_PUBLIC_KEY_MISSING'
  | 'HUMAN_APPROVAL_ED25519_PUBLIC_KEY_UNREADABLE'
  | 'HUMAN_APPROVAL_ED25519_SIGNATURE_INVALID'
  | 'HUMAN_APPROVAL_PINS_MISMATCH'
  | 'HUMAN_APPROVAL_AUDIT_MISMATCH'
  | 'HUMAN_APPROVAL_VALIDITY_WINDOW_INVALID'
  | 'HUMAN_APPROVAL_VALIDITY_WINDOW_EXPIRED'
  | 'HUMAN_APPROVAL_VALIDITY_WINDOW_NOT_YET_VALID';

export function buildGate6HumanApprovalV2Payload(
  input: Omit<Gate6HumanApprovalRecordV2, 'signature'>,
): Buffer {
  const canonical = [
    String(input.v),
    input.approvalId,
    input.actor.trim(),
    input.reason.trim(),
    input.requiredSha,
    input.requiredReleaseId,
    input.requiredEnvSha256,
    String(input.validFromMs),
    String(input.validUntilMs),
  ].join('\0');
  return Buffer.from(canonical, 'utf8');
}

/** Engineering / offline-signer only — never ship private key material to Production. */
export function signGate6HumanApprovalRecordV2(
  privateKeyPem: string,
  input: Omit<Gate6HumanApprovalRecordV2, 'signature' | 'v'>,
): Gate6HumanApprovalRecordV2 {
  const base: Omit<Gate6HumanApprovalRecordV2, 'signature'> = { v: 2, ...input };
  if (base.validUntilMs <= base.validFromMs) {
    throw new Error('HUMAN_APPROVAL_VALIDITY_WINDOW_INVALID');
  }
  const privateKey = createPrivateKey(privateKeyPem);
  const payload = buildGate6HumanApprovalV2Payload(base);
  const signature = sign(null, payload, privateKey);
  return { ...base, signature: signature.toString('base64') };
}

export function verifyGate6HumanApprovalRecordV2(
  publicKeyPem: string,
  record: Gate6HumanApprovalRecordV2,
  pins: {
    requiredSha: string;
    requiredReleaseId: string;
    requiredEnvSha256: string;
    reason: string;
    actor: string;
  },
  nowMs: number = Date.now(),
): { ok: true } | { ok: false; failures: Ed25519ApprovalFailure[] } {
  const failures: Ed25519ApprovalFailure[] = [];
  if (record.v !== 2 || !record.approvalId || !record.signature) {
    failures.push('HUMAN_APPROVAL_PARSE_INVALID');
    return { ok: false, failures };
  }
  if (record.validUntilMs <= record.validFromMs) {
    failures.push('HUMAN_APPROVAL_VALIDITY_WINDOW_INVALID');
  }
  if (nowMs < record.validFromMs) {
    failures.push('HUMAN_APPROVAL_VALIDITY_WINDOW_NOT_YET_VALID');
  }
  if (nowMs > record.validUntilMs) {
    failures.push('HUMAN_APPROVAL_VALIDITY_WINDOW_EXPIRED');
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

  let publicKey;
  try {
    publicKey = createPublicKey(publicKeyPem);
  } catch {
    failures.push('HUMAN_APPROVAL_ED25519_PUBLIC_KEY_UNREADABLE');
    return { ok: false, failures };
  }

  let signatureBuf: Buffer;
  try {
    signatureBuf = Buffer.from(record.signature, 'base64');
  } catch {
    failures.push('HUMAN_APPROVAL_ED25519_SIGNATURE_INVALID');
    return { ok: false, failures };
  }

  const payload = buildGate6HumanApprovalV2Payload({
    v: record.v,
    approvalId: record.approvalId,
    actor: record.actor,
    reason: record.reason,
    requiredSha: record.requiredSha,
    requiredReleaseId: record.requiredReleaseId,
    requiredEnvSha256: record.requiredEnvSha256,
    validFromMs: record.validFromMs,
    validUntilMs: record.validUntilMs,
  });

  const valid = verify(null, payload, publicKey, signatureBuf);
  if (!valid) {
    failures.push('HUMAN_APPROVAL_ED25519_SIGNATURE_INVALID');
  }

  return failures.length ? { ok: false, failures } : { ok: true };
}

/** Test / offline-signer helper — not for Production runtime. */
export function generateGate6Ed25519FixtureKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}
