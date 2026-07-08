import type { TripMetricsService } from './trip-metrics.service';

/** Wraps a ClickHouse call with query-duration histogram observation. */
export async function observeClickHouseQuery<T>(
  metrics: TripMetricsService | undefined,
  queryType: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!metrics) {
    return fn();
  }

  const end = metrics.clickHouseQueryDuration.startTimer({
    query_type: queryType,
  });
  try {
    return await fn();
  } finally {
    end();
  }
}

/** Maps ClickHouse overall status to synqdrive_clickhouse_schema_status gauge value. */
export function clickHouseSchemaStatusCode(
  status: 'disabled' | 'available' | 'degraded' | 'schema_error',
): number {
  switch (status) {
    case 'disabled':
      return 0;
    case 'degraded':
      return 1;
    case 'schema_error':
      return 2;
    case 'available':
      return 3;
    default:
      return 0;
  }
}
