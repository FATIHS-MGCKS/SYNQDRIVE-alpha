import type { DashboardWarningLight } from './dashboard-warning-lights.types';
import {
  buildVehicleAlertsTestEnvelope,
  isVehicleAlertsDashboardPipelineFailed,
  projectVehicleAlertsToRentalHealth,
  vehicleAlertBlockingCausesToReasons,
} from './vehicle-alerts-rental-health.projector';

describe('vehicle-alerts-rental-health.projector', () => {
  const ts = '2026-06-16T12:00:00.000Z';

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

  function quietOil(): DashboardWarningLight {
    return oilLight({
      state: 'off_confirmed',
      severity: 'info',
      rentalImpact: 'none',
      isCurrentActive: false,
      reason: 'Ölstand OK',
    });
  }

  function quietLimp(): DashboardWarningLight {
    return limpLight({
      state: 'off_confirmed',
      severity: 'info',
      rentalImpact: 'none',
      isCurrentActive: false,
      reason: 'Notlauf aus',
    });
  }

  describe('Limp Mode', () => {
    it('fresh active → critical + rental hard block', () => {
      const { moduleHealth, blockingCauses } = projectVehicleAlertsToRentalHealth(
        buildVehicleAlertsTestEnvelope([limpLight(), quietOil()]),
      );
      expect(moduleHealth.state).toBe('critical');
      expect(blockingCauses).toEqual([
        expect.objectContaining({ telltaleKey: 'engine_limp_mode', hardBlock: true }),
      ]);
      expect(vehicleAlertBlockingCausesToReasons(blockingCauses)).toContain('Limp Mode aktiv');
    });

    it('explicit off → no limp blocker', () => {
      const { moduleHealth, blockingCauses } = projectVehicleAlertsToRentalHealth(
        buildVehicleAlertsTestEnvelope([quietLimp(), quietOil()]),
      );
      expect(moduleHealth.state).toBe('good');
      expect(blockingCauses).toHaveLength(0);
    });

    it('null / no_event_yet → not confirmed off (unknown)', () => {
      const { moduleHealth, blockingCauses } = projectVehicleAlertsToRentalHealth(
        buildVehicleAlertsTestEnvelope([
          limpLight({
            state: 'no_event_yet',
            severity: 'unknown',
            rentalImpact: 'none',
            isCurrentActive: false,
          }),
          oilLight({
            state: 'no_event_yet',
            severity: 'unknown',
            rentalImpact: 'none',
            isCurrentActive: false,
          }),
        ]),
      );
      expect(moduleHealth.state).toBe('unknown');
      expect(blockingCauses).toHaveLength(0);
    });

    it('unsupported → not confirmed off', () => {
      const { moduleHealth } = projectVehicleAlertsToRentalHealth(
        buildVehicleAlertsTestEnvelope([
          limpLight({
            state: 'unsupported',
            supported: false,
            isCurrentActive: false,
            rentalImpact: 'none',
          }),
        ]),
      );
      expect(moduleHealth.state).toBe('n_a');
    });

    it('stale previously-active → not automatically confirmed healthy', () => {
      const { moduleHealth, blockingCauses } = projectVehicleAlertsToRentalHealth(
        buildVehicleAlertsTestEnvelope(
          [
            limpLight({
              state: 'stale',
              severity: 'unknown',
              rentalImpact: 'none',
              isCurrentActive: false,
              isHistorical: true,
            }),
            quietOil(),
          ],
          { freshness: 'stale' },
        ),
      );
      expect(moduleHealth.state).toBe('unknown');
      expect(blockingCauses).toHaveLength(0);
    });

    it('provider error envelope → not good', () => {
      const { moduleHealth } = projectVehicleAlertsToRentalHealth(
        buildVehicleAlertsTestEnvelope([], {
          connectionStatus: 'provider_error',
          freshness: 'error',
          message: 'HM fetch failed',
        }),
      );
      expect(moduleHealth.state).toBe('unknown');
      expect(moduleHealth.state).not.toBe('good');
      expect(moduleHealth.state).not.toBe('n_a');
    });
  });

  describe('Oil Level', () => {
    it('LOW → critical + blocker', () => {
      const { moduleHealth, blockingCauses } = projectVehicleAlertsToRentalHealth(
        buildVehicleAlertsTestEnvelope([quietLimp(), oilLight()]),
      );
      expect(moduleHealth.state).toBe('critical');
      expect(blockingCauses).toEqual([
        expect.objectContaining({ telltaleKey: 'engine_oil_level', reason: 'Motoröl Minimum' }),
      ]);
    });

    it('MINIMUM-equivalent active critical → critical + blocker', () => {
      const { blockingCauses } = projectVehicleAlertsToRentalHealth(
        buildVehicleAlertsTestEnvelope([
          quietLimp(),
          oilLight({ reason: 'Motoröl Minimum (HM/OEM)' }),
        ]),
      );
      expect(blockingCauses.some((c) => c.telltaleKey === 'engine_oil_level')).toBe(true);
    });

    it('HIGH → warning, no hard block', () => {
      const { moduleHealth, blockingCauses } = projectVehicleAlertsToRentalHealth(
        buildVehicleAlertsTestEnvelope([
          quietLimp(),
          oilLight({
            severity: 'warning',
            rentalImpact: 'inspect_before_next_rental',
            reason: 'Motorölstand hoch',
          }),
        ]),
      );
      expect(moduleHealth.state).toBe('warning');
      expect(moduleHealth.reason).toBe('Motoröl über Maximum');
      expect(blockingCauses).toHaveLength(0);
    });

    it('MAXIMUM-equivalent warning → warning, no hard block', () => {
      const { moduleHealth, blockingCauses } = projectVehicleAlertsToRentalHealth(
        buildVehicleAlertsTestEnvelope([
          quietLimp(),
          oilLight({
            severity: 'warning',
            rentalImpact: 'inspect_before_next_rental',
          }),
        ]),
      );
      expect(moduleHealth.state).toBe('warning');
      expect(blockingCauses).toHaveLength(0);
    });

    it('OK / off_confirmed → confirmed recovery (good)', () => {
      const { moduleHealth } = projectVehicleAlertsToRentalHealth(
        buildVehicleAlertsTestEnvelope([quietLimp(), quietOil()]),
      );
      expect(moduleHealth.state).toBe('good');
    });

    it('null/unknown → not good', () => {
      const { moduleHealth } = projectVehicleAlertsToRentalHealth(
        buildVehicleAlertsTestEnvelope([
          limpLight({
            state: 'no_event_yet',
            severity: 'unknown',
            rentalImpact: 'none',
            isCurrentActive: false,
          }),
          oilLight({
            state: 'no_event_yet',
            severity: 'unknown',
            rentalImpact: 'none',
            isCurrentActive: false,
          }),
        ]),
      );
      expect(moduleHealth.state).toBe('unknown');
    });

    it('stale previously abnormal → not automatic recovery', () => {
      const { moduleHealth } = projectVehicleAlertsToRentalHealth(
        buildVehicleAlertsTestEnvelope(
          [
            quietLimp(),
            oilLight({
              state: 'stale',
              severity: 'unknown',
              rentalImpact: 'none',
              isCurrentActive: false,
              isHistorical: true,
            }),
          ],
          { freshness: 'stale' },
        ),
      );
      expect(moduleHealth.state).toBe('unknown');
    });
  });

  describe('Multi-cause', () => {
    it('limp + oil low → both blocking causes', () => {
      const { moduleHealth, blockingCauses } = projectVehicleAlertsToRentalHealth(
        buildVehicleAlertsTestEnvelope([limpLight(), oilLight()]),
      );
      expect(moduleHealth.state).toBe('critical');
      expect(blockingCauses).toHaveLength(2);
      expect(vehicleAlertBlockingCausesToReasons(blockingCauses)).toEqual(
        expect.arrayContaining(['Limp Mode aktiv', 'Motoröl Minimum']),
      );
    });

    it('limp + oil high → critical module; only limp hard blocker', () => {
      const { moduleHealth, blockingCauses } = projectVehicleAlertsToRentalHealth(
        buildVehicleAlertsTestEnvelope([
          limpLight(),
          oilLight({
            severity: 'warning',
            rentalImpact: 'inspect_before_next_rental',
          }),
        ]),
      );
      expect(moduleHealth.state).toBe('critical');
      expect(blockingCauses).toHaveLength(1);
      expect(blockingCauses[0].telltaleKey).toBe('engine_limp_mode');
    });
  });

  describe('Pipeline failure', () => {
    it('load failed → unknown, no good/n_a', () => {
      const { moduleHealth, blockingCauses } = projectVehicleAlertsToRentalHealth(null, {
        loadFailed: true,
      });
      expect(moduleHealth.state).toBe('unknown');
      expect(blockingCauses).toHaveLength(0);
    });
  });

  describe('Sibling isolation', () => {
    it('ignores non-scoped telltales in projection input', () => {
      const batteryWarn: DashboardWarningLight = {
        key: 'battery_warning_light',
        label: 'Battery',
        state: 'active',
        severity: 'critical',
        supported: true,
        observedAt: ts,
        sourceSignal: 'dashboard_lights',
        sourceTimestamp: ts,
        reason: 'Battery low',
        action: 'Check',
        rentalImpact: 'block_rental',
        isCurrentActive: true,
      };
      const { moduleHealth, blockingCauses } = projectVehicleAlertsToRentalHealth(
        buildVehicleAlertsTestEnvelope([quietLimp(), quietOil(), batteryWarn]),
      );
      expect(moduleHealth.state).toBe('good');
      expect(blockingCauses).toHaveLength(0);
    });
  });

  describe('isVehicleAlertsDashboardPipelineFailed', () => {
    it('treats rejected DWL fetch as pipeline failure', () => {
      expect(
        isVehicleAlertsDashboardPipelineFailed({
          status: 'rejected',
          reason: new Error('dwl down'),
        }),
      ).toBe(true);
    });

    it('treats fulfilled provider_error envelope as pipeline failure', () => {
      expect(
        isVehicleAlertsDashboardPipelineFailed({
          status: 'fulfilled',
          value: buildVehicleAlertsTestEnvelope([], {
            connectionStatus: 'provider_error',
            freshness: 'error',
            message: 'HM raw fetch failed',
          }),
        }),
      ).toBe(true);
    });

    it('does not treat not_connected as pipeline failure', () => {
      expect(
        isVehicleAlertsDashboardPipelineFailed({
          status: 'fulfilled',
          value: buildVehicleAlertsTestEnvelope([], {
            connectionStatus: 'not_connected',
            supportStatus: 'not_connected',
            freshness: 'no_data',
          }),
        }),
      ).toBe(false);
    });
  });
});
