import { createHash } from 'node:crypto';
import type { MasterDimoRegistrationInput } from './master-dimo-registration.types';

const FINGERPRINT_V1_PREFIX = 'v1:';

function stableNormalize(value: unknown): unknown {
  if (value == null) return null;
  if (Array.isArray(value)) {
    return value.map(stableNormalize);
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const v = obj[key];
      if (v === undefined) continue;
      out[key] = stableNormalize(v);
    }
    return out;
  }
  return value;
}

/** Canonical fingerprint of Master register-from-dimo payload (excludes org/dimo identity). */
export function computeMasterDimoRegistrationPayloadFingerprint(
  input: MasterDimoRegistrationInput,
): string {
  const payload = stableNormalize({
    stationId: input.stationId,
    extraData: input.extraData ?? null,
    manualSpecs: input.manualSpecs ?? null,
    actorUserId: input.actorUserId,
  });
  const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return `${FINGERPRINT_V1_PREFIX}${digest}`;
}

export function readMasterDimoPayloadFingerprintFromReadinessSnapshot(
  readinessSnapshotJson: unknown,
): string | null {
  if (!readinessSnapshotJson || typeof readinessSnapshotJson !== 'object' || Array.isArray(readinessSnapshotJson)) {
    return null;
  }
  const fp = (readinessSnapshotJson as { masterDimoPayloadFingerprintV1?: unknown })
    .masterDimoPayloadFingerprintV1;
  return typeof fp === 'string' && fp.startsWith(FINGERPRINT_V1_PREFIX) ? fp : null;
}

export async function persistMasterDimoPayloadFingerprintOnCase(
  prisma: { vehicleOnboardingCase: { findUniqueOrThrow: Function; update: Function } },
  caseId: string,
  fingerprint: string,
): Promise<void> {
  const row = await prisma.vehicleOnboardingCase.findUniqueOrThrow({
    where: { id: caseId },
    select: { readinessSnapshotJson: true },
  });
  const snap = row.readinessSnapshotJson;
  const base =
    snap && typeof snap === 'object' && !Array.isArray(snap)
      ? { ...(snap as Record<string, unknown>) }
      : {};
  base.masterDimoPayloadFingerprintV1 = fingerprint;
  await prisma.vehicleOnboardingCase.update({
    where: { id: caseId },
    data: { readinessSnapshotJson: base },
  });
}
