import { NotificationEntityType, NotificationSeverity, NotificationStatus } from '@prisma/client';
import type { VehicleHealth } from '@modules/rental-health/rental-health.types';
import {
  projectVehicleHealthWarnings,
  vehicleHealthSourceFingerprint,
} from './rental-health-notification.projector';
import { VehicleHealthNotificationAdapter } from './vehicle-health-notification.adapter';

const VEHICLE_ID = 'veh-ks-ms-661';
const LABEL = 'KS MS 661';

function stubModule(
  state: 'good' | 'warning' | 'critical' | 'unknown' | 'n_a',
  reason: string,
) {
  return {
    state,
    reason,
    last_updated_at: '2026-07-11T10:00:00.000Z',
    data_stale: false,
  };
}

function stubHealth(
  overrides: Partial<Record<keyof VehicleHealth['modules'], ReturnType<typeof stubModule>>> = {},
): VehicleHealth {
  return {
    vehicle_id: VEHICLE_ID,
    organization_id: 'org-fs',
    overall_state: 'warning',
    availability: 'ready',
    rental_blocked: false,
    blocking_reasons: [],
    generated_at: '2026-07-11T10:00:00.000Z',
    modules: {
      battery: stubModule('good', 'OK'),
      tires: stubModule('good', 'OK'),
      brakes: stubModule('good', 'OK'),
      error_codes: stubModule('good', 'OK'),
      service_compliance: stubModule('good', 'OK'),
      complaints: stubModule('good', 'OK'),
      vehicle_alerts: stubModule('n_a', 'N/A'),
      ...overrides,
    },
  };
}

describe('projectVehicleHealthWarnings', () => {
  it('emits per-code ACTIVE_DTC and module warnings', () => {
    const sources = projectVehicleHealthWarnings(
      VEHICLE_ID,
      LABEL,
      stubHealth({
        brakes: stubModule('warning', 'Bremsenprüfung empfohlen'),
        error_codes: stubModule('warning', '1 aktive Fehlercodes'),
      }),
      [{ dtcCode: 'P0675', description: 'Glow plug', severity: 'WARNING' }],
    );

    expect(sources).toHaveLength(2);
    expect(sources.find((s) => s.eventType === 'BRAKE_CRITICAL')).toMatchObject({
      vehicleId: VEHICLE_ID,
      label: LABEL,
      severity: 'warning',
      reason: 'Bremsenprüfung empfohlen',
    });
    expect(sources.find((s) => s.eventType === 'ACTIVE_DTC')).toMatchObject({
      code: 'P0675',
      severity: 'warning',
    });
  });

  it('skips good/unknown/n_a modules', () => {
    const sources = projectVehicleHealthWarnings(
      VEHICLE_ID,
      LABEL,
      stubHealth({ battery: stubModule('unknown', 'Keine Daten') }),
      [],
    );
    expect(sources).toHaveLength(0);
  });

  it('uses distinct fingerprints per DTC code', () => {
    const fpA = vehicleHealthSourceFingerprint('org-1', {
      eventType: 'ACTIVE_DTC',
      vehicleId: VEHICLE_ID,
      code: 'P0675',
    });
    const fpB = vehicleHealthSourceFingerprint('org-1', {
      eventType: 'ACTIVE_DTC',
      vehicleId: VEHICLE_ID,
      code: 'P0420',
    });
    expect(fpA).not.toBe(fpB);
    expect(fpA).toContain('active_dtc:P0675');
  });
});

describe('VehicleHealthNotificationAdapter', () => {
  const adapter = new VehicleHealthNotificationAdapter();
  const ctx = {
    organizationId: 'org-fs',
    sourceRef: 'run-1',
    occurredAt: new Date('2026-07-11T10:00:00.000Z'),
    runId: 'run-1',
  };

  it('builds ACTIVE_DTC candidate with code param', () => {
    const candidate = adapter.toCandidate(
      {
        eventType: 'ACTIVE_DTC',
        vehicleId: VEHICLE_ID,
        label: LABEL,
        code: 'P0675',
        severity: 'warning',
      },
      ctx,
    );
    expect(candidate?.eventType).toBe('ACTIVE_DTC');
    expect(candidate?.templateParams).toMatchObject({ label: LABEL, code: 'P0675' });
    expect(candidate?.conditionCode).toBe('active_dtc:P0675');
    expect(candidate?.severity).toBe(NotificationSeverity.WARNING);
  });

  it('resolves cleared DTC with SUCCESS severity', () => {
    const candidate = adapter.toCandidate(
      {
        eventType: 'ACTIVE_DTC',
        vehicleId: VEHICLE_ID,
        label: LABEL,
        code: 'P0675',
        cleared: true,
      },
      ctx,
    );
    expect(candidate?.severity).toBe(NotificationSeverity.SUCCESS);
  });
});
