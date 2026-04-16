import { Global, Module } from '@nestjs/common';
import { ClickHouseService } from './clickhouse.service';
import { ClickHouseTelemetryService } from './clickhouse-telemetry.service';
import { ClickHouseAnalyticsService } from './clickhouse-analytics.service';
import { ClickHouseSchemaService } from './clickhouse-schema.service';

/**
 * ClickHouseModule
 *
 * Global module providing ClickHouse services to the whole application.
 * Marked @Global so any module can inject ClickHouseTelemetryService /
 * ClickHouseAnalyticsService without re-importing this module explicitly.
 *
 * All services degrade gracefully when CLICKHOUSE_URL is not configured.
 */
@Global()
@Module({
  providers: [
    ClickHouseService,
    ClickHouseTelemetryService,
    ClickHouseAnalyticsService,
    ClickHouseSchemaService,
  ],
  exports: [
    ClickHouseService,
    ClickHouseTelemetryService,
    ClickHouseAnalyticsService,
    // ClickHouseSchemaService is not exported — it only needs to run on init
  ],
})
export class ClickHouseModule {}
