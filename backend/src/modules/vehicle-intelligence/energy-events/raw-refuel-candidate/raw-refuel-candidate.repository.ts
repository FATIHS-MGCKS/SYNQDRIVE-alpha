import type { Prisma, RawRefuelCandidate, RawRefuelCandidateSignalChannel } from '@prisma/client';
import {
  RAW_REFUEL_CANDIDATE_NON_TERMINAL_LIFECYCLE_STATES,
  RAW_REFUEL_CANDIDATE_TERMINAL_LIFECYCLE_STATES,
} from './raw-refuel-candidate.constants';
import type { MergedRawRefuelCandidateEvidence } from './raw-refuel-candidate-evidence-merge';
import {
  RawRefuelCandidateOrgVehicleIntegrityError,
  RawRefuelCandidateVehicleNotFoundError,
} from './raw-refuel-candidate.errors';
import type { RawRefuelCandidateObservation } from './raw-refuel-candidate.types';

type TxClient = Prisma.TransactionClient;

export class RawRefuelCandidateRepository {
  async resolveAuthoritativeOrganizationId(
    tx: TxClient,
    vehicleId: string,
    assertedOrganizationId?: string,
  ): Promise<string> {
    const vehicle = await tx.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true, organizationId: true },
    });
    if (!vehicle) {
      throw new RawRefuelCandidateVehicleNotFoundError(vehicleId);
    }
    if (assertedOrganizationId && assertedOrganizationId !== vehicle.organizationId) {
      throw new RawRefuelCandidateOrgVehicleIntegrityError(
        vehicleId,
        vehicle.organizationId,
        assertedOrganizationId,
      );
    }
    return vehicle.organizationId;
  }

  async findByIdentityKey(
    tx: TxClient,
    vehicleId: string,
    candidateIdentityKey: string,
  ): Promise<RawRefuelCandidate | null> {
    return tx.rawRefuelCandidate.findUnique({
      where: {
        vehicleId_candidateIdentityKey: {
          vehicleId,
          candidateIdentityKey,
        },
      },
    });
  }

  async findNonTerminalByVehicle(
    tx: TxClient,
    vehicleId: string,
    signalChannel: RawRefuelCandidateSignalChannel,
  ): Promise<RawRefuelCandidate[]> {
    return tx.rawRefuelCandidate.findMany({
      where: {
        vehicleId,
        signalChannel,
        lifecycleState: { in: [...RAW_REFUEL_CANDIDATE_NON_TERMINAL_LIFECYCLE_STATES] },
      },
      orderBy: [{ firstObservedAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findTerminalByVehicle(
    tx: TxClient,
    vehicleId: string,
    signalChannel: RawRefuelCandidateSignalChannel,
  ): Promise<RawRefuelCandidate[]> {
    return tx.rawRefuelCandidate.findMany({
      where: {
        vehicleId,
        signalChannel,
        lifecycleState: { in: [...RAW_REFUEL_CANDIDATE_TERMINAL_LIFECYCLE_STATES] },
      },
      orderBy: [{ firstObservedAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findById(tx: TxClient, id: string): Promise<RawRefuelCandidate | null> {
    return tx.rawRefuelCandidate.findUnique({ where: { id } });
  }

  async countByVehicle(tx: TxClient, vehicleId: string): Promise<number> {
    return tx.rawRefuelCandidate.count({ where: { vehicleId } });
  }

  async createCandidate(
    tx: TxClient,
    data: {
      organizationId: string;
      vehicleId: string;
      candidateIdentityKey: string | null;
      evidenceRevisionFingerprint: string;
      observation: RawRefuelCandidateObservation;
      mergedEvidence: MergedRawRefuelCandidateEvidence;
      firstObservedAt: Date;
      lastObservedAt: Date;
    },
  ): Promise<RawRefuelCandidate> {
    const { observation, mergedEvidence } = data;
    return tx.rawRefuelCandidate.create({
      data: {
        organizationId: data.organizationId,
        vehicleId: data.vehicleId,
        candidateIdentityKey: data.candidateIdentityKey,
        detectionVersion: observation.detectionVersion,
        detectorVersion: observation.detectorVersion,
        signalChannel: observation.signalChannel,
        lifecycleState: observation.lifecycleState,
        rejectionReason: observation.rejectionReason ?? null,
        evidenceRevisionFingerprint: data.evidenceRevisionFingerprint,
        physicalEvidenceStart: mergedEvidence.physicalEvidenceStart,
        physicalEvidenceEnd: mergedEvidence.physicalEvidenceEnd,
        riseOnsetAt: mergedEvidence.riseOnsetAt,
        riseEndAt: mergedEvidence.riseEndAt,
        preFuelAbsoluteLiters: mergedEvidence.preFuelAbsoluteLiters,
        postFuelAbsoluteLiters: mergedEvidence.postFuelAbsoluteLiters,
        deltaAbsoluteLiters: mergedEvidence.deltaAbsoluteLiters,
        preFuelRelativePercent: mergedEvidence.preFuelRelativePercent,
        postFuelRelativePercent: mergedEvidence.postFuelRelativePercent,
        deltaRelativePercent: mergedEvidence.deltaRelativePercent,
        prePlateauSampleCount: mergedEvidence.prePlateauSampleCount,
        postPlateauSampleCount: mergedEvidence.postPlateauSampleCount,
        totalSampleCount: mergedEvidence.totalSampleCount,
        maxSampleGapSeconds: mergedEvidence.maxSampleGapSeconds,
        absoluteSignalTrust: mergedEvidence.absoluteSignalTrust,
        relativeSignalAvailable: mergedEvidence.relativeSignalAvailable,
        routeEvidenceAvailable: mergedEvidence.routeEvidenceAvailable,
        stationaryEvidenceAvailable: mergedEvidence.stationaryEvidenceAvailable,
        scanWindowStart: mergedEvidence.scanWindowStart,
        scanWindowEnd: mergedEvidence.scanWindowEnd,
        signalProvider: mergedEvidence.signalProvider,
        evidenceMeta: (mergedEvidence.evidenceMeta ?? undefined) as Prisma.InputJsonValue | undefined,
        qualityMeta: (mergedEvidence.qualityMeta ?? undefined) as Prisma.InputJsonValue | undefined,
        firstObservedAt: data.firstObservedAt,
        lastObservedAt: data.lastObservedAt,
      },
    });
  }

  async updateCandidateEvidence(
    tx: TxClient,
    existing: RawRefuelCandidate,
    data: {
      candidateIdentityKey: string | null;
      evidenceRevisionFingerprint: string;
      mergedEvidence: MergedRawRefuelCandidateEvidence;
      lastObservedAt: Date;
      lifecycleState: RawRefuelCandidate['lifecycleState'];
      rejectionReason: RawRefuelCandidate['rejectionReason'];
    },
  ): Promise<RawRefuelCandidate> {
    const { mergedEvidence } = data;
    return tx.rawRefuelCandidate.update({
      where: { id: existing.id },
      data: {
        candidateIdentityKey: data.candidateIdentityKey,
        lifecycleState: data.lifecycleState,
        rejectionReason: data.rejectionReason,
        evidenceRevisionFingerprint: data.evidenceRevisionFingerprint,
        physicalEvidenceStart: mergedEvidence.physicalEvidenceStart,
        physicalEvidenceEnd: mergedEvidence.physicalEvidenceEnd,
        riseOnsetAt: mergedEvidence.riseOnsetAt,
        riseEndAt: mergedEvidence.riseEndAt,
        preFuelAbsoluteLiters: mergedEvidence.preFuelAbsoluteLiters,
        postFuelAbsoluteLiters: mergedEvidence.postFuelAbsoluteLiters,
        deltaAbsoluteLiters: mergedEvidence.deltaAbsoluteLiters,
        preFuelRelativePercent: mergedEvidence.preFuelRelativePercent,
        postFuelRelativePercent: mergedEvidence.postFuelRelativePercent,
        deltaRelativePercent: mergedEvidence.deltaRelativePercent,
        prePlateauSampleCount: mergedEvidence.prePlateauSampleCount,
        postPlateauSampleCount: mergedEvidence.postPlateauSampleCount,
        totalSampleCount: mergedEvidence.totalSampleCount,
        maxSampleGapSeconds: mergedEvidence.maxSampleGapSeconds,
        absoluteSignalTrust: mergedEvidence.absoluteSignalTrust,
        relativeSignalAvailable: mergedEvidence.relativeSignalAvailable,
        routeEvidenceAvailable: mergedEvidence.routeEvidenceAvailable,
        stationaryEvidenceAvailable: mergedEvidence.stationaryEvidenceAvailable,
        scanWindowStart: mergedEvidence.scanWindowStart,
        scanWindowEnd: mergedEvidence.scanWindowEnd,
        signalProvider: mergedEvidence.signalProvider,
        evidenceMeta: (mergedEvidence.evidenceMeta ?? undefined) as Prisma.InputJsonValue | undefined,
        qualityMeta: (mergedEvidence.qualityMeta ?? undefined) as Prisma.InputJsonValue | undefined,
        lastObservedAt: data.lastObservedAt,
      },
    });
  }

  async touchLastObservedAt(
    tx: TxClient,
    existing: RawRefuelCandidate,
    lastObservedAt: Date,
  ): Promise<RawRefuelCandidate> {
    return tx.rawRefuelCandidate.update({
      where: { id: existing.id },
      data: { lastObservedAt },
    });
  }
}
