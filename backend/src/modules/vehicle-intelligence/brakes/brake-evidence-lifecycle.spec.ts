import {
  BrakeAxle,
  BrakeComponentStatus,
  BrakeEvidenceConfirmationStatus,
  BrakeEvidenceFreshnessStatus,
  BrakeEvidenceSource,
} from '@prisma/client';
import {
  aggregateActiveSafetySignals,
  buildEvidenceDedupeKey,
  computeImmediateReplacementExpiresAt,
  isActiveEvidence,
  isMmGroundTruth,
  resolveEffectiveFreshness,
  stripUntrustedMm,
} from './brake-evidence.domain';
import { BrakeEvidenceService } from './brake-evidence.service';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const VEHICLE_A = 'veh-a';
const VEHICLE_B = 'veh-b';

function makeDedupeInput(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORG_A,
    vehicleId: VEHICLE_A,
    source: BrakeEvidenceSource.AI_UPLOAD_UNCONFIRMED,
    axle: BrakeAxle.FRONT,
    measuredPadMm: 4.2,
    sourceTimestamp: new Date('2026-07-17T10:00:00Z'),
    ...overrides,
  };
}

describe('brake-evidence.domain lifecycle', () => {
  it('strips mm from unconfirmed AI uploads', () => {
    const stripped = stripUntrustedMm(
      BrakeEvidenceSource.AI_UPLOAD_UNCONFIRMED,
      BrakeEvidenceConfirmationStatus.UNCONFIRMED,
      { measuredPadMm: 3.5, measuredDiscMm: null },
    );
    expect(stripped.measuredPadMm).toBe(3.5);
  });

  it('does not treat unconfirmed AI mm as ground truth', () => {
    expect(
      isMmGroundTruth({
        source: BrakeEvidenceSource.AI_UPLOAD_UNCONFIRMED,
        active: true,
        measuredPadMm: 3.5,
        confirmationStatus: BrakeEvidenceConfirmationStatus.UNCONFIRMED,
      }),
    ).toBe(false);
  });

  it('dedupes duplicate AI uploads within the same timestamp bucket', () => {
    const a = buildEvidenceDedupeKey(makeDedupeInput());
    const b = buildEvidenceDedupeKey(
      makeDedupeInput({ sourceTimestamp: new Date('2026-07-17T10:15:00Z') }),
    );
    expect(a).toBe(b);
  });

  it('treats cleared DTC evidence as inactive', () => {
    expect(
      isActiveEvidence({
        source: BrakeEvidenceSource.DTC_SIGNAL,
        dtcActive: false,
        active: false,
        resolvedAt: new Date(),
        dtcSeverity: 'WARNING',
      }),
    ).toBe(false);
  });

  it('treats active fresh DTC evidence as active', () => {
    expect(
      isActiveEvidence({
        source: BrakeEvidenceSource.DTC_SIGNAL,
        dtcActive: true,
        active: true,
        dtcSeverity: 'WARNING',
        freshnessStatus: BrakeEvidenceFreshnessStatus.FRESH,
        dtcFreshness: 'FRESH',
      }),
    ).toBe(true);
  });

  it('excludes stale DTC evidence from active safety', () => {
    expect(
      isActiveEvidence({
        source: BrakeEvidenceSource.DTC_SIGNAL,
        dtcActive: true,
        active: true,
        dtcSeverity: 'WARNING',
        dtcFreshness: 'STALE',
        freshnessStatus: BrakeEvidenceFreshnessStatus.STALE,
      }),
    ).toBe(false);
  });

  it('accepts wear-sensor mm as ground truth when active', () => {
    expect(
      isMmGroundTruth({
        source: BrakeEvidenceSource.BRAKE_WEAR_SENSOR,
        active: true,
        measuredPadMm: 2.1,
        confirmationStatus: BrakeEvidenceConfirmationStatus.NOT_APPLICABLE,
      }),
    ).toBe(true);
  });

  it('marks expired immediate-replacement evidence inactive', () => {
    const expiresAt = new Date('2026-01-01T00:00:00Z');
    expect(
      isActiveEvidence(
        {
          source: BrakeEvidenceSource.WORKSHOP_MEASUREMENT,
          active: true,
          immediateReplacement: true,
          expiresAt,
        },
        new Date('2026-07-01T00:00:00Z'),
      ),
    ).toBe(false);
    expect(resolveEffectiveFreshness(
      {
        source: BrakeEvidenceSource.WORKSHOP_MEASUREMENT,
        expiresAt,
      },
      new Date('2026-07-01T00:00:00Z'),
    )).toBe(
      BrakeEvidenceFreshnessStatus.EXPIRED,
    );
  });

  it('excludes superseded evidence from active evaluation', () => {
    expect(
      isActiveEvidence({
        source: BrakeEvidenceSource.MANUAL_MEASUREMENT,
        active: false,
        supersededByEvidenceId: 'newer-row',
        measuredPadMm: 5,
      }),
    ).toBe(false);
  });

  it('aggregates multiple active safety signals with highest severity', () => {
    const aggregated = aggregateActiveSafetySignals([
      {
        id: 'e1',
        source: BrakeEvidenceSource.DTC_SIGNAL,
        dtcSeverity: 'WARNING',
        dtcActive: true,
        active: true,
        dtcCode: 'C0035',
        freshnessStatus: BrakeEvidenceFreshnessStatus.FRESH,
      },
      {
        id: 'e2',
        source: BrakeEvidenceSource.WORKSHOP_MEASUREMENT,
        immediateReplacement: true,
        active: true,
        freshnessStatus: BrakeEvidenceFreshnessStatus.FRESH,
      },
    ]);

    expect(aggregated.severity).toBe('critical');
    expect(aggregated.reasons).toHaveLength(2);
    expect(aggregated.condition).toBe('CRITICAL');
  });

  it('supports partial-axle safety without inventing mm on the other axle', () => {
    const aggregated = aggregateActiveSafetySignals([
      {
        id: 'front',
        source: BrakeEvidenceSource.MANUAL_MEASUREMENT,
        axle: BrakeAxle.FRONT,
        brakeFluidStatus: BrakeComponentStatus.CRITICAL,
        active: true,
        freshnessStatus: BrakeEvidenceFreshnessStatus.FRESH,
      },
    ]);

    expect(aggregated.signals[0]?.axle).toBe(BrakeAxle.FRONT);
    expect(aggregated.severity).toBe('critical');
  });

  it('computes immediate-replacement expiry from observation time', () => {
    const observedAt = new Date('2026-07-01T00:00:00Z');
    const expiresAt = computeImmediateReplacementExpiresAt(observedAt);
    expect(expiresAt.getTime()).toBeGreaterThan(observedAt.getTime());
  });
});

