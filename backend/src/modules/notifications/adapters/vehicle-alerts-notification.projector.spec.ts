import type { DashboardWarningLight } from '@modules/vehicle-intelligence/dashboard-warning-lights/dashboard-warning-lights.types';
import { buildVehicleAlertsTestEnvelope } from '@modules/vehicle-intelligence/dashboard-warning-lights/vehicle-alerts-rental-health.projector';
import {
  projectVehicleAlertNotifications,
  projectVehicleAlertNotificationStates,
  vehicleAlertsSourceFingerprint,
} from './vehicle-alerts-notification.projector';
import { buildRegistryFingerprint } from '../registry/notification-event-registry';

describe('vehicle-alerts-notification.projector', () => {
  const ts = '2026-06-16T12:00:00.000Z';
  const vehicleId = 'veh-1';
  const label = 'WOB A 1001';

  function limpLight(overrides: Partial<DashboardWarningLight> = {}): DashboardWarningLight {
    return {
      key: 'engine_limp_mode',
      label: 'Motorwarnung / Notlauf',
      state: 'active',
      severity: 'critical',
      supported: true,
      observedAt: ts,
      sourceSignal: 'engine.get.limp_mode',
      sourceTimestamp: ts,
      reason: 'Notlauf aktiv',
      action: 'Nicht vermieten',
      rentalImpact: 'block_rental',
      isCurrentActive: true,
      freshness: 'fresh',
      ...overrides,
    };
  }

  function oilLight(overrides: Partial<DashboardWarningLight> = {}): DashboardWarningLight {
    return {
      key: 'engine_oil_level',
      label: 'Motorölstand',
      state: 'active',
      severity: 'critical',
      supported: true,
      observedAt: ts,
      sourceSignal: 'diagnostics.get.engine_oil_level',
      sourceTimestamp: ts,
      reason: 'Motorölstand niedrig',
      action: 'Öl prüfen',
      rentalImpact: 'block_rental',
      isCurrentActive: true,
      freshness: 'fresh',
      ...overrides,
    };
  }

  it('Limp active → LIMP_MODE_ACTIVE ACTIVE source', () => {
    const sources = projectVehicleAlertNotifications(
      vehicleId,
      label,
      buildVehicleAlertsTestEnvelope([limpLight(), oilLight({ state: 'off_confirmed', isCurrentActive: false, rentalImpact: 'none', severity: 'info' })]),
    );
    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'LIMP_MODE_ACTIVE',
          cleared: false,
          blocksRental: true,
          severity: 'critical',
        }),
      ]),
    );
  });

  it('Limp off_confirmed → CLEARED source', () => {
    const sources = projectVehicleAlertNotifications(
      vehicleId,
      label,
      buildVehicleAlertsTestEnvelope([
        limpLight({ state: 'off_confirmed', isCurrentActive: false, rentalImpact: 'none', severity: 'info' }),
        oilLight({ state: 'off_confirmed', isCurrentActive: false, rentalImpact: 'none', severity: 'info' }),
      ]),
    );
    expect(sources.some((s) => s.eventType === 'LIMP_MODE_ACTIVE' && s.cleared)).toBe(true);
  });

  it('Limp stale → UNEVALUABLE (no sources)', () => {
    const sources = projectVehicleAlertNotifications(
      vehicleId,
      label,
      buildVehicleAlertsTestEnvelope([
        limpLight({ state: 'stale', isCurrentActive: false, freshness: 'stale' }),
      ]),
    );
    expect(sources.filter((s) => s.eventType === 'LIMP_MODE_ACTIVE')).toHaveLength(0);
  });

  it('provider_error envelope → UNEVALUABLE for all causes', () => {
    const sources = projectVehicleAlertNotifications(
      vehicleId,
      label,
      buildVehicleAlertsTestEnvelope([limpLight()], {
        connectionStatus: 'provider_error',
        freshness: 'error',
      }),
    );
    expect(sources).toHaveLength(0);
  });

  it('not_connected → UNEVALUABLE', () => {
    const states = projectVehicleAlertNotificationStates(
      buildVehicleAlertsTestEnvelope([], {
        connectionStatus: 'not_connected',
        supportStatus: 'not_connected',
        freshness: 'no_data',
      }),
    );
    expect(states.every((s) => s.condition === 'UNEVALUABLE')).toBe(true);
  });

  it('Oil LOW active → ENGINE_OIL_LEVEL_LOW', () => {
    const sources = projectVehicleAlertNotifications(
      vehicleId,
      label,
      buildVehicleAlertsTestEnvelope([
        limpLight({ state: 'off_confirmed', isCurrentActive: false, rentalImpact: 'none', severity: 'info' }),
        oilLight(),
      ]),
    );
    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'ENGINE_OIL_LEVEL_LOW', cleared: false, severity: 'critical' }),
      ]),
    );
  });

  it('Oil HIGH active → ENGINE_OIL_LEVEL_HIGH warning', () => {
    const sources = projectVehicleAlertNotifications(
      vehicleId,
      label,
      buildVehicleAlertsTestEnvelope([
        limpLight({ state: 'off_confirmed', isCurrentActive: false, rentalImpact: 'none', severity: 'info' }),
        oilLight({
          severity: 'warning',
          rentalImpact: 'inspect_before_next_rental',
          reason: 'Motoröl über Maximum',
        }),
      ]),
    );
    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'ENGINE_OIL_LEVEL_HIGH',
          cleared: false,
          severity: 'warning',
          blocksRental: false,
        }),
      ]),
    );
  });

  it('Oil OK off_confirmed → resolves LOW and HIGH', () => {
    const sources = projectVehicleAlertNotifications(
      vehicleId,
      label,
      buildVehicleAlertsTestEnvelope([
        limpLight({ state: 'off_confirmed', isCurrentActive: false, rentalImpact: 'none', severity: 'info' }),
        oilLight({ state: 'off_confirmed', isCurrentActive: false, rentalImpact: 'none', severity: 'info', reason: 'OK' }),
      ]),
    );
    expect(sources.filter((s) => s.eventType === 'ENGINE_OIL_LEVEL_LOW' && s.cleared)).toHaveLength(1);
    expect(sources.filter((s) => s.eventType === 'ENGINE_OIL_LEVEL_HIGH' && s.cleared)).toHaveLength(1);
  });

  it('LOW → HIGH transition emits LOW cleared + HIGH active', () => {
    const sources = projectVehicleAlertNotifications(
      vehicleId,
      label,
      buildVehicleAlertsTestEnvelope([
        limpLight({ state: 'off_confirmed', isCurrentActive: false, rentalImpact: 'none', severity: 'info' }),
        oilLight({
          severity: 'warning',
          rentalImpact: 'inspect_before_next_rental',
          reason: 'Motoröl über Maximum',
        }),
      ]),
    );
    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'ENGINE_OIL_LEVEL_LOW', cleared: true }),
        expect.objectContaining({ eventType: 'ENGINE_OIL_LEVEL_HIGH', cleared: false }),
      ]),
    );
  });

  it('HIGH → LOW transition emits HIGH cleared + LOW active', () => {
    const sources = projectVehicleAlertNotifications(
      vehicleId,
      label,
      buildVehicleAlertsTestEnvelope([
        limpLight({ state: 'off_confirmed', isCurrentActive: false, rentalImpact: 'none', severity: 'info' }),
        oilLight(),
      ]),
    );
    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'ENGINE_OIL_LEVEL_LOW', cleared: false }),
        expect.objectContaining({ eventType: 'ENGINE_OIL_LEVEL_HIGH', cleared: true }),
      ]),
    );
  });

  it('uses registry fingerprints for each event type', () => {
    for (const eventType of [
      'LIMP_MODE_ACTIVE',
      'ENGINE_OIL_LEVEL_LOW',
      'ENGINE_OIL_LEVEL_HIGH',
    ] as const) {
      const fp = vehicleAlertsSourceFingerprint('org-1', { eventType, vehicleId });
      const registryFp = buildRegistryFingerprint('org-1', eventType, vehicleId).canonical;
      expect(fp).toBe(registryFp);
    }
  });
});
