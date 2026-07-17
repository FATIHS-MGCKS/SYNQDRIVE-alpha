import { BrakeHealthAlertResolutionReason, BrakeHealthAlertStatus } from '@prisma/client';
import {
  buildBrakeAlertDedupeKey,
  buildBrakeAlertNotificationCode,
  hashEvidenceFingerprint,
  localizeBrakeAlertMessage,
} from './brake-health-alert.registry';
import {
  buildBrakeHealthAlerts,
  candidatesToCanonicalAlerts,
  hasWearOrSafetyAlert,
} from './brake-health-alert.builder';
import { BrakeHealthAlertService } from './brake-health-alert.service';

const ORG = 'org-1';
const VEHICLE = 'veh-1';

describe('brake-health-alert.builder', () => {
  it('separates estimated wear warnings from measured critical alerts', () => {
    const alerts = buildBrakeHealthAlerts({
      organizationId: ORG,
      vehicleId: VEHICLE,
      initialized: true,
      frontPadCondition: 'WARNING',
      rearPadCondition: 'GOOD',
      frontDiscCondition: 'GOOD',
      rearDiscCondition: 'GOOD',
      frontPadBasis: 'ESTIMATED',
      rearPadBasis: 'ESTIMATED',
      frontDiscBasis: 'ESTIMATED',
      rearDiscBasis: 'ESTIMATED',
      minRemainingKm: 2500,
      fluidCondition: 'UNKNOWN',
      dtcCondition: 'UNKNOWN',
      immediateReplacement: false,
      wearSensorActive: false,
      coverageGap: false,
      distanceConflict: false,
      specUnconfirmed: false,
      staleEvidence: false,
      overallConfidence: 'MEDIUM',
    });

    expect(alerts.some((a) => a.alertType === 'PAD_WARNING')).toBe(true);
    expect(alerts.some((a) => a.alertType === 'LOW_REMAINING_KM')).toBe(true);
    expect(alerts.every((a) => a.category === 'WEAR' || a.category === 'SAFETY' || a.category === 'DATA_QUALITY')).toBe(true);
  });

  it('emits measured critical pad alert with DE/EN text', () => {
    const alerts = buildBrakeHealthAlerts({
      organizationId: ORG,
      vehicleId: VEHICLE,
      initialized: true,
      frontPadCondition: 'CRITICAL',
      rearPadCondition: 'GOOD',
      frontDiscCondition: 'GOOD',
      rearDiscCondition: 'GOOD',
      frontPadBasis: 'MEASURED',
      rearPadBasis: 'ESTIMATED',
      frontDiscBasis: 'ESTIMATED',
      rearDiscBasis: 'ESTIMATED',
      minRemainingKm: null,
      fluidCondition: 'UNKNOWN',
      dtcCondition: 'UNKNOWN',
      immediateReplacement: false,
      wearSensorActive: false,
      coverageGap: false,
      distanceConflict: false,
      specUnconfirmed: false,
      staleEvidence: false,
      overallConfidence: 'HIGH',
    });

    const dto = candidatesToCanonicalAlerts(alerts).find((a) => a.alertType === 'PAD_CRITICAL');
    expect(dto?.displayMode).toBe('MEASURED');
    expect(dto?.message).toContain('gemessene');
    expect(dto?.messageEn).toContain('measured');
  });

  it('does not treat coverage gap as wear/safety alert', () => {
    const alerts = candidatesToCanonicalAlerts(
      buildBrakeHealthAlerts({
        organizationId: ORG,
        vehicleId: VEHICLE,
        initialized: true,
        frontPadCondition: 'GOOD',
        rearPadCondition: 'GOOD',
        frontDiscCondition: 'GOOD',
        rearDiscCondition: 'GOOD',
        frontPadBasis: 'ESTIMATED',
        rearPadBasis: 'ESTIMATED',
        frontDiscBasis: 'ESTIMATED',
        rearDiscBasis: 'ESTIMATED',
        minRemainingKm: 12000,
        fluidCondition: 'UNKNOWN',
        dtcCondition: 'UNKNOWN',
        immediateReplacement: false,
        wearSensorActive: false,
        coverageGap: true,
        distanceConflict: false,
        specUnconfirmed: false,
        staleEvidence: false,
        overallConfidence: 'MEDIUM',
      }),
    );

    expect(alerts.some((a) => a.alertType === 'COVERAGE_GAP')).toBe(true);
    expect(hasWearOrSafetyAlert(alerts)).toBe(false);
  });

  it('emits ABS and generic brake DTC safety alerts', () => {
    const absAlerts = buildBrakeHealthAlerts({
      organizationId: ORG,
      vehicleId: VEHICLE,
      initialized: true,
      frontPadCondition: 'GOOD',
      rearPadCondition: 'GOOD',
      frontDiscCondition: 'GOOD',
      rearDiscCondition: 'GOOD',
      frontPadBasis: 'ESTIMATED',
      rearPadBasis: 'ESTIMATED',
      frontDiscBasis: 'ESTIMATED',
      rearDiscBasis: 'ESTIMATED',
      minRemainingKm: null,
      fluidCondition: 'UNKNOWN',
      dtcCondition: 'WARNING',
      dtcCode: 'C0035',
      dtcCategory: 'ABS',
      immediateReplacement: false,
      wearSensorActive: false,
      coverageGap: false,
      distanceConflict: false,
      specUnconfirmed: false,
      staleEvidence: false,
      overallConfidence: 'MEDIUM',
    });
    expect(absAlerts.some((a) => a.alertType === 'ABS_WARNING')).toBe(true);

    const brakeAlerts = buildBrakeHealthAlerts({
      organizationId: ORG,
      vehicleId: VEHICLE,
      initialized: true,
      frontPadCondition: 'GOOD',
      rearPadCondition: 'GOOD',
      frontDiscCondition: 'GOOD',
      rearDiscCondition: 'GOOD',
      frontPadBasis: 'ESTIMATED',
      rearPadBasis: 'ESTIMATED',
      frontDiscBasis: 'ESTIMATED',
      rearDiscBasis: 'ESTIMATED',
      minRemainingKm: null,
      fluidCondition: 'UNKNOWN',
      dtcCondition: 'WARNING',
      dtcCode: 'C1220',
      dtcCategory: 'BRAKE_SYSTEM',
      immediateReplacement: false,
      wearSensorActive: false,
      coverageGap: false,
      distanceConflict: false,
      specUnconfirmed: false,
      staleEvidence: false,
      overallConfidence: 'MEDIUM',
    });
    expect(brakeAlerts.some((a) => a.alertType === 'BRAKE_DTC')).toBe(true);
  });
});

