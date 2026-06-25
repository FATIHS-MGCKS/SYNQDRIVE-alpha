import { describe, expect, it } from 'vitest';
import type { TireWheelEstimate } from '../../lib/api';
import {
  formatLowestTreadLine,
  tireForecastBadgeLabel,
  wheelIsMeasured,
  wheelMeasurementBadge,
} from './tire-health-detail-ui';

describe('tire-health-detail-ui', () => {
  it('omits ca. for measured lowest tread', () => {
    const line = formatLowestTreadLine(8.1, 'front right', 'MEASURED');
    expect(line.value).toBe('8.1 mm');
    expect(line.prefix).toContain('measured');
    expect(line.value).not.toContain('ca.');
  });

  it('keeps ca. for estimated lowest tread', () => {
    const line = formatLowestTreadLine(8.1, 'front right', 'ESTIMATED');
    expect(line.value).toBe('ca. 8.1 mm');
  });

  it('uses clearer forecast badge labels', () => {
    expect(tireForecastBadgeLabel('MEASURED')).toBe('Measured · Forecast');
    expect(tireForecastBadgeLabel('ESTIMATED')).toBe('ML forecast');
  });

  it('detects measured wheels from lastMeasuredMm', () => {
    const wheel = {
      position: 'FL',
      treadMm: 7,
      lastMeasuredMm: 7,
    } as TireWheelEstimate;
    expect(wheelIsMeasured(wheel)).toBe(true);
    expect(wheelMeasurementBadge(wheel)).toBe('Measured');
  });
});
