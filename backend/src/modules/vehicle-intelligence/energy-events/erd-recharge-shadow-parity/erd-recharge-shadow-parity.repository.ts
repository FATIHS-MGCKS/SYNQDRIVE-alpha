import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Prisma as PrismaNamespace } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ERD_RECHARGE_SHADOW_COMPARATOR_VERSION } from './erd-recharge-shadow-parity.constants';
import type { ErdRechargeShadowObservationDraft } from './erd-recharge-shadow-parity.types';

@Injectable()
export class ErdRechargeShadowParityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertObservation(
    draft: ErdRechargeShadowObservationDraft,
    evaluatedAt: Date,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<'created' | 'updated' | 'deduped'> {
    const existing = await tx.erdRechargeProjectionShadowObservation.findUnique({
      where: { comparisonFingerprint: draft.comparisonFingerprint },
    });
    const data = {
      organizationId: draft.organizationId,
      vehicleId: draft.vehicleId,
      canonicalChargeSessionId: draft.canonicalChargeSessionId,
      legacyVehicleEnergyEventId: draft.legacyVehicleEnergyEventId,
      comparatorVersion: ERD_RECHARGE_SHADOW_COMPARATOR_VERSION,
      pairingEvidence: draft.pairingEvidence,
      parityClass: draft.parityClass,
      finality: draft.finality,
      canonicalProjectionSnapshot:
        draft.canonicalProjectionSnapshot as unknown as Prisma.InputJsonValue,
      legacyProjectionSnapshot:
        draft.legacyProjectionSnapshot as unknown as Prisma.InputJsonValue,
      fieldDiff: draft.fieldDiff as unknown as Prisma.InputJsonValue,
      evaluatedAt,
    };
    if (existing == null) {
      try {
        await tx.erdRechargeProjectionShadowObservation.create({
          data: {
            ...data,
            comparisonFingerprint: draft.comparisonFingerprint,
          },
        });
        return 'created';
      } catch (error) {
        if (
          error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          return 'deduped';
        }
        throw error;
      }
    }
    const unchanged =
      existing.parityClass === draft.parityClass &&
      existing.finality === draft.finality &&
      existing.pairingEvidence === draft.pairingEvidence;
    if (unchanged) {
      return 'deduped';
    }
    await tx.erdRechargeProjectionShadowObservation.update({
      where: { id: existing.id },
      data,
    });
    return 'updated';
  }
}
