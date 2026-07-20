import { describe, expect, it } from 'vitest';
import {
  isFleetHealthServiceWorkAreaSubTab,
  resolveFleetSubTabForWorkView,
  resolveWorkViewFromFleetSubTab,
  resolveWorkViewFromServiceCenterNav,
} from './fleet-health-service-work-area';

describe('fleet-health-service-work-area', () => {
  it('maps legacy fleet subtabs to internal work views', () => {
    expect(resolveWorkViewFromFleetSubTab('tasks')).toBe('tasks');
    expect(resolveWorkViewFromFleetSubTab('schedule')).toBe('due-dates');
    expect(resolveWorkViewFromFleetSubTab('vendors')).toBeNull();
  });

  it('maps internal work views back to legacy fleet subtabs for deep links', () => {
    expect(resolveFleetSubTabForWorkView('tasks')).toBe('tasks');
    expect(resolveFleetSubTabForWorkView('service-cases')).toBe('tasks');
    expect(resolveFleetSubTabForWorkView('due-dates')).toBe('schedule');
  });

  it('identifies work-area compatible top-level subtabs', () => {
    expect(isFleetHealthServiceWorkAreaSubTab('tasks')).toBe(true);
    expect(isFleetHealthServiceWorkAreaSubTab('schedule')).toBe(true);
    expect(isFleetHealthServiceWorkAreaSubTab('vendors')).toBe(false);
  });

  it('resolves work views from service center navigation without breaking task focus', () => {
    expect(resolveWorkViewFromServiceCenterNav({ focusTaskId: 't1' })).toBe('tasks');
    expect(resolveWorkViewFromServiceCenterNav({ tab: 'schedule' })).toBe('due-dates');
    expect(resolveWorkViewFromServiceCenterNav({ vehicleId: 'v1' })).toBe('tasks');
    expect(resolveWorkViewFromServiceCenterNav({ vendorId: 'vendor-1' }, 'tasks')).toBe('tasks');
  });
});