describe('BrakeHealthAlertService', () => {
  const rows: Array<Record<string, unknown>> = [];

  const prisma = {
    brakeHealthAlert: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        rows.filter((row) => {
          if (where.vehicleId && row.vehicleId !== where.vehicleId) return false;
          if (where.organizationId && row.organizationId !== where.organizationId) return false;
          if (where.status && row.status !== where.status) return false;
          return true;
        }),
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `alert-${rows.length + 1}`, ...data };
        rows.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = rows.findIndex((row) => row.id === where.id);
        rows[idx] = { ...rows[idx], ...data };
        return rows[idx];
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const row of rows) {
          if (where.vehicleId && row.vehicleId !== where.vehicleId) continue;
          if (where.status && row.status !== where.status) continue;
          if (where.alertType && row.alertType !== where.alertType) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      }),
    },
  } as any;

  const service = new BrakeHealthAlertService(prisma);

  beforeEach(() => {
    rows.length = 0;
    jest.clearAllMocks();
  });

  function candidate(overrides: Record<string, unknown> = {}) {
    const fingerprint = hashEvidenceFingerprint({ alertType: 'PAD_WARNING', ...overrides });
    const dedupeKey = buildBrakeAlertDedupeKey({
      organizationId: ORG,
      vehicleId: VEHICLE,
      alertType: 'PAD_WARNING',
      evidenceFingerprint: fingerprint,
    });
    return {
      alertType: 'PAD_WARNING',
      category: 'WEAR',
      reasonCode: 'PAD_WARNING_ESTIMATED',
      code: 'BRAKE_PAD_WARNING',
      severity: 'warning',
      displayMode: 'ESTIMATED',
      axle: 'FRONT',
      evidenceFingerprint: fingerprint,
      dedupeKey,
      notifyEligible: true,
      templateParams: {
        messageDe: localizeBrakeAlertMessage('PAD_WARNING_ESTIMATED', 'de', { axle: 'FRONT' }),
        messageEn: localizeBrakeAlertMessage('PAD_WARNING_ESTIMATED', 'en', { axle: 'FRONT' }),
      },
      ...overrides,
    };
  }

  it('dedupes identical alert syncs', async () => {
    const first = candidate();
    await service.syncAlerts({
      organizationId: ORG,
      vehicleId: VEHICLE,
      candidates: [first as any],
      inputFingerprint: 'fp-1',
    });
    await service.syncAlerts({
      organizationId: ORG,
      vehicleId: VEHICLE,
      candidates: [first as any],
      inputFingerprint: 'fp-1',
    });
    expect(rows).toHaveLength(1);
  });

  it('does not re-notify on identical parallel recalculation fingerprint', async () => {
    const alert = candidate();
    const first = await service.syncAlerts({
      organizationId: ORG,
      vehicleId: VEHICLE,
      candidates: [alert as any],
      inputFingerprint: 'same-fp',
    });
    const second = await service.syncAlerts({
      organizationId: ORG,
      vehicleId: VEHICLE,
      candidates: [alert as any],
      inputFingerprint: 'same-fp',
    });
    expect(first.notificationsToEmit).toHaveLength(1);
    expect(second.notificationsToEmit).toHaveLength(0);
  });

  it('resolves alerts when evidence clears', async () => {
    const alert = candidate();
    await service.syncAlerts({
      organizationId: ORG,
      vehicleId: VEHICLE,
      candidates: [alert as any],
    });
    const result = await service.syncAlerts({
      organizationId: ORG,
      vehicleId: VEHICLE,
      candidates: [],
    });
    expect(result.resolved).toHaveLength(1);
    expect(rows[0].status).toBe(BrakeHealthAlertStatus.RESOLVED);
  });

  it('resolves DTC alerts explicitly on clearance', async () => {
    rows.push({
      id: 'alert-dtc',
      organizationId: ORG,
      vehicleId: VEHICLE,
      alertType: 'BRAKE_DTC',
      status: BrakeHealthAlertStatus.OPEN,
      dedupeKey: 'dtc-key',
      reasonCode: 'BRAKE_DTC_ACTIVE',
      severity: 'warning',
      templateParamsJson: { messageDe: 'DTC' },
    });
    const count = await service.resolveOpenAlerts(
      VEHICLE,
      BrakeHealthAlertResolutionReason.DTC_CLEARED,
      { alertType: 'BRAKE_DTC' },
    );
    expect(count).toBe(1);
    expect(rows[0].resolutionReason).toBe(BrakeHealthAlertResolutionReason.DTC_CLEARED);
  });

  it('resolves component replacement alerts historically by installation id', async () => {
    rows.push({
      id: 'alert-comp',
      organizationId: ORG,
      vehicleId: VEHICLE,
      componentInstallationId: 'install-1',
      alertType: 'PAD_CRITICAL',
      status: BrakeHealthAlertStatus.OPEN,
      dedupeKey: 'comp-key',
      reasonCode: 'PAD_CRITICAL_MEASURED',
      severity: 'critical',
      templateParamsJson: { messageDe: 'Kritisch' },
    });
    const count = await service.resolveForComponentInstallation('install-1');
    expect(count).toBe(1);
    expect(rows[0].status).toBe(BrakeHealthAlertStatus.RESOLVED);
  });

  it('lists per-alert notification sources with stable codes', async () => {
    const alert = candidate({ severity: 'critical', reasonCode: 'PAD_CRITICAL_ESTIMATED' });
    await service.syncAlerts({
      organizationId: ORG,
      vehicleId: VEHICLE,
      candidates: [alert as any],
    });
    const sources = await service.listOpenAlertNotificationSources({
      organizationId: ORG,
      vehicleId: VEHICLE,
      label: 'B-AB 123',
    });
    expect(sources).toHaveLength(1);
    expect(sources[0].code).toBe(
      buildBrakeAlertNotificationCode('PAD_CRITICAL_ESTIMATED', alert.dedupeKey),
    );
  });
});
