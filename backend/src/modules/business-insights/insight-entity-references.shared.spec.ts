import type { InsightEntityReference } from '@synq/evaluations-insights/insight-entity-references.contract';
import {
  buildEntityReferencesFromRow,
  buildInsightEntityBreakdown,
  computeGroupCountFromReferences,
  computeInsightEntityCountSummary,
  sanitizeEntityReferences,
} from '@synq/evaluations-insights/insight-entity-references';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

describe('insight entity references (Prompt 16)', () => {
  it('one insight, one vehicle', () => {
    const breakdown = buildInsightEntityBreakdown(
      {
        id: 'ins-1',
        type: 'SERVICE_OVERDUE',
        severity: 'WARNING',
        entityScope: 'VEHICLE',
        entityIds: ['veh-1'],
        organizationId: ORG_A,
      },
      ORG_A,
    );
    expect(breakdown.groupCount).toBe(1);
    expect(breakdown.eventCount).toBe(1);
    expect(breakdown.references.filter((r) => r.entityType === 'VEHICLE')).toHaveLength(1);
  });

  it('one grouped insight with 20 vehicles counts 20 affected vehicles', () => {
    const vehicleIds = Array.from({ length: 20 }, (_, i) => `veh-${i}`);
    const breakdown = buildInsightEntityBreakdown(
      {
        id: 'grp-1',
        type: 'LOW_UTILIZATION',
        severity: 'WARNING',
        entityScope: 'VEHICLE',
        entityIds: vehicleIds,
        isGrouped: true,
        groupCount: 20,
        metrics: { groupedCount: 20, eventCount: 20 },
        organizationId: ORG_A,
      },
      ORG_A,
    );
    expect(breakdown.groupCount).toBe(20);
    expect(breakdown.eventCount).toBe(20);
    const summary = computeInsightEntityCountSummary(
      [
        {
          id: 'grp-1',
          type: 'LOW_UTILIZATION',
          severity: 'WARNING',
          entityScope: 'VEHICLE',
          entityIds: vehicleIds,
          isGrouped: true,
          groupCount: 20,
          metrics: { groupedCount: 20 },
        },
      ],
      ORG_A,
    );
    expect(summary.insightGroups).toBe(1);
    expect(summary.events).toBe(20);
    expect(summary.affectedVehicles).toBe(20);
  });

  it('multiple groups with overlapping vehicles dedupe unique entities', () => {
    const rows = [
      {
        id: 'g1',
        type: 'LOW_UTILIZATION',
        severity: 'WARNING',
        entityScope: 'VEHICLE',
        entityIds: ['v1', 'v2'],
        isGrouped: true,
        groupCount: 2,
        metrics: { groupedCount: 2 },
      },
      {
        id: 'g2',
        type: 'SERVICE_WINDOW',
        severity: 'INFO',
        entityScope: 'VEHICLE',
        entityIds: ['v2', 'v3'],
        isGrouped: true,
        groupCount: 2,
        metrics: { groupedCount: 2 },
      },
    ];
    const summary = computeInsightEntityCountSummary(rows, ORG_A);
    expect(summary.insightGroups).toBe(2);
    expect(summary.events).toBe(4);
    expect(summary.affectedVehicles).toBe(3);
    expect(summary.uniqueEntities).toBe(3);
  });

  it('insight without direct entity still counts as one group', () => {
    const summary = computeInsightEntityCountSummary(
      [
        {
          id: 'orphan',
          type: 'STATION_SHORTAGE',
          severity: 'CRITICAL',
          entityScope: 'STATION',
          entityIds: [],
          metrics: {},
        },
      ],
      ORG_A,
    );
    expect(summary.insightGroups).toBe(1);
    expect(summary.affectedVehicles).toBe(0);
  });

  it('strips cross-tenant entity references', () => {
    const refs: InsightEntityReference[] = [
      {
        entityType: 'VEHICLE',
        entityId: 'veh-1',
        organizationId: ORG_A,
        relationType: 'PRIMARY',
      },
      {
        entityType: 'VEHICLE',
        entityId: 'veh-evil',
        organizationId: ORG_B,
        relationType: 'PRIMARY',
      },
    ];
    const sanitized = sanitizeEntityReferences(refs, ORG_A);
    expect(sanitized).toHaveLength(1);
    expect(sanitized[0]?.entityId).toBe('veh-1');
  });

  it('critical bookings counts only booking entities, not insight groups', () => {
    const summary = computeInsightEntityCountSummary(
      [
        {
          id: 'pickup-1',
          type: 'PICKUP_OVERDUE',
          severity: 'CRITICAL',
          entityScope: 'VEHICLE',
          entityIds: ['veh-1'],
          metrics: { bookingId: 'book-1' },
        },
        {
          id: 'pickup-2',
          type: 'PICKUP_OVERDUE',
          severity: 'CRITICAL',
          entityScope: 'VEHICLE',
          entityIds: ['veh-2'],
          metrics: { bookingId: 'book-2' },
        },
        {
          id: 'station',
          type: 'STATION_SHORTAGE',
          severity: 'CRITICAL',
          entityScope: 'STATION',
          entityIds: ['station-1'],
        },
      ],
      ORG_A,
    );
    expect(summary.criticalBookings).toBe(2);
    expect(summary.bookingScopedRisks).toBe(2);
    expect(summary.orgWideRisks).toBe(1);
  });

  it('cross-station grouped pickup overdue preserves station ids on references', () => {
    const refs = buildEntityReferencesFromRow(
      {
        id: 'grp',
        type: 'PICKUP_OVERDUE',
        severity: 'WARNING',
        entityScope: 'VEHICLE',
        entityIds: ['veh-a', 'veh-b'],
        isGrouped: true,
        metrics: {
          groupedCount: 2,
          entities: [
            { id: 'veh-a', metrics: { bookingId: 'b1' } },
            { id: 'veh-b', metrics: { bookingId: 'b2' } },
          ],
        },
        timeContext: { pickupStationId: 'station-a' },
      },
      ORG_A,
    );
    expect(computeGroupCountFromReferences(refs, 'VEHICLE')).toBe(2);
    expect(refs.some((r) => r.entityType === 'BOOKING')).toBe(true);
  });
});
