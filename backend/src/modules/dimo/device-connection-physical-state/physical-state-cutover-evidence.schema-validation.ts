import { createRequire } from 'node:module';
import * as path from 'node:path';
import type { PhysicalAuthorityScope } from './device-connection-physical-authority-cutover.repository';
import type {
  PhysicalStateCutoverEvidencePayloadV1,
  SignedPhysicalStateCutoverEvidenceBundle,
} from './physical-state-cutover-evidence.types';

const nodeRequire = createRequire(__filename);
const opsLib = nodeRequire(path.join(__dirname, 'physical-state-cutover-evidence.ops-lib.cjs')) as {
  validateCutoverEvidenceManifest: (
    payload: unknown,
    options?: { enforceWallClock?: boolean; nowMs?: number },
  ) => { ok: true } | { ok: false; errors: string[] };
};

function scopesEqual(a: PhysicalAuthorityScope, b: PhysicalAuthorityScope): boolean {
  return (
    a.organizationId === b.organizationId &&
    a.vehicleId === b.vehicleId &&
    a.provider === b.provider
  );
}

export function validateSignedCutoverEvidencePayloadShape(
  payload: unknown,
): { ok: true; payload: PhysicalStateCutoverEvidencePayloadV1 } | { ok: false; errors: string[] } {
  const result = opsLib.validateCutoverEvidenceManifest(payload, { enforceWallClock: false });
  if (!result.ok) {
    return { ok: false, errors: result.errors };
  }

  const typed = payload as PhysicalStateCutoverEvidencePayloadV1;
  const scope = typed.scope;
  const targetApproval = typed.targetApproval;
  if (!targetApproval?.scope || !scopesEqual(targetApproval.scope, scope)) {
    return { ok: false, errors: ['target_approval_scope_mismatch'] };
  }
  const preseed = typed.preseedRevalidation;
  if (!preseed?.scope || !scopesEqual(preseed.scope, scope)) {
    return { ok: false, errors: ['preseed_scope_mismatch'] };
  }

  return { ok: true, payload: typed };
}

export function isSignedBundleEnvelopeShape(
  value: unknown,
): value is SignedPhysicalStateCutoverEvidenceBundle {
  if (!value || typeof value !== 'object') return false;
  const bundle = value as SignedPhysicalStateCutoverEvidenceBundle;
  return (
    typeof bundle.schemaVersion === 'string' &&
    typeof bundle.algorithm === 'string' &&
    typeof bundle.keyId === 'string' &&
    typeof bundle.signature === 'string' &&
    bundle.payload !== null &&
    typeof bundle.payload === 'object'
  );
}
