import { MembershipRole } from '@prisma/client';
import { redactInsightDtoForRole } from './insight-redaction.helper';
import type { DashboardInsightDto } from './insight.types';
import { InsightEntityScope, InsightSeverity, InsightType } from './insight.types';

function sampleInsight(): DashboardInsightDto {
  return {
    id: 'ins-1',
    type: InsightType.PICKUP_OVERDUE,
    severity: InsightSeverity.WARNING,
    priority: 70,
    title: 'Pickup overdue',
    message: 'Customer waiting',
    actionLabel: null,
    actionType: null,
    entityScope: InsightEntityScope.VEHICLE,
    entityIds: ['book-1'],
    timeContext: { bookingId: 'book-1', customerId: 'cust-1' },
    metrics: {
      customerId: 'cust-1',
      customerName: 'Jane Doe',
      financialImpactCents: 12000,
    },
    reasons: [],
    isGrouped: false,
    groupCount: 1,
    createdAt: '2026-07-25T00:00:00.000Z',
  };
}

describe('insight-redaction.helper', () => {
  it('passes through for org admins', () => {
    const insight = sampleInsight();
    expect(redactInsightDtoForRole(insight, MembershipRole.ORG_ADMIN)).toEqual(insight);
  });

  it('redacts PII metrics for workers (VW-F-012)', () => {
    const redacted = redactInsightDtoForRole(sampleInsight(), MembershipRole.WORKER);
    expect(redacted.metrics?.customerId).toBeNull();
    expect(redacted.metrics?.customerName).toBeNull();
    expect(redacted.metrics?.financialImpactCents).toBeNull();
    expect(redacted.timeContext?.bookingId).toBeNull();
  });
});
