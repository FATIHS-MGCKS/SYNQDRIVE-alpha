import { Injectable, Logger } from '@nestjs/common';
import {
  FEATURE_SET_VERSION,
  FEATURE_SNAPSHOT_RETENTION_MONTHS,
} from '@synq/evaluations-insights/predictive/evaluations-feature-store.contract';
import {
  buildHistoricalDemandContext,
  extractPredictiveFeatures,
} from '@synq/evaluations-insights/predictive/evaluations-feature-extraction';
import {
  listObservationDates,
  resolveObservationWindow,
  zonedDateOnly,
  zonedStartOfDayToUtc,
} from '@synq/evaluations-insights/predictive/evaluations-feature-time';
import { toPrismaSnapshotCreateInput } from '@shared/predictive/predictive-feature.mapper';
import { PredictiveFeatureLoader } from './predictive-feature.loader';
import { PredictiveFeatureRepository } from './predictive-feature.repository';

export type BuildPredictiveFeaturesInput = {
  organizationId: string;
  observationDates?: string[];
  lookbackDays?: number;
  timezone?: string;
  trigger?: string;
};

@Injectable()
export class PredictiveFeatureService {
  private readonly logger = new Logger(PredictiveFeatureService.name);

  constructor(
    private readonly loader: PredictiveFeatureLoader,
    private readonly repository: PredictiveFeatureRepository,
  ) {}

  async listSnapshots(
    organizationId: string,
    input: {
      observationDateFrom?: string;
      observationDateTo?: string;
      grain?: string;
      limit?: number;
    },
  ) {
    const fromDate =
      input.observationDateFrom ??
      this.defaultObservationDates(7, await this.loader.loadOrganizationTimezone(organizationId))[0];
    const toDate =
      input.observationDateTo ??
      zonedDateOnly(new Date(), await this.loader.loadOrganizationTimezone(organizationId));
    return this.repository.listSnapshots(organizationId, {
      fromDate,
      toDate,
      featureSetVersion: FEATURE_SET_VERSION,
    });
  }

  async getLatestBuildRun(organizationId: string) {
    return this.repository.getLatestBuildRun(organizationId);
  }

  async buildFeatures(input: BuildPredictiveFeaturesInput) {
    const timezone =
      input.timezone ?? (await this.loader.loadOrganizationTimezone(input.organizationId));
    const observationDates =
      input.observationDates ??
      this.defaultObservationDates(input.lookbackDays ?? 7, timezone);

    if (observationDates.length === 0) {
      throw new Error('No observation dates to build');
    }

    const run = await this.repository.createBuildRun(input.organizationId, {
      featureSetVersion: FEATURE_SET_VERSION,
      fromDate: observationDates[0],
      toDate: observationDates[observationDates.length - 1],
    });

    try {
      const rangeStartUtc = zonedStartOfDayToUtc(observationDates[0], timezone);
      const rangeEndUtc = resolveObservationWindow(
        observationDates[observationDates.length - 1],
        timezone,
      ).periodEndUtc;

      const [raw, fleet] = await Promise.all([
        this.loader.loadRawData(
          input.organizationId,
          rangeStartUtc,
          new Date(rangeEndUtc),
          timezone,
        ),
        this.loader.loadFleetContext(input.organizationId),
      ]);

      const asOfByDate = new Map(
        observationDates.map((date) => [date, resolveObservationWindow(date, timezone).asOfUtc]),
      );
      const historicalDemand = buildHistoricalDemandContext(
        raw.bookings,
        observationDates,
        timezone,
        asOfByDate,
      );

      let snapshotCount = 0;
      for (const observationDate of observationDates) {
        const window = resolveObservationWindow(observationDate, timezone);
        const payload = extractPredictiveFeatures(
          {
            organizationId: input.organizationId,
            timezone,
            observationDate,
            asOfUtc: window.asOfUtc,
            periodStartUtc: window.periodStartUtc,
            periodEndUtc: window.periodEndUtc,
            scope: { type: 'FLEET' },
            bookings: raw.bookings,
            serviceCases: raw.serviceCases,
            invoices: raw.invoices,
            fleet,
          },
          historicalDemand,
        );

        await this.repository.upsertSnapshot(
          toPrismaSnapshotCreateInput(input.organizationId, payload, run.id),
        );
        snapshotCount += 1;
      }

      const cutoff = this.loader.retentionCutoffDate(
        timezone,
        FEATURE_SNAPSHOT_RETENTION_MONTHS,
      );
      const purged = await this.repository.purgeOlderThan(input.organizationId, cutoff);

      await this.repository.completeBuildRun(run.id, {
        status: 'COMPLETED',
        snapshotsWritten: snapshotCount,
      });

      return {
        buildRunId: run.id,
        featureSetVersion: FEATURE_SET_VERSION,
        timezone,
        observationDates,
        snapshotCount,
        purgedSnapshotCount: purged,
        trigger: input.trigger ?? 'api',
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Feature build failed';
      this.logger.error(
        `Predictive feature build failed for org ${input.organizationId}: ${message}`,
      );
      await this.repository.completeBuildRun(run.id, {
        status: 'FAILED',
        snapshotsWritten: 0,
        errorMessage: message,
      });
      throw error;
    }
  }

  private defaultObservationDates(lookbackDays: number, timezone: string): string[] {
    const days = Math.max(1, Math.min(lookbackDays, 90));
    const today = zonedDateOnly(new Date(), timezone);
    const yesterday = zonedDateOnly(
      new Date(zonedStartOfDayToUtc(today, timezone).getTime() - 1),
      timezone,
    );
    const start = this.shiftDateOnly(yesterday, timezone, -(days - 1));
    return listObservationDates(start, yesterday, timezone);
  }

  private shiftDateOnly(
    dateOnly: string,
    timezone: string,
    dayOffset: number,
  ): string {
    const anchor = zonedStartOfDayToUtc(dateOnly, timezone);
    const shifted = new Date(anchor.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    return zonedDateOnly(shifted, timezone);
  }
}
