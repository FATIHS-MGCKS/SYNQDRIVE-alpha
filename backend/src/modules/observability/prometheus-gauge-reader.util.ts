import type { Gauge } from 'prom-client';

/** Read a single-value Prometheus gauge without scraping /metrics. */
export async function readPrometheusGaugeValue(
  gauge: Gauge<string>,
): Promise<number | null> {
  try {
    const metric = await gauge.get();
    const value = metric.values?.[0]?.value;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