describe('BrakeEvidenceService lifecycle + dedupe', () => {
  const rows: Array<Record<string, unknown>> = [];

  const mockPrisma = {
    vehicle: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === VEHICLE_A) return { organizationId: ORG_A };
        if (where.id === VEHICLE_B) return { organizationId: ORG_B };
        return null;
      }),
    },
    brakeEvidence: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          rows.find((row) => {
            if (where.vehicleId && row.vehicleId !== where.vehicleId) return false;
            if (where.organizationId && row.organizationId !== where.organizationId) return false;
            if (where.dedupeKey && row.dedupeKey !== where.dedupeKey) return false;
            if (where.active === true && row.active !== true) return false;
            if (where.supersededByEvidenceId === null && row.supersededByEvidenceId != null) {
              return false;
            }
            return true;
          }) ?? null
        );
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        return rows.find((row) => row.id === where.id) ?? null;
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return rows.filter((row) => {
          if (where.vehicleId && row.vehicleId !== where.vehicleId) return false;
          if (where.supersededByEvidenceId === null && row.supersededByEvidenceId != null) {
            return false;
          }
          return true;
        });
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `ev-${rows.length + 1}`, ...data };
        rows.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = rows.findIndex((row) => row.id === where.id);
        rows[idx] = { ...rows[idx], ...data };
        return rows[idx];
      }),
    },
  } as any;

  const recalcOrchestrator = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const svc = new BrakeEvidenceService(mockPrisma, recalcOrchestrator as never);

  beforeEach(() => {
    rows.length = 0;
    jest.clearAllMocks();
  });

  it('dedupes duplicate AI producer retries into one active row', async () => {
    const input = {
      vehicleId: VEHICLE_A,
      source: BrakeEvidenceSource.AI_UPLOAD_UNCONFIRMED,
      axle: BrakeAxle.FRONT,
      measuredPadMm: 4.2,
      sourceTimestamp: new Date('2026-07-17T10:00:00Z'),
      externalSourceId: 'ocr-page-1',
    };

    await svc.record(input);
    await svc.record({ ...input, sourceTimestamp: new Date('2026-07-17T10:10:00Z') });

    expect(rows).toHaveLength(1);
    expect(rows[0].measuredPadMm).toBe(4.2);
    expect(rows[0].confirmationStatus).toBe(BrakeEvidenceConfirmationStatus.UNCONFIRMED);
    expect(isMmGroundTruth(rows[0] as any)).toBe(false);
  });

  it('promotes confirmed AI evidence to ground-truth mm', async () => {
    const created = await svc.record({
      vehicleId: VEHICLE_A,
      source: BrakeEvidenceSource.AI_UPLOAD_UNCONFIRMED,
      axle: BrakeAxle.FRONT,
      measuredPadMm: 4.2,
      externalSourceId: 'ocr-page-2',
    });
    const confirmed = await svc.confirmEvidence({
      evidenceId: created!.id as string,
      confirmedBy: 'user-1',
    });

    expect(confirmed?.source).toBe(BrakeEvidenceSource.AI_UPLOAD_CONFIRMED);
    expect(confirmed?.confirmationStatus).toBe(BrakeEvidenceConfirmationStatus.CONFIRMED);
    expect(isMmGroundTruth(confirmed!)).toBe(true);
  });

  it('isolates dedupe keys per tenant', async () => {
    await svc.record({
      vehicleId: VEHICLE_A,
      source: BrakeEvidenceSource.AI_UPLOAD_CONFIRMED,
      axle: BrakeAxle.FRONT,
      measuredPadMm: 5,
      externalSourceId: 'shared-ext',
    });
    await svc.record({
      vehicleId: VEHICLE_B,
      source: BrakeEvidenceSource.AI_UPLOAD_CONFIRMED,
      axle: BrakeAxle.FRONT,
      measuredPadMm: 5,
      externalSourceId: 'shared-ext',
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].organizationId).toBe(ORG_A);
    expect(rows[1].organizationId).toBe(ORG_B);
  });

  it('returns aggregated active safety signals instead of only the latest row', async () => {
    await svc.record({
      vehicleId: VEHICLE_A,
      source: BrakeEvidenceSource.DTC_SIGNAL,
      dtcSeverity: 'WARNING',
      dtcCode: 'C0035',
      dtcActive: true,
      dedupeKey: 'dtc:C0035',
      externalSourceId: 'C0035',
    });
    await svc.record({
      vehicleId: VEHICLE_A,
      source: BrakeEvidenceSource.WORKSHOP_MEASUREMENT,
      axle: BrakeAxle.FRONT,
      immediateReplacement: true,
      externalSourceId: 'workshop-1',
    });

    const aggregated = await svc.getActiveSafetySignals(VEHICLE_A);
    expect(aggregated.signals.length).toBeGreaterThanOrEqual(2);
    expect(aggregated.severity).toBe('critical');
  });

  it('marks superseded evidence inactive', async () => {
    const oldRow = await svc.record({
      vehicleId: VEHICLE_A,
      source: BrakeEvidenceSource.MANUAL_MEASUREMENT,
      axle: BrakeAxle.FRONT,
      measuredPadMm: 6,
      externalSourceId: 'manual-old',
    });
    const newRow = await svc.record({
      vehicleId: VEHICLE_A,
      source: BrakeEvidenceSource.MANUAL_MEASUREMENT,
      axle: BrakeAxle.FRONT,
      measuredPadMm: 6.5,
      externalSourceId: 'manual-new',
    });
    await svc.supersedeEvidence(oldRow!.id as string, newRow!.id as string);

    const oldStored = rows.find((row) => row.id === oldRow!.id);
    expect(oldStored?.active).toBe(false);
    expect(oldStored?.supersededByEvidenceId).toBe(newRow!.id);
  });
});
