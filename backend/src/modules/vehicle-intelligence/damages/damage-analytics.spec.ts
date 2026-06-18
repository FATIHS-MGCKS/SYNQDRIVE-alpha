import {
  buildFleetDamageStats,
  buildHeatmapCells,
  buildVehicleDamageInsights,
  type FleetDamageAggregateRow,
} from './damage-analytics';
import {
  DamageLocationView,
  DamageSeverity,
  DamageSource,
  DamageStatus,
} from '@prisma/client';

function makeVehicleRow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-06-01T10:00:00.000Z');
  return {
    id: 'dmg-1',
    vehicleId: 'veh-1',
    damageType: 'SCRATCH',
    severity: DamageSeverity.MODERATE,
    status: DamageStatus.OPEN,
    description: null,
    locationView: DamageLocationView.FRONT,
    locationX: 40,
    locationY: 50,
    locationLabel: 'Bumper',
    estimatedCostCents: 10000,
    repairCostCents: null,
    chargedToCustomerCents: null,
    depositHoldCents: null,
    source: DamageSource.MANUAL,
    rentalImpact: 'WATCH',
    evidenceStatus: 'MISSING',
    liabilityStatus: 'NOT_APPLICABLE',
    liabilityNote: null,
    bookingId: null,
    customerId: null,
    handoverProtocolId: null,
    taskId: null,
    reportedBy: null,
    repairStartedAt: null,
    repairedAt: null,
    createdAt: now,
    updatedAt: now,
    images: [],
    ...overrides,
  };
}

describe('damage-analytics', () => {
  it('buildHeatmapCells returns empty when fewer than minimum placed damages', () => {
    expect(buildHeatmapCells([{ x: 10, y: 20 }, { x: 30, y: 40 }])).toEqual([]);
  });

  it('buildVehicleDamageInsights uses null repair/charged totals when none recorded', () => {
    const insights = buildVehicleDamageInsights([makeVehicleRow() as any]);
    expect(insights.hasEnoughData).toBe(true);
    expect(insights.totalRepairCostCents).toBeNull();
    expect(insights.totalChargedToCustomerCents).toBeNull();
    expect(insights.mostAffectedView).toBe('FRONT');
  });

  it('buildVehicleDamageInsights separates estimated open vs actual repair cost', () => {
    const insights = buildVehicleDamageInsights([
      makeVehicleRow({
        status: DamageStatus.OPEN,
        estimatedCostCents: 5000,
        repairCostCents: null,
      }) as any,
      makeVehicleRow({
        id: 'dmg-2',
        status: DamageStatus.REPAIRED,
        repairedAt: new Date('2026-06-10'),
        repairStartedAt: new Date('2026-06-05'),
        estimatedCostCents: 8000,
        repairCostCents: 7500,
        chargedToCustomerCents: 2000,
      }) as any,
    ]);
    expect(insights.totalEstimatedOpenCostCents).toBe(5000);
    expect(insights.totalRepairCostCents).toBe(7500);
    expect(insights.totalChargedToCustomerCents).toBe(2000);
    expect(insights.avgRepairDurationDays).toBe(5);
  });

  it('buildFleetDamageStats is empty-safe', () => {
    const stats = buildFleetDamageStats('org-1', []);
    expect(stats.organizationId).toBe('org-1');
    expect(stats.total).toBe(0);
    expect(stats.avgEstimatedCostCents).toBeNull();
    expect(stats.totalRepairCostCents).toBeNull();
    expect(stats.byModel).toEqual([]);
  });

  it('buildFleetDamageStats counts blocking vehicles and model breakdown', () => {
    const row = (vehicleId: string, make: string, model: string): FleetDamageAggregateRow => ({
      status: DamageStatus.OPEN,
      severity: DamageSeverity.MAJOR,
      rentalImpact: 'BLOCK_RENTAL',
      locationView: DamageLocationView.UNKNOWN,
      estimatedCostCents: 12000,
      repairCostCents: null,
      chargedToCustomerCents: null,
      repairStartedAt: null,
      repairedAt: null,
      createdAt: new Date(),
      evidenceStatus: 'MISSING',
      locationX: null,
      locationY: null,
      vehicleId,
      bookingId: 'b1',
      customerId: 'c1',
      vehicle: { make, model },
    });
    const stats = buildFleetDamageStats('org-1', [
      row('v1', 'Hyundai', 'Tucson'),
      row('v1', 'Hyundai', 'Tucson'),
      row('v2', 'VW', 'Golf'),
    ]);
    expect(stats.total).toBe(3);
    expect(stats.vehiclesWithBlockingDamage).toBe(2);
    expect(stats.withBookingContext).toBe(3);
    expect(stats.byModel[0].damageCount).toBe(2);
  });
});
