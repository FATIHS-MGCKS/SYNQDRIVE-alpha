import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  EvaluationsPeriodType,
  EvaluationsPeriodWindow,
} from '@synq/evaluations-periods/evaluations-period.contract';
import type { EvaluationsAuthorizedAnalyticsScope } from '@synq/evaluations-analytics/evaluations-analytics.contract';
import {
  resolveEvaluationsPeriod,
  resolveEvaluationsTimezone,
} from '@modules/evaluations-metrics/evaluations-period.resolver';
import {
  resolveEvaluationsAuthorizedStationScope,
  type EvaluationsAuthorizedStationScope,
} from './evaluations-analytics-station-scope';

export interface EvaluationsAnalyticsActor {
  readonly id?: string;
  readonly organizationId?: string | null;
  readonly platformRole?: string | null;
}

export interface ResolveAuthorizedScopeInput {
  readonly actor: EvaluationsAnalyticsActor;
  /** Organization already authorized by OrgScopingGuard (the `:orgId` route param). */
  readonly orgId: string;
  /** Requested station narrowing. `null` = the actor's full authorized station scope. */
  readonly requestedStationIds: readonly string[] | null;
  readonly periodType: EvaluationsPeriodType;
  readonly reference?: Date;
}

/**
 * Resolves the server-authorized analytics scope, including the canonical
 * business timezone/period. Station authorization is derived from the actor's
 * canonical role/membership scope (flag-independent — the Stations-V2 flag never
 * widens it). Requested stations must be org-owned AND within the actor's
 * authorized station scope; any violation fails the whole request closed.
 */
@Injectable()
export class EvaluationsAnalyticsScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveAuthorizedScope(
    input: ResolveAuthorizedScopeInput,
  ): Promise<EvaluationsAuthorizedAnalyticsScope> {
    const { actor, orgId, requestedStationIds, periodType } = input;

    const authorized = await this.resolveActorStationScope(actor, orgId);

    let stationIds: readonly string[] | null;
    let stationScoped: boolean;

    if (requestedStationIds === null) {
      if (authorized.mode === 'ALL_STATIONS') {
        stationIds = null;
        stationScoped = false;
      } else {
        // ASSIGNED_STATIONS → exactly the assigned stations; NO_STATIONS → empty.
        stationIds = [...(authorized.stationIds ?? [])];
        stationScoped = true;
      }
    } else if (requestedStationIds.length === 0) {
      stationIds = [];
      stationScoped = true;
    } else {
      await this.assertStationsAuthorized(orgId, requestedStationIds, authorized);
      stationIds = [...requestedStationIds];
      stationScoped = true;
    }

    const period = await this.resolvePeriod(orgId, stationIds, periodType, input.reference);
    return { organizationId: orgId, stationIds, stationScoped, period };
  }

  private async resolveActorStationScope(
    actor: EvaluationsAnalyticsActor,
    orgId: string,
  ): Promise<EvaluationsAuthorizedStationScope> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: actor.id, organizationId: orgId, status: 'ACTIVE' },
      select: {
        role: true,
        status: true,
        permissions: true,
        stationScope: true,
        stationIds: true,
        fieldAgentAccess: true,
        membershipVersion: true,
        organizationRoleId: true,
      },
    });
    return resolveEvaluationsAuthorizedStationScope({
      platformRole: actor.platformRole,
      membership: membership ?? null,
      organizationId: orgId,
    });
  }

  private async assertStationsAuthorized(
    orgId: string,
    requestedStationIds: readonly string[],
    authorized: EvaluationsAuthorizedStationScope,
  ): Promise<void> {
    // Every requested station must be organization-owned (tenant boundary).
    const owned = await this.prisma.station.findMany({
      where: { organizationId: orgId, id: { in: [...requestedStationIds] } },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((s) => s.id));
    const assigned =
      authorized.mode === 'ASSIGNED_STATIONS' ? new Set(authorized.stationIds ?? []) : null;

    for (const stationId of requestedStationIds) {
      if (!ownedIds.has(stationId)) {
        throw new ForbiddenException('Requested station is outside the authorized scope');
      }
      if (authorized.mode === 'NO_STATIONS') {
        throw new ForbiddenException('Requested station is outside the authorized scope');
      }
      if (assigned && !assigned.has(stationId)) {
        throw new ForbiddenException('Requested station is outside the authorized scope');
      }
    }
  }

  /**
   * Resolves the canonical business period using the real organization and
   * (when a single station is authorized) station timezone. No user/browser
   * timezone is ever an input.
   */
  private async resolvePeriod(
    orgId: string,
    stationIds: readonly string[] | null,
    periodType: EvaluationsPeriodType,
    reference: Date | undefined,
  ): Promise<EvaluationsPeriodWindow> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { timezone: true },
    });

    let stationTimezone: string | null = null;
    const hasUniqueStationScope = stationIds !== null && stationIds.length === 1;
    if (hasUniqueStationScope) {
      const station = await this.prisma.station.findFirst({
        where: { id: stationIds[0], organizationId: orgId },
        select: { timezone: true },
      });
      stationTimezone = station?.timezone ?? null;
    }

    const timezone = resolveEvaluationsTimezone({
      organizationTimezone: organization?.timezone ?? null,
      stationTimezone,
      hasUniqueStationScope,
    });

    return resolveEvaluationsPeriod({
      periodType,
      reference: reference ?? new Date(),
      timezone,
    });
  }
}
