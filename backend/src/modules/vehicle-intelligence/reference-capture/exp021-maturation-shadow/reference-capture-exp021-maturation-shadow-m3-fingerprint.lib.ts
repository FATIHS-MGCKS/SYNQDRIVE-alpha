import { createHash } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import {
  captureCanonicalStateFingerprint,
  fingerprintDigest,
  fingerprintsIdentical,
  type Exp021MaturationShadowCanonicalFingerprint,
} from './reference-capture-exp021-maturation-shadow-canonical-fingerprint.lib';

export type Exp021MaturationShadowM3ScientificFingerprint = {
  windowFamilyCount: number;
  windowStratumCount: number;
  observationSlotCount: number;
  observationAttemptCount: number;
  windowFamilyIdsDigest: string;
  attemptIdsDigest: string;
};

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function captureM3ScientificFingerprint(
  prisma: PrismaClient,
  scope: { organizationId?: string; vehicleId?: string },
): Promise<Exp021MaturationShadowM3ScientificFingerprint> {
  const familyWhere =
    scope.organizationId && scope.vehicleId
      ? { organizationId: scope.organizationId, vehicleId: scope.vehicleId }
      : {};

  const [windowFamilyCount, windowStratumCount, observationSlotCount, observationAttemptCount] =
    await Promise.all([
      prisma.exp021MaturationShadowWindowFamily.count({ where: familyWhere }),
      prisma.exp021MaturationShadowWindow.count({
        where: familyWhere.organizationId
          ? { family: { organizationId: familyWhere.organizationId, vehicleId: familyWhere.vehicleId } }
          : {},
      }),
      prisma.exp021MaturationShadowObservationSlot.count({
        where: familyWhere.organizationId
          ? { stratum: { family: { organizationId: familyWhere.organizationId, vehicleId: familyWhere.vehicleId } } }
          : {},
      }),
      prisma.exp021MaturationShadowObservationAttempt.count({
        where: familyWhere.organizationId
          ? {
              slot: {
                stratum: { family: { organizationId: familyWhere.organizationId, vehicleId: familyWhere.vehicleId } },
              },
            }
          : {},
      }),
    ]);

  const families = await prisma.exp021MaturationShadowWindowFamily.findMany({
    where: familyWhere,
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  const attempts = await prisma.exp021MaturationShadowObservationAttempt.findMany({
    where: familyWhere.organizationId
      ? {
          slot: {
            stratum: { family: { organizationId: familyWhere.organizationId, vehicleId: familyWhere.vehicleId } },
          },
        }
      : {},
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  return {
    windowFamilyCount,
    windowStratumCount,
    observationSlotCount,
    observationAttemptCount,
    windowFamilyIdsDigest: sha256Hex(families.map((f) => f.id).join('|')),
    attemptIdsDigest: sha256Hex(attempts.map((a) => a.id).join('|')),
  };
}

export function m3ScientificFingerprintDigest(fingerprint: Exp021MaturationShadowM3ScientificFingerprint): string {
  return sha256Hex(JSON.stringify(fingerprint));
}

export function m3ScientificFingerprintsIdentical(
  left: Exp021MaturationShadowM3ScientificFingerprint,
  right: Exp021MaturationShadowM3ScientificFingerprint,
): boolean {
  return m3ScientificFingerprintDigest(left) === m3ScientificFingerprintDigest(right);
}

export async function proveM3ReadOnlyNonInterference(
  prisma: PrismaClient,
  scope: { organizationId: string; vehicleId: string },
  runAnalysis: () => Promise<unknown>,
): Promise<{
  canonicalBefore: Exp021MaturationShadowCanonicalFingerprint;
  canonicalAfter: Exp021MaturationShadowCanonicalFingerprint;
  scientificBefore: Exp021MaturationShadowM3ScientificFingerprint;
  scientificAfter: Exp021MaturationShadowM3ScientificFingerprint;
  canonicalStateIdentical: boolean;
  scientificStateIdentical: boolean;
}> {
  const canonicalBefore = await captureCanonicalStateFingerprint(prisma, scope);
  const scientificBefore = await captureM3ScientificFingerprint(prisma, scope);

  await runAnalysis();

  const canonicalAfter = await captureCanonicalStateFingerprint(prisma, scope);
  const scientificAfter = await captureM3ScientificFingerprint(prisma, scope);

  return {
    canonicalBefore,
    canonicalAfter,
    scientificBefore,
    scientificAfter,
    canonicalStateIdentical: fingerprintsIdentical(canonicalBefore, canonicalAfter),
    scientificStateIdentical: m3ScientificFingerprintsIdentical(scientificBefore, scientificAfter),
  };
}

export { fingerprintDigest };
