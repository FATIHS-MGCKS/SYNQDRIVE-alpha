import type { Prisma, RawRefuelCandidate, RawRefuelCandidateSignalChannel } from '@prisma/client';
import { RAW_REFUEL_CANDIDATE_NON_TERMINAL_LIFECYCLE_STATES } from './raw-refuel-candidate.constants';
import type { RawRefuelCandidateObservation } from './raw-refuel-candidate.types';

type TxClient = Prisma.TransactionClient;

export class RawRefuelCandidateRepository {
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
      candidateIdentityKey: string;
      evidenceRevisionFingerprint: string;
      observation: RawRefuelCandidateObservation;
      firstObservedAt: Date;
      lastObservedAt: Date;
    },
  ): Promise<RawRefuelCandidate> {
    const { observation } = data;
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
        physicalEvidenceStart: observation.physicalEvidenceStart ?? null,
        physicalEvidenceEnd: observation.physicalEvidenceEnd ?? null,
        riseOnsetAt: observation.riseOnsetAt ?? null,
        riseEndAt: observation.riseEndAt ?? null,
        preFuelAbsoluteLiters: observation.preFuelAbsoluteLiters ?? null,
        postFuelAbsoluteLiters: observation.postFuelAbsoluteLiters ?? null,
        deltaAbsoluteLiters: observation.deltaAbsoluteLiters ?? null,
        preFuelRelativePercent: observation.preFuelRelativePercent ?? null,
        postFuelRelativePercent: observation.postFuelRelativePercent ?? null,
        deltaRelativePercent: observation.deltaRelativePercent ?? null,
        prePlateauSampleCount: observation.prePlateauSampleCount ?? null,
        postPlateauSampleCount: observation.postPlateauSampleCount ?? null,
        totalSampleCount: observation.totalSampleCount ?? null,
        maxSampleGapSeconds: observation.maxSampleGapSeconds ?? null,
        absoluteSignalTrust: observation.absoluteSignalTrust ?? null,
        relativeSignalAvailable: observation.relativeSignalAvailable ?? null,
        routeEvidenceAvailable: observation.routeEvidenceAvailable ?? null,
        stationaryEvidenceAvailable: observation.stationaryEvidenceAvailable ?? null,
        scanWindowStart: observation.scanWindowStart ?? null,
        scanWindowEnd: observation.scanWindowEnd ?? null,
        signalProvider: observation.signalProvider ?? null,
        evidenceMeta: observation.evidenceMeta ?? undefined,
        qualityMeta: observation.qualityMeta ?? undefined,
        firstObservedAt: data.firstObservedAt,
        lastObservedAt: data.lastObservedAt,
      },
    });
  }

  async updateCandidateEvidence(
    tx: TxClient,
    existing: RawRefuelCandidate,
    data: {
      evidenceRevisionFingerprint: string;
      observation: RawRefuelCandidateObservation;
      lastObservedAt: Date;
      lifecycleState: RawRefuelCandidate['lifecycleState'];
    },
  ): Promise<RawRefuelCandidate> {
    const { observation } = data;
    return tx.rawRefuelCandidate.update({
      where: { id: existing.id },
      data: {
        lifecycleState: data.lifecycleState,
        rejectionReason: observation.rejectionReason ?? null,
        evidenceRevisionFingerprint: data.evidenceRevisionFingerprint,
        physicalEvidenceStart: minDate(existing.physicalEvidenceStart, observation.physicalEvidenceStart),
        physicalEvidenceEnd: maxDate(existing.physicalEvidenceEnd, observation.physicalEvidenceEnd),
        riseOnsetAt: minDate(existing.riseOnsetAt, observation.riseOnsetAt),
        riseEndAt: maxDate(existing.riseEndAt, observation.riseEndAt),
        preFuelAbsoluteLiters: observation.preFuelAbsoluteLiters ?? existing.preFuelAbsoluteLiters,
        postFuelAbsoluteLiters: observation.postFuelAbsoluteLiters ?? existing.postFuelAbsoluteLiters,
        deltaAbsoluteLiters: observation.deltaAbsoluteLiters ?? existing.deltaAbsoluteLiters,
        preFuelRelativePercent: observation.preFuelRelativePercent ?? existing.preFuelRelativePercent,
        postFuelRelativePercent: observation.postFuelRelativePercent ?? existing.postFuelRelativePercent,
        deltaRelativePercent: observation.deltaRelativePercent ?? existing.deltaRelativePercent,
        prePlateauSampleCount: observation.prePlateauSampleCount ?? existing.prePlateauSampleCount,
        postPlateauSampleCount: observation.postPlateauSampleCount ?? existing.postPlateauSampleCount,
        totalSampleCount: observation.totalSampleCount ?? existing.totalSampleCount,
        maxSampleGapSeconds: observation.maxSampleGapSeconds ?? existing.maxSampleGapSeconds,
        absoluteSignalTrust: observation.absoluteSignalTrust ?? existing.absoluteSignalTrust,
        relativeSignalAvailable:
          observation.relativeSignalAvailable ?? existing.relativeSignalAvailable,
        routeEvidenceAvailable:
          observation.routeEvidenceAvailable ?? existing.routeEvidenceAvailable,
        stationaryEvidenceAvailable:
          observation.stationaryEvidenceAvailable ?? existing.stationaryEvidenceAvailable,
        scanWindowStart: observation.scanWindowStart ?? existing.scanWindowStart,
        scanWindowEnd: observation.scanWindowEnd ?? existing.scanWindowEnd,
        signalProvider: observation.signalProvider ?? existing.signalProvider,
        evidenceMeta: observation.evidenceMeta ?? existing.evidenceMeta ?? undefined,
        qualityMeta: observation.qualityMeta ?? existing.qualityMeta ?? undefined,
        lastObservedAt: data.lastObservedAt,
      },
    });
  }
}

function minDate(current: Date | null, incoming: Date | null | undefined): Date | null {
  if (!incoming) return current;
  if (!current) return incoming;
  return incoming < current ? incoming : current;
}

function maxDate(current: Date | null, incoming: Date | null | undefined): Date | null {
  if (!incoming) return current;
  if (!current) return incoming;
  return incoming > current ? incoming : current;
}
