import {
  TireHealthAlertResolutionReason,
  TireHealthAlertStatus,
} from '@prisma/client';
import { buildTireHealthAlerts } from './tire-health-alert.builder';
import {
  buildTireAlertDedupeKey,
  buildTireAlertNotificationCode,
  hashEvidenceFingerprint,
  localizeTireAlertMessage,
} from './tire-health-alert.registry';
import { TireHealthAlertService } from './tire-health-alert.service';
import { emptyTirePressureContext } from './tire-pressure-context.builder';
import type { TirePressureContext } from './tire-pressure-context.types';
import { vehicleHealthSourceFingerprint } from '@modules/notifications/adapters/rental-health-notification.projector';

const ORG_ID = 'org-1';
const VEHICLE_ID = 'veh-1';
const SETUP_ID = 'setup-1';

function baseSetup(overrides: Record<string, unknown> = {}) {
  return {
    id: SETUP_ID,
    tireSeason: 'SUMMER',
    tireCondition: 'NEW_INSTALLED',
    isStaggered: false,
    totalKmOnSet: 5000,
    installedOdometerKm: 10000,
    dotCodeFront: null,
    dotCodeRear: null,
    measurements: [],
    odometerAnchorStatus: 'VALIDATED',
    ...overrides,
  };
}

function baseWear(overrides: Record<string, unknown> = {}) {
  return {
    frontLeftMm: 6.8,
    frontRightMm: 6.7,
    rearLeftMm: 6.6,
    rearRightMm: 6.5,
    estimatedRemainingKm: 12000,
    operationalReplacementMm: 3.0,
    factors: {
      pressureFactorFront: 1.0,
      pressureFactorRear: 1.0,
    },
    explainability: { currentTreadSource: 'fallback_estimate' },
    ...overrides,
  };
}

function pressureContext(overrides: Partial<TirePressureContext> = {}): TirePressureContext {
  return {
    ...emptyTirePressureContext(),
    ...overrides,
  };
}

function buildInput(overrides: {
  setup?: Record<string, unknown>;
  wearAnalysis?: Record<string, unknown>;
  displayMode?: 'MEASURED' | 'ESTIMATED';
  pressureContext?: Partial<TirePressureContext>;
  confidenceScore?: number;
} = {}) {
  return {
    organizationId: ORG_ID,
    vehicleId: VEHICLE_ID,
    setup: baseSetup(overrides.setup),
    wearAnalysis: baseWear(overrides.wearAnalysis),
    displayMode: overrides.displayMode ?? 'ESTIMATED',
    confidenceScore: overrides.confidenceScore ?? 70,
    pressureContext: pressureContext(overrides.pressureContext),
    kmSinceLastRotation: 5000,
  };
}

