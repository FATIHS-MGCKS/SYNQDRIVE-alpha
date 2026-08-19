import { NotificationStatus } from '@prisma/client';
import type { DashboardWarningLight } from '@modules/vehicle-intelligence/dashboard-warning-lights/dashboard-warning-lights.types';
import { buildVehicleAlertsTestEnvelope } from '@modules/vehicle-intelligence/dashboard-warning-lights/vehicle-alerts-rental-health.projector';
import { VehicleHealthNotificationSyncService } from './vehicle-health-notification-sync.service';
import { projectVehicleAlertNotifications } from './vehicle-alerts-notification.projector';

const ORG = 'org-sync';
const VEH = 'veh-sync-1';
const LABEL = 'WOB S 1001';

function baseVehicle() {
  return {
    id: VEH,
    licensePlate: LABEL,
    make: 'VW',
    model: 'Tiguan',
    homeStationId: null,
    mileageKm: 10000,
    lastServiceDate: null,
    lastServiceOdometerKm: null,
    serviceIntervalManufacturerKm: null,
    serviceIntervalManufacturerMonths: null,
    lastTuvDate: null,
    nextTuvDate: null,
    lastBokraftDate: null,
    nextBokraftDate: null,
  };
}

function limpActive(): DashboardWarningLight {
  return {
    key: 'engine_limp_mode',
    label: 'Limp',
    state: 'active',
    severity: 'critical',
    supported: true,
    observedAt: '2026-06-16T12:00:00.000Z',
    sourceSignal: 'engine.get.limp_mode',
    sourceTimestamp: '2026-06-16T12:00:00.000Z',
    reason: 'Limp active',
    action: 'Do not rent',
    rentalImpact: 'block_rental',
    isCurrentActive: true,
    freshness: 'fresh',
  };
}

function oilLowActive(): DashboardWarningLight {
  return {
    key: 'engine_oil_level',
    label: 'Oil',
    state: 'active',
    severity: 'critical',
    supported: true,
    observedAt: '2026-06-16T12:00:00.000Z',
    sourceSignal: 'diagnostics.get.engine_oil_level',
    sourceTimestamp: '2026-06-16T12:00:00.000Z',
    reason: 'Oil low',
    action: 'Check oil',
    rentalImpact: 'block_rental',
    isCurrentActive: true,
    freshness: 'fresh',
  };
}

function oilHighActive(): DashboardWarningLight {
  return {
    key: 'engine_oil_level',
    label: 'Oil',
    state: 'active',
    severity: 'warning',
    supported: true,
    observedAt: '2026-06-16T12:00:00.000Z',
    sourceSignal: 'diagnostics.get.engine_oil_level',
    sourceTimestamp: '2026-06-16T12:00:00.000Z',
    reason: 'Oil high',
    action: 'Check oil',
    rentalImpact: 'inspect_before_next_rental',
    isCurrentActive: true,
    freshness: 'fresh',
  };
}

function quietOil(): DashboardWarningLight {
  return {
    ...oilLowActive(),
    state: 'off_confirmed',
    severity: 'info',
    rentalImpact: 'none',
    isCurrentActive: false,
    reason: 'Oil OK',
  };
}

