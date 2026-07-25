import { describe, expect, it } from 'vitest';
import { moduleKeyToTab, resolveNotificationModuleTab } from './health-detail-utils';

describe('resolveNotificationModuleTab', () => {
  it('maps rental health module keys via moduleKeyToTab', () => {
    expect(resolveNotificationModuleTab('battery')).toBe(moduleKeyToTab('battery'));
    expect(resolveNotificationModuleTab('error_codes')).toBe('dtc');
    expect(resolveNotificationModuleTab('service_compliance')).toBe('service');
  });

  it('falls back to overview for unknown modules', () => {
    expect(resolveNotificationModuleTab(undefined)).toBe('overview');
    expect(resolveNotificationModuleTab('health')).toBe('overview');
    expect(resolveNotificationModuleTab('connectivity')).toBe('evidence');
  });
});
