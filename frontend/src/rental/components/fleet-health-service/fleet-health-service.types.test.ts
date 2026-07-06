import { describe, expect, it } from 'vitest';
import { normalizeFleetTab } from './fleet-health-service.types';

describe('normalizeFleetTab', () => {
  it('keeps status and condition-service', () => {
    expect(normalizeFleetTab('status')).toEqual({ tab: 'status' });
    expect(normalizeFleetTab('condition-service')).toEqual({ tab: 'condition-service' });
  });

  it('accepts connectivity', () => {
    expect(normalizeFleetTab('connectivity')).toEqual({ tab: 'connectivity' });
  });

  it('maps legacy health and service tabs', () => {
    expect(normalizeFleetTab('health')).toEqual({
      tab: 'condition-service',
      subTab: 'vehicles',
    });
    expect(normalizeFleetTab('service')).toEqual({
      tab: 'condition-service',
      subTab: 'overview',
    });
  });

  it('falls back unknown values to status', () => {
    expect(normalizeFleetTab('invalid-tab')).toEqual({ tab: 'status' });
    expect(normalizeFleetTab('')).toEqual({ tab: 'status' });
  });
});