describe('VehicleHealthNotificationSyncService — failure isolation (P2.2B)', () => {
  const prisma = {
    vehicle: {
      findMany: jest.fn(async () => [baseVehicle()]),
    },
  };

  const notificationIngest = {
    syncVehicleHealthWarnings: jest.fn(async () => undefined),
    syncServiceComplianceWarnings: jest.fn(async () => undefined),
    syncVehicleAlertsWarnings: jest.fn(async () => undefined),
    syncVehicleReadinessAggregate: jest.fn(async () => undefined),
  };

  const rentalHealth = {
    getVehicleHealth: jest.fn(async () => ({
      vehicle_id: VEH,
      organization_id: ORG,
      overall_state: 'good',
      availability: 'ready',
      rental_blocked: false,
      blocking_reasons: [],
      modules: {},
      generated_at: new Date().toISOString(),
    })),
  };

  const dtcService = {
    findActive: jest.fn(async () => []),
  };

  const serviceCompliance = {
    evaluateCompliance: jest.fn(async () => ({
      tuvOverdue: false,
      bokraftOverdue: false,
      severity: 'OK',
    })),
  };

  const dashboardWarningLights = {
    getDashboardWarningLights: jest.fn(async () =>
      buildVehicleAlertsTestEnvelope([limpActive(), quietOil()]),
    ),
  };

  let service: VehicleHealthNotificationSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VehicleHealthNotificationSyncService(
      prisma as any,
      notificationIngest as any,
      rentalHealth as any,
      dtcService as any,
      serviceCompliance as any,
      dashboardWarningLights as any,
    );
  });

  async function projectVehicleAlertsOnly() {
    const result = await (service as any).projectVehicle(ORG, baseVehicle());
    return result.vehicleAlerts;
  }

  it('A) DTC failure still projects vehicle alerts (limp active)', async () => {
    dtcService.findActive.mockRejectedValueOnce(new Error('dtc down'));
    const alerts = await projectVehicleAlertsOnly();
    expect(alerts.some((s: { eventType: string }) => s.eventType === 'LIMP_MODE_ACTIVE')).toBe(
      true,
    );
  });

  it('B) Service compliance failure still projects oil LOW', async () => {
    serviceCompliance.evaluateCompliance.mockRejectedValueOnce(new Error('compliance down'));
    dashboardWarningLights.getDashboardWarningLights.mockResolvedValueOnce(
      buildVehicleAlertsTestEnvelope([limpActive(), oilLowActive()]),
    );
    const alerts = await projectVehicleAlertsOnly();
    expect(
      alerts.some((s: { eventType: string }) => s.eventType === 'ENGINE_OIL_LEVEL_LOW'),
    ).toBe(true);
  });

  it('C) Rental health failure still projects oil HIGH', async () => {
    rentalHealth.getVehicleHealth.mockRejectedValueOnce(new Error('rental health down'));
    dashboardWarningLights.getDashboardWarningLights.mockResolvedValueOnce(
      buildVehicleAlertsTestEnvelope([limpActive(), oilHighActive()]),
    );
    const alerts = await projectVehicleAlertsOnly();
    expect(
      alerts.some((s: { eventType: string }) => s.eventType === 'ENGINE_OIL_LEVEL_HIGH'),
    ).toBe(true);
  });

  it('D) DWL failure emits UNEVALUABLE (no sources) while health/compliance still projected', async () => {
    dashboardWarningLights.getDashboardWarningLights.mockRejectedValueOnce(new Error('dwl down'));
    const result = await (service as any).projectVehicle(ORG, baseVehicle());
    expect(result.vehicleAlerts).toHaveLength(0);
    expect(rentalHealth.getVehicleHealth).toHaveBeenCalled();
    expect(serviceCompliance.evaluateCompliance).toHaveBeenCalled();
  });

  describe('sync stage failure isolation', () => {
    it('vehicle health ingest throws but vehicle alerts ingest still runs', async () => {
      notificationIngest.syncVehicleHealthWarnings.mockRejectedValueOnce(new Error('health ingest'));
      await expect(service.syncForOrganization(ORG, 'run-1')).rejects.toThrow('health ingest');
      expect(notificationIngest.syncVehicleAlertsWarnings).toHaveBeenCalled();
    });

    it('service compliance ingest throws but vehicle alerts ingest still runs', async () => {
      notificationIngest.syncServiceComplianceWarnings.mockRejectedValueOnce(
        new Error('compliance ingest'),
      );
      await expect(service.syncForOrganization(ORG, 'run-2')).rejects.toThrow('compliance ingest');
      expect(notificationIngest.syncVehicleAlertsWarnings).toHaveBeenCalled();
    });

    it('vehicle alerts ingest throws after health/compliance processed', async () => {
      notificationIngest.syncVehicleAlertsWarnings.mockRejectedValueOnce(
        new Error('vehicle alerts ingest'),
      );
      await expect(service.syncForOrganization(ORG, 'run-3')).rejects.toThrow(
        'vehicle alerts ingest',
      );
      expect(notificationIngest.syncVehicleHealthWarnings).toHaveBeenCalled();
      expect(notificationIngest.syncServiceComplianceWarnings).toHaveBeenCalled();
    });

    it('readiness aggregate ingest throws after prior stages processed', async () => {
      notificationIngest.syncVehicleReadinessAggregate.mockRejectedValueOnce(
        new Error('aggregate ingest'),
      );
      await expect(service.syncForOrganization(ORG, 'run-4')).rejects.toThrow('aggregate ingest');
      expect(notificationIngest.syncVehicleAlertsWarnings).toHaveBeenCalled();
    });
  });
});

describe('projectVehicleAlertNotifications — unevaluable envelope', () => {
  it('not_connected emits no sources', () => {
    const sources = projectVehicleAlertNotifications(
      VEH,
      LABEL,
      buildVehicleAlertsTestEnvelope([limpActive(), quietOil()], {
        connectionStatus: 'not_connected',
        supportStatus: 'not_connected',
      }),
    );
    expect(sources).toHaveLength(0);
  });
});
