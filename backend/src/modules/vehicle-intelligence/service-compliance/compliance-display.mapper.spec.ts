import { mapNextServiceToDisplayItem, mapTuvBokraftToDisplayItem } from './compliance-display.mapper';

describe('compliance-display.mapper', () => {
  it('maps overdue TÜV from canonical DTO fields', () => {
    const item = mapTuvBokraftToDisplayItem(
      {
        tuvValidTill: '2026-01-01',
        tuvRemainingMonths: -1,
        tuvRemainingDays: -5,
        tuvOverdue: true,
        tuvLastDate: null,
        bokraftValidTill: null,
        bokraftRemainingMonths: null,
        bokraftRemainingDays: null,
        bokraftOverdue: false,
        bokraftLastDate: null,
      },
      'tuv',
    );
    expect(item.uiStatus).toBe('expired');
    expect(item.source).toBe('service_compliance_service');
  });

  it('maps expiring soon when remaining days within warning window', () => {
    const item = mapTuvBokraftToDisplayItem(
      {
        tuvValidTill: '2026-07-10',
        tuvRemainingMonths: 0,
        tuvRemainingDays: 20,
        tuvOverdue: false,
        tuvLastDate: null,
        bokraftValidTill: null,
        bokraftRemainingMonths: null,
        bokraftRemainingDays: null,
        bokraftOverdue: false,
        bokraftLastDate: null,
      },
      'tuv',
    );
    expect(item.uiStatus).toBe('expiring_soon');
    expect(item.status).toBe('warning');
  });

  it('maps next service WARNING severity to expiring_soon', () => {
    const item = mapNextServiceToDisplayItem({
      trackingStatus: 'TRACKED',
      source: 'HM_OEM',
      distanceToNextServiceKm: 100,
      timeToNextServiceDays: 10,
      lastUpdatedAt: '2026-06-01',
      serviceSourceLabel: 'HM',
      severity: 'WARNING',
      blocksRental: false,
      title: 'Service',
      description: 'Due soon',
      message: 'Service due in 10 days',
      hmDistanceFromOem: true,
      hmTimeFromOem: true,
      hmDerivedDueDate: '2026-06-28',
    });
    expect(item.uiStatus).toBe('expiring_soon');
    expect(item.source).toBe('service_compliance_service');
  });
});
