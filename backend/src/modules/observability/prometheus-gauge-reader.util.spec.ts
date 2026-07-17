import { readPrometheusGaugeValue } from './prometheus-gauge-reader.util';
import { Gauge, Registry } from 'prom-client';

describe('prometheus-gauge-reader.util', () => {
  it('reads the current gauge value', async () => {
    const registry = new Registry();
    const gauge = new Gauge({ name: 'test_gauge', help: 'test', registers: [registry] });
    gauge.set(42);
    await expect(readPrometheusGaugeValue(gauge)).resolves.toBe(42);
  });
});
