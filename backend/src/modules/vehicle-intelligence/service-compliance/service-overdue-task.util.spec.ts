import {
  buildServiceOverdueTaskContext,
  buildServiceOverdueTaskDescription,
  describeIntervalExceeded,
  shouldAutoMaterializeServiceOverdueTask,
} from './service-overdue-task.util';

describe('service-overdue-task.util', () => {
  const baseNextService = {
    trackingStatus: 'TRACKED' as const,
    source: 'HM_OEM' as const,
    distanceToNextServiceKm: -150,
    timeToNextServiceDays: -3,
    lastUpdatedAt: '2026-07-10T10:00:00.000Z',
    serviceSourceLabel: 'HM/OEM',
    severity: 'CRITICAL' as const,
    blocksRental: false,
    title: 'Service überfällig',
    description: '',
    message: 'Service überfällig',
    hmDistanceFromOem: true,
    hmTimeFromOem: true,
    hmDerivedDueDate: '2026-07-12T00:00:00.000Z',
  };

  it('describes time and km interval exceeded', () => {
    const ctx = buildServiceOverdueTaskContext({
      vehicleLabel: 'B-XY 100',
      nextService: baseNextService,
      vehicle: {
        mileageKm: 61500,
        lastServiceDate: '2025-06-01T00:00:00.000Z',
        lastServiceOdometerKm: 45000,
        serviceIntervalManufacturerKm: 30000,
        serviceIntervalManufacturerMonths: 24,
      },
    })!;

    expect(describeIntervalExceeded(ctx)).toBe('Zeit- und Kilometerintervall überschritten');
    expect(ctx.overdueDays).toBe(3);
    expect(ctx.overdueKm).toBe(150);
    expect(buildServiceOverdueTaskDescription(ctx)).toMatch(/3 Tage überfällig/);
    expect(buildServiceOverdueTaskDescription(ctx)).toMatch(/150 km überfällig/);
    expect(buildServiceOverdueTaskDescription(ctx)).toMatch(/Letzter bekannter Service/);
  });

  it('supports km-only overdue', () => {
    const ctx = buildServiceOverdueTaskContext({
      vehicleLabel: 'VW Golf',
      nextService: {
        ...baseNextService,
        timeToNextServiceDays: 10,
        distanceToNextServiceKm: -80,
        severity: 'CRITICAL',
      },
      vehicle: { mileageKm: 50000 },
    })!;
    expect(describeIntervalExceeded(ctx)).toBe('Kilometerintervall überschritten');
  });

  it('auto-materializes only when overdue and critical', () => {
    const overdueCtx = buildServiceOverdueTaskContext({
      vehicleLabel: 'X',
      nextService: baseNextService,
    })!;
    expect(
      shouldAutoMaterializeServiceOverdueTask({
        ctx: overdueCtx,
        severity: 'CRITICAL',
        suggestionOnly: false,
      }),
    ).toBe(true);
    expect(
      shouldAutoMaterializeServiceOverdueTask({
        ctx: { ...overdueCtx, overdue: false, overdueByTime: false, overdueByKm: false },
        severity: 'WARNING',
        suggestionOnly: true,
      }),
    ).toBe(false);
  });
});
