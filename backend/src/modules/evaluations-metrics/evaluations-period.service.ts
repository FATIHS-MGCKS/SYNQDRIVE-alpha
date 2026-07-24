import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DEFAULT_TARIFF_TIMEZONE } from '@modules/pricing/tariff-instant.util';
import type {
  EvaluationsPeriodPreset,
  EvaluationsTimezoneContext,
} from '@synq/evaluations-periods/evaluations-period.contract';
import {
  resolveEvaluationsPeriod,
  resolveEvaluationsReportingPeriodBundle,
} from './evaluations-period.resolver';

@Injectable()
export class EvaluationsPeriodService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveTimezoneContext(
    organizationId: string,
    stationId?: string | null,
  ): Promise<EvaluationsTimezoneContext> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    if (!org) {
      throw new NotFoundException({ message: 'Organization not found', code: 'ORG_NOT_FOUND' });
    }

    const organizationTimezone = org.timezone?.trim() || DEFAULT_TARIFF_TIMEZONE;

    if (stationId) {
      const station = await this.prisma.station.findFirst({
        where: { id: stationId, organizationId },
        select: { timezone: true },
      });
      if (!station) {
        throw new NotFoundException({ message: 'Station not found', code: 'STATION_NOT_FOUND' });
      }
      const stationTimezone = station.timezone?.trim() || organizationTimezone;
      return {
        effective: stationTimezone,
        organization: organizationTimezone,
        station: stationTimezone,
        source: 'station',
      };
    }

    return {
      effective: organizationTimezone,
      organization: organizationTimezone,
      station: null,
      source: 'organization',
    };
  }

  async resolvePeriod(input: {
    organizationId: string;
    preset: EvaluationsPeriodPreset;
    reference?: Date;
    stationId?: string | null;
  }) {
    const reference = input.reference ?? new Date();
    const timezone = await this.resolveTimezoneContext(input.organizationId, input.stationId);
    return resolveEvaluationsPeriod({
      preset: input.preset,
      reference,
      timezone,
    });
  }

  async resolveReportingBundle(input: {
    organizationId: string;
    reference?: Date;
    stationId?: string | null;
  }) {
    const reference = input.reference ?? new Date();
    const timezone = await this.resolveTimezoneContext(input.organizationId, input.stationId);
    return resolveEvaluationsReportingPeriodBundle({ reference, timezone });
  }
}
