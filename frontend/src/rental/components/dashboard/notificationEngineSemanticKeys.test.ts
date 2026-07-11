import { describe, expect, it } from 'vitest';
import {
  semanticKeyForDashboardInsight,
  semanticKeyForDerivedInsight,
  semanticKeyForDrivingAssessmentNotification,
  semanticKeyForPickupItem,
  semanticKeyForPredictiveInsight,
  semanticKeyForReturnItem,
} from './notificationEngineSemanticKeys';
import {
  drivingAssessmentInsight,
  pickupOverdueInsight,
  WOB_VEHICLE_ID,
} from './notificationEngine.fixtures';
import type { DerivedOperationalInsight } from './deriveOperationalInsights';
import type { PredictiveOperationsInsight } from './derivePredictiveOperationsInsights';

describe('notificationEngineSemanticKeys', () => {
  it('builds stable driving-assessment keys without title or time', () => {
    const insight = drivingAssessmentInsight('DEGRADED');
    expect(semanticKeyForDashboardInsight(insight)).toBe(
      `vehicle:${WOB_VEHICLE_ID}:health:driving_assessment_device_quality`,
    );
    expect(semanticKeyForDrivingAssessmentNotification(WOB_VEHICLE_ID)).toBe(
      `vehicle:${WOB_VEHICLE_ID}:health:driving_assessment_device_quality`,
    );
  });

  it('builds booking keys from structured ids', () => {
    const insight = pickupOverdueInsight('bk-1');
    expect(semanticKeyForDashboardInsight(insight)).toBe('booking:bk-1:booking:pickup_overdue');
    expect(
      semanticKeyForPickupItem({
        bookingId: 'bk-1',
        isOverdue: true,
        done: false,
        plate: 'X',
        vehicle: 'X',
        customer: 'C',
        station: 'S',
        startDate: '2026-07-10T10:00:00.000Z',
        time: '10:00',
        vehicleId: WOB_VEHICLE_ID,
      }),
    ).toBe('booking:bk-1:booking:pickup_overdue');
  });

  it('builds derived fleet keys from stable ids', () => {
    const derived: DerivedOperationalInsight = {
      id: 'derived-fleet-soft-offline-telemetry',
      source: 'derived-operations',
      severity: 'warning',
      category: 'operations',
      title: 't',
      reason: 'r',
      timeSortMs: 0,
      cta: 'open-rental',
      isOverdue: false,
    };
    expect(semanticKeyForDerivedInsight(derived)).toBe('fleet:operations:derived_fleet_telemetry');
  });

  it('builds predictive keys from entity ids', () => {
    const predictive = {
      id: 'predictive-station-shortage-st-1',
      type: 'STATION_SHORTAGE_24H',
      severity: 'warning',
      title: 'Shortage',
      explanation: '',
      recommendedAction: '',
      timeLabel: '',
      timeSortMs: 0,
      cta: 'open-stations',
      isOverdue: false,
      stationId: 'st-1',
      affectedEntity: { kind: 'station', label: 'Station', stationId: 'st-1' },
    } as PredictiveOperationsInsight;
    expect(semanticKeyForPredictiveInsight(predictive)).toBe('station:st-1:station_operations:shortage');
  });

  it('return scheduled key differs from overdue key', () => {
    const overdueKey = semanticKeyForReturnItem({
      bookingId: 'bk-9',
      isOverdue: true,
      hasError: false,
      done: false,
      plate: 'P',
      vehicle: 'V',
      customer: 'C',
      station: 'S',
      endDate: '2026-07-10T18:00:00.000Z',
      time: '18:00',
      vehicleId: WOB_VEHICLE_ID,
    });
    const scheduledKey = semanticKeyForReturnItem({
      bookingId: 'bk-9',
      isOverdue: false,
      hasError: false,
      done: false,
      plate: 'P',
      vehicle: 'V',
      customer: 'C',
      station: 'S',
      endDate: '2026-07-10T18:00:00.000Z',
      time: '18:00',
      vehicleId: WOB_VEHICLE_ID,
    });
    expect(overdueKey).not.toBe(scheduledKey);
  });
});
