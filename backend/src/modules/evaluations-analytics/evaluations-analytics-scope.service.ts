import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessService } from '@shared/stations/station-access.service';
import type { EvaluationsPeriodWindow } from '@synq/evaluations-periods/evaluations-period.contract';
import type { EvaluationsAuthorizedAnalyticsScope } from '@synq/evaluations-analytics/evaluations-analytics.contract';

export interface EvaluationsAnalyticsActor {
  readonly id?: string;
  readonly organizationId?: string | null;
  readonly platformRole?: string | null;
}

export interface ResolveAuthorizedScopeInput {
  readonly actor: EvaluationsAnalyticsActor;
  /** Organization already authorized by OrgScopingGuard (the `:orgId` route param). */
  readonly orgId: string;
  /** Requested station narrowing. `null` = all stations the actor may read. */
  readonly requestedStationIds: readonly string[] | null;
  readonly period: EvaluationsPeriodWindow;
}

/**
 * Resolves the server-authorized analytics scope. Client-supplied ids are only
 * a request; authorization derives from the actor's central tenant/station
 * scope. Any requested station that is not both org-owned and within the actor's
 * station scope fails the whole request closed.
 */
@Injectable()
export class EvaluationsAnalyticsScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stationAccess: StationAccessService,
  ) {}

  async resolveAuthorizedScope(
    input: ResolveAuthorizedScopeInput,
  ): Promise<EvaluationsAuthorizedAnalyticsScope> {
    const { actor, orgId, requestedStationIds, period } = input;

    const access = await this.stationAccess.resolve(actor.id, orgId);
    const bypass = access.bypassScope || access.allowedStationIds === null;

    if (requestedStationIds === null) {
      // No explicit station narrowing: use the actor's full authorized station scope.
      return {
        organizationId: orgId,
        stationIds: bypass ? null : [...(access.allowedStationIds ?? [])],
        stationScoped: !bypass,
        period,
      };
    }

    if (requestedStationIds.length === 0) {
      // Explicit empty selection is a well-defined empty scope (fail-closed read).
      return {
        organizationId: orgId,
        stationIds: [],
        stationScoped: true,
        period,
      };
    }

    // Explicit stations must belong to the organization AND be within actor scope.
    const owned = await this.prisma.station.findMany({
      where: { organizationId: orgId, id: { in: [...requestedStationIds] } },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((s) => s.id));

    for (const stationId of requestedStationIds) {
      if (!ownedIds.has(stationId)) {
        // Foreign or unknown station: fail closed without leaking existence.
        throw new ForbiddenException('Requested station is outside the authorized scope');
      }
      if (!bypass && !(access.allowedStationIds ?? []).includes(stationId)) {
        throw new ForbiddenException('Requested station is outside the authorized scope');
      }
    }

    return {
      organizationId: orgId,
      stationIds: [...requestedStationIds],
      stationScoped: true,
      period,
    };
  }
}
