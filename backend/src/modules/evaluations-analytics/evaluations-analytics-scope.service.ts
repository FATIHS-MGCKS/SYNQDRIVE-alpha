import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessService } from '@shared/stations/station-access.service';
import type {
  EvaluationsPeriodType,
  EvaluationsPeriodWindow,
} from '@synq/evaluations-periods/evaluations-period.contract';
import type { EvaluationsAuthorizedAnalyticsScope } from '@synq/evaluations-analytics/evaluations-analytics.contract';
import {
  resolveEvaluationsPeriod,
  resolveEvaluationsTimezone,
} from '@modules/evaluations-metrics/evaluations-period.resolver';

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
  readonly periodType: EvaluationsPeriodType;
  readonly reference?: Date;
}

/**
 * Resolves the server-authorized analytics scope, including the canonical
 * business timezone/period. Client-supplied ids are only a request;
 * authorization derives from the actor's central tenant/station scope. Any
 * requested station that is not both org-owned and within the actor's station
 * scope fails the whole request closed.
 *
 * Timezone precedence (EVAL-ADR-002): a single authorized station's timezone,
 * else the organization timezone, else the platform fallback. Multiple stations
 * never pick a "first station" — they fall through to the organization timezone.
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
    const { actor, orgId, requestedStationIds, periodType } = input;

    const access = await this.stationAccess.resolve(actor.id, orgId);
    const bypass = access.bypassScope || access.allowedStationIds === null;

    let stationIds: readonly string[] | null;
    let stationScoped: boolean;

    if (requestedStationIds === null) {
      stationIds = bypass ? null : [...(access.allowedStationIds ?? [])];
      stationScoped = !bypass;
    } else if (requestedStationIds.length === 0) {
      stationIds = [];
      stationScoped = true;
    } else {
      await this.assertStationsAuthorized(orgId, requestedStationIds, access, bypass);
      stationIds = [...requestedStationIds];
      stationScoped = true;
    }

    const period = await this.resolvePeriod(orgId, stationIds, periodType, input.reference);

    return { organizationId: orgId, stationIds, stationScoped, period };
  }

  private async assertStationsAuthorized(
    orgId: string,
    requestedStationIds: readonly string[],
    access: { bypassScope: boolean; allowedStationIds: string[] | null },
    bypass: boolean,
  ): Promise<void> {
    const owned = await this.prisma.station.findMany({
      where: { organizationId: orgId, id: { in: [...requestedStationIds] } },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((s) => s.id));
    for (const stationId of requestedStationIds) {
      if (!ownedIds.has(stationId)) {
        throw new ForbiddenException('Requested station is outside the authorized scope');
      }
      if (!bypass && !(access.allowedStationIds ?? []).includes(stationId)) {
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