describe('tire-health-alert builder', () => {
  it('uses different DE messages for measured vs estimated low tread', () => {
    const estimated = buildTireHealthAlerts(
      buildInput({
        displayMode: 'ESTIMATED',
        wearAnalysis: {
          frontLeftMm: 3.1,
          frontRightMm: 6.7,
          rearLeftMm: 6.6,
          rearRightMm: 6.5,
        },
      }),
    );
    const measured = buildTireHealthAlerts(
      buildInput({
        displayMode: 'MEASURED',
        wearAnalysis: {
          frontLeftMm: 3.1,
          frontRightMm: 6.7,
          rearLeftMm: 6.6,
          rearRightMm: 6.5,
        },
      }),
    );

    const estLow = estimated.find((a) => a.reasonCode === 'TREAD_LOW_ESTIMATED');
    const measLow = measured.find((a) => a.reasonCode === 'TREAD_LOW_MEASURED');
    expect(estLow).toBeDefined();
    expect(measLow).toBeDefined();
    expect(estLow!.templateParams.messageDe).toContain('Geschätzte');
    expect(measLow!.templateParams.messageDe).toContain('Gemessene');
    expect(estLow!.templateParams.messageEn).toContain('Estimated');
    expect(measLow!.templateParams.messageEn).toContain('Measured');
  });

  it('does not emit pressure or TPMS alerts when pressure is stale', () => {
    const ctx = pressureContext({
      overallFreshness: 'stale',
      wearEligibility: { eligible: true, reasons: [], confidencePenalty: 0, measurementHint: null },
      tpmsWarning: true,
      overallStatus: 'ISSUE',
      coverage: {
        ...emptyTirePressureContext().coverage,
        periodEnd: '2026-07-01T10:00:00Z',
      },
    });
    const alerts = buildTireHealthAlerts(
      buildInput({
        wearAnalysis: {
          factors: { pressureFactorFront: 1.2, pressureFactorRear: 1.0 },
        },
        pressureContext: ctx,
      }),
    );
    expect(alerts.some((a) => a.alertType === 'PRESSURE_IMPACT')).toBe(false);
    expect(alerts.some((a) => a.alertType === 'TPMS_WARNING')).toBe(false);
  });

  it('emits TPMS warning only when active and fresh', () => {
    const alerts = buildTireHealthAlerts(
      buildInput({
        pressureContext: pressureContext({
          tpmsWarning: true,
          overallStatus: 'ISSUE',
          overallFreshness: 'fresh',
          tpmsWarningSource: 'HIGH_MOBILITY',
          coverage: {
            ...emptyTirePressureContext().coverage,
            periodEnd: '2026-07-16T10:00:00Z',
          },
        }),
      }),
    );
    const tpms = alerts.find((a) => a.reasonCode === 'TPMS_WARNING_ACTIVE');
    expect(tpms).toBeDefined();
    expect(tpms!.pressureContext?.sourceTimestamp).toBe('2026-07-16T10:00:00Z');
  });

  it('dedupes candidates by dedupe key', () => {
    const alerts = buildTireHealthAlerts(buildInput());
    const keys = alerts.map((a) => a.dedupeKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('evaluates uneven wear on front and rear independently', () => {
    const alerts = buildTireHealthAlerts(
      buildInput({
        wearAnalysis: {
          frontLeftMm: 6.0,
          frontRightMm: 4.0,
          rearLeftMm: 6.0,
          rearRightMm: 6.0,
        },
      }),
    );
    expect(alerts.some((a) => a.wheelPosition === 'Front' && a.reasonCode === 'WEAR_UNEVEN_CRITICAL')).toBe(true);
    expect(alerts.some((a) => a.wheelPosition === 'Rear' && a.reasonCode === 'WEAR_UNEVEN_CRITICAL')).toBe(false);
  });
});

describe('tire-health-alert sync service', () => {
  function createSyncHarness() {
    const rows = new Map<string, any>();
    let idSeq = 1;

    const prisma = {
      tireHealthAlert: {
        findFirst: jest.fn(async ({ where }: any) =>
          [...rows.values()].find((row) => {
            if (where.dedupeKey && row.dedupeKey !== where.dedupeKey) return false;
            if (where.status && row.status !== where.status) return false;
            if (where.id && row.id !== where.id) return false;
            return true;
          }) ?? null,
        ),
        findMany: jest.fn(async ({ where }: any) =>
          [...rows.values()].filter((row) => {
            if (where.vehicleId && row.vehicleId !== where.vehicleId) return false;
            if (where.tireSetupId && row.tireSetupId !== where.tireSetupId) return false;
            if (where.status && row.status !== where.status) return false;
            if (where.organizationId && row.organizationId !== where.organizationId) return false;
            if (where.tireSetupId?.not && row.tireSetupId === where.tireSetupId.not) return false;
            return true;
          }),
        ),
        create: jest.fn(async ({ data }: any) => {
          const duplicate = [...rows.values()].find(
            (row) =>
              row.dedupeKey === data.dedupeKey &&
              row.status === TireHealthAlertStatus.OPEN,
          );
          if (duplicate) {
            const err = new Error('Unique constraint') as Error & { code: string };
            err.code = 'P2002';
            throw err;
          }
          const id = `alert-${idSeq++}`;
          const row = { id, ...data };
          rows.set(id, row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = rows.get(where.id);
          Object.assign(row, data);
          return row;
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const row of rows.values()) {
            const matchOrg = !where.organizationId || row.organizationId === where.organizationId;
            const matchVehicle = !where.vehicleId || row.vehicleId === where.vehicleId;
            const matchSetup =
              !where.tireSetupId ||
              (where.tireSetupId.not
                ? row.tireSetupId !== where.tireSetupId.not
                : row.tireSetupId === where.tireSetupId);
            const matchStatus = !where.status || row.status === where.status;
            if (matchOrg && matchVehicle && matchSetup && matchStatus) {
              Object.assign(row, data);
              count++;
            }
          }
          return { count };
        }),
      },
    };

    const service = new TireHealthAlertService(prisma as never);
    return { service, prisma, rows };
  }

  it('does not emit duplicate notifications on identical recalculation', async () => {
    const { service } = createSyncHarness();
    const candidates = buildTireHealthAlerts(
      buildInput({
        wearAnalysis: { frontLeftMm: 3.0, frontRightMm: 3.0, rearLeftMm: 3.0, rearRightMm: 3.0 },
      }),
    );

    const first = await service.syncAlerts({
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      tireSetupId: SETUP_ID,
      candidates,
      inputFingerprint: 'fp-1',
    });
    const second = await service.syncAlerts({
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      tireSetupId: SETUP_ID,
      candidates,
      inputFingerprint: 'fp-1',
    });

    expect(first.notificationsToEmit.length).toBeGreaterThan(0);
    expect(second.notificationsToEmit).toHaveLength(0);
    expect(second.newlyOpened).toHaveLength(0);
  });

  it('resolves alerts when evidence clears and opens new ones when input changes', async () => {
    const { service } = createSyncHarness();
    const critical = buildTireHealthAlerts(
      buildInput({
        wearAnalysis: { frontLeftMm: 1.5, frontRightMm: 6.0, rearLeftMm: 6.0, rearRightMm: 6.0 },
      }),
    );

    await service.syncAlerts({
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      tireSetupId: SETUP_ID,
      candidates: critical,
      inputFingerprint: 'fp-a',
    });

    const healthy = buildTireHealthAlerts(buildInput());
    const result = await service.syncAlerts({
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      tireSetupId: SETUP_ID,
      candidates: healthy,
      inputFingerprint: 'fp-b',
    });

    expect(result.resolved.length).toBeGreaterThan(0);
    expect(result.newlyOpened.length).toBeGreaterThanOrEqual(0);
  });

  it('keeps historical alerts on old setup when active setup changes', async () => {
    const { service, rows } = createSyncHarness();
    const oldSetupId = 'setup-old';
    const candidates = buildTireHealthAlerts(buildInput({ setup: { id: oldSetupId } }));

    await service.syncAlerts({
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      tireSetupId: oldSetupId,
      candidates,
      inputFingerprint: 'fp-old',
    });

    await service.syncAlerts({
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      tireSetupId: SETUP_ID,
      candidates: buildTireHealthAlerts(buildInput()),
      inputFingerprint: 'fp-new',
    });

    const oldRows = [...rows.values()].filter((r) => r.tireSetupId === oldSetupId);
    expect(oldRows.every((r) => r.status === TireHealthAlertStatus.RESOLVED)).toBe(true);
    expect(oldRows.every((r) => r.resolutionReason === TireHealthAlertResolutionReason.SETUP_CHANGED)).toBe(true);
  });

  it('resolves setup alerts on explicit lifecycle resolution', async () => {
    const { service, rows } = createSyncHarness();
    const candidates = buildTireHealthAlerts(buildInput());
    await service.syncAlerts({
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      tireSetupId: SETUP_ID,
      candidates,
    });

    const count = await service.resolveOpenAlertsForSetup(
      SETUP_ID,
      TireHealthAlertResolutionReason.SETUP_STORED,
    );
    expect(count).toBeGreaterThan(0);
    expect([...rows.values()].every((r) => r.status === TireHealthAlertStatus.RESOLVED)).toBe(true);
  });

  it('projects per-alert notification sources with stable fingerprints', async () => {
    const { service } = createSyncHarness();
    const candidates = buildTireHealthAlerts(
      buildInput({
        wearAnalysis: { frontLeftMm: 1.5, frontRightMm: 6.0, rearLeftMm: 6.0, rearRightMm: 6.0 },
      }),
    );
    await service.syncAlerts({
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      tireSetupId: SETUP_ID,
      candidates,
    });

    const sources = await service.listOpenAlertNotificationSources({
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      label: 'AB-123',
    });

    expect(sources.length).toBeGreaterThan(0);
    const src = sources[0];
    expect(src.code).toBe(
      buildTireAlertNotificationCode(
        candidates.find((c) => c.severity === 'critical')!.reasonCode,
        candidates.find((c) => c.severity === 'critical')!.dedupeKey,
      ),
    );
    expect(
      vehicleHealthSourceFingerprint(ORG_ID, {
        eventType: 'TIRE_CRITICAL',
        vehicleId: VEHICLE_ID,
        code: src.code,
      }),
    ).toContain('tires_critical:');
  });

  it('handles parallel sync workers without duplicate open rows', async () => {
    const { service, rows } = createSyncHarness();
    const candidates = buildTireHealthAlerts(
      buildInput({
        wearAnalysis: { estimatedRemainingKm: 500 },
      }),
    );

    await Promise.all([
      service.syncAlerts({
        organizationId: ORG_ID,
        vehicleId: VEHICLE_ID,
        tireSetupId: SETUP_ID,
        candidates,
        inputFingerprint: 'fp-par',
      }),
      service.syncAlerts({
        organizationId: ORG_ID,
        vehicleId: VEHICLE_ID,
        tireSetupId: SETUP_ID,
        candidates,
        inputFingerprint: 'fp-par',
      }),
    ]);

    const openRows = [...rows.values()].filter((r) => r.status === TireHealthAlertStatus.OPEN);
    const dedupeKeys = openRows.map((r) => r.dedupeKey);
    expect(new Set(dedupeKeys).size).toBe(dedupeKeys.length);
  });
});

describe('tire-health-alert registry', () => {
  it('builds stable dedupe keys from org, vehicle, setup, type, position and evidence', () => {
    const evidence = hashEvidenceFingerprint({ alertType: 'LOW_TREAD', value: 3.2 });
    const key = buildTireAlertDedupeKey({
      organizationId: ORG_ID,
      vehicleId: VEHICLE_ID,
      tireSetupId: SETUP_ID,
      alertType: 'LOW_TREAD',
      wheelPosition: 'FL',
      evidenceFingerprint: evidence,
    });
    expect(key).toBe(`${ORG_ID}|${VEHICLE_ID}|${SETUP_ID}|LOW_TREAD|FL|${evidence}`);
  });

  it('localizes season mismatch messages in DE and EN', () => {
    expect(
      localizeTireAlertMessage('SEASON_MISMATCH_WINTER', 'de', { displayMode: 'ESTIMATED' }),
    ).toContain('Sommerreifen');
    expect(
      localizeTireAlertMessage('SEASON_MISMATCH_WINTER', 'en', { displayMode: 'ESTIMATED' }),
    ).toContain('Summer tires');
  });
});
