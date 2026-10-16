import { Injectable } from '@nestjs/common';
import type { BatteryMeasurementSession } from '@prisma/client';

export type LvRestCanonicalAnchorMeasurementSession = Pick<
  BatteryMeasurementSession,
  | 'organizationId'
  | 'vehicleId'
  | 'startedAt'
  | 'tripId'
  | 'sourceEntityType'
  | 'sourceEntityId'
>;
import { PrismaService } from '@shared/database/prisma.service';
import { TRIP_ASSOCIATION_ANCHOR_TOLERANCE_MS } from '../generalized-evidence/generalized-evidence.constants';
import {
  LV_REST_TARGET_CANONICAL_SESSION_STATUSES,
  resolveLvRestCanonicalTargetAnchor,
  type ResolveLvRestCanonicalTargetAnchorResult,
} from './lv-rest-canonical-target-anchor.policy';

const CANONICAL_REST_SESSION_CANDIDATE_LIMIT = 50;

@Injectable()
export class LvRestCanonicalTargetAnchorResolverService {
  constructor(private readonly prisma: PrismaService) {}

  resolveLinkedTripId(session: LvRestCanonicalAnchorMeasurementSession): string | null {
    if (session.tripId) {
      return session.tripId;
    }
    if (session.sourceEntityType === 'trip' && session.sourceEntityId) {
      return session.sourceEntityId;
    }
    return null;
  }

  async resolveForMeasurementSession(
    session: LvRestCanonicalAnchorMeasurementSession,
  ): Promise<ResolveLvRestCanonicalTargetAnchorResult> {
    const linkedTripId = this.resolveLinkedTripId(session);
    const candidates = await this.loadCanonicalCandidates({
      organizationId: session.organizationId,
      vehicleId: session.vehicleId,
      measurementSessionStartedAt: session.startedAt,
      linkedTripId,
    });
    return resolveLvRestCanonicalTargetAnchor({
      organizationId: session.organizationId,
      vehicleId: session.vehicleId,
      measurementSessionStartedAt: session.startedAt,
      linkedTripId,
      candidates,
    });
  }

  async resolveRestWindowStartedAt(
    session: LvRestCanonicalAnchorMeasurementSession,
  ): Promise<Date> {
    const resolution = await this.resolveForMeasurementSession(session);
    return resolution.restWindowStartedAt;
  }

  private async loadCanonicalCandidates(input: {
    organizationId: string;
    vehicleId: string;
    measurementSessionStartedAt: Date;
    linkedTripId: string | null;
  }) {
    const toleranceMs = TRIP_ASSOCIATION_ANCHOR_TOLERANCE_MS;
    const anchorMs = input.measurementSessionStartedAt.getTime();

    if (input.linkedTripId) {
      return this.prisma.batteryRestSession.findMany({
        where: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          sessionStatus: { in: LV_REST_TARGET_CANONICAL_SESSION_STATUSES },
          OR: [
            { confirmedTripId: input.linkedTripId },
            { candidateTripId: input.linkedTripId },
          ],
        },
        select: {
          id: true,
          organizationId: true,
          vehicleId: true,
          anchorAt: true,
          sessionStatus: true,
          confirmedTripId: true,
          candidateTripId: true,
        },
        orderBy: [{ anchorAt: 'asc' }, { id: 'asc' }],
        take: CANONICAL_REST_SESSION_CANDIDATE_LIMIT,
      });
    }

    return this.prisma.batteryRestSession.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        sessionStatus: { in: LV_REST_TARGET_CANONICAL_SESSION_STATUSES },
        anchorAt: {
          gte: new Date(anchorMs - toleranceMs),
          lte: new Date(anchorMs + toleranceMs),
        },
      },
      select: {
        id: true,
        organizationId: true,
        vehicleId: true,
        anchorAt: true,
        sessionStatus: true,
        confirmedTripId: true,
        candidateTripId: true,
      },
      orderBy: [{ anchorAt: 'asc' }, { id: 'asc' }],
      take: CANONICAL_REST_SESSION_CANDIDATE_LIMIT,
    });
  }
}
