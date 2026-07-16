import { TireEventType, TireOdometerAnchorStatus, TireSetupStatus } from '@prisma/client';
import {
  auditBackfillCandidates,
  BACKFILL_CANDIDATE_VERSION,
  BACKFILL_SCHEMA_VERSION,
  buildSyntheticBackfillFixtures,
  computeManifestHash,
} from './tire-odometer-anchor-backfill-audit';
import {
  buildAnchorApplyUpdate,
  buildBackfillEventPayload,
  buildMeasurementRequiredUpdate,
  planBackfillApply,
  validateBackfillApplyRequest,
  type BackfillApplyRequest,
} from './tire-odometer-anchor-backfill-apply';
import { assertSafeTireOdometerAnchorApplyTarget } from './tire-odometer-anchor-backfill-apply.safety';
import { TireOdometerAnchorBackfillService } from './tire-odometer-anchor-backfill.service';

function baseApplyRequest(overrides: Partial<BackfillApplyRequest> = {}): BackfillApplyRequest {
  return {
    apply: false,
    expectedCandidateVersion: BACKFILL_CANDIDATE_VERSION,
    confirmGitRef: 'abc123',
    confirmSchemaVersion: BACKFILL_SCHEMA_VERSION,
    confirmBackup: true,
    operator: 'ops@test',
    reason: 'prompt-8-test',
    maxBatchSize: 25,
    ...overrides,
  };
}

function auditRowsFromFixtures() {
  return auditBackfillCandidates(buildSyntheticBackfillFixtures(), {
    mode: 'fixtures',
    auditSalt: 'test-salt',
  }).setups;
}

describe('tire-odometer-anchor-backfill-apply guards', () => {
  const rows = auditRowsFromFixtures();

  it('defaults to dry run without apply flag', () => {
    const plan = planBackfillApply({
      auditRows: rows,
      request: baseApplyRequest({ organizationId: 'org-1' }),
    });
    expect(plan.dryRun).toBe(true);
    expect(plan.autoApplicable.length).toBeGreaterThan(0);
  });

  it('rejects apply without --apply semantics (validate is no-op when apply=false)', () => {
    expect(() =>
      validateBackfillApplyRequest(
        baseApplyRequest({ apply: false, organizationId: 'org-1' }),
      ),
    ).not.toThrow();
  });

  it('rejects apply without organization or setup selection', () => {
    expect(() =>
      validateBackfillApplyRequest(baseApplyRequest({ apply: true })),
    ).toThrow(/organization-id or explicit --setup-id/);
  });

  it('rejects apply without backup confirmation', () => {
    expect(() =>
      validateBackfillApplyRequest(
        baseApplyRequest({
          apply: true,
          organizationId: 'org-1',
          confirmBackup: false,
        }),
      ),
    ).toThrow(/confirm-backup/);
  });

  it('rejects candidate version mismatch', () => {
    expect(() =>
      validateBackfillApplyRequest(
        baseApplyRequest({
          apply: true,
          organizationId: 'org-1',
          expectedCandidateVersion: 'wrong-version',
        }),
      ),
    ).toThrow(/Candidate version mismatch/);
  });

  it('rejects manifest hash mismatch on apply', () => {
    const scoped = rows.filter((r) => r.organizationId === 'org-1');
    expect(() =>
      planBackfillApply({
        auditRows: scoped,
        request: baseApplyRequest({
          apply: true,
          organizationId: 'org-1',
          expectedManifestHash: 'deadbeefdeadbeef',
        }),
      }),
    ).toThrow(/Manifest hash mismatch/);
  });

  it('accepts matching manifest hash on apply', () => {
    const scoped = rows.filter((r) => r.organizationId === 'org-1');
    const manifestHash = computeManifestHash(
      scoped.map((r) => ({ setupId: r.setupId, candidateHash: r.candidateHash })),
    );
    const plan = planBackfillApply({
      auditRows: scoped,
      request: baseApplyRequest({
        apply: true,
        organizationId: 'org-1',
        expectedManifestHash: manifestHash,
        maxBatchSize: 10,
      }),
    });
    expect(plan.manifestHash).toBe(manifestHash);
    expect(plan.autoApplicable.some((i) => i.setupId === 'fixture-exact')).toBe(true);
  });
});

describe('tire-odometer-anchor-backfill-apply classification', () => {
  const rows = auditRowsFromFixtures();

  it('auto-applies EXACT confidence', () => {
    const plan = planBackfillApply({
      auditRows: rows,
      request: baseApplyRequest({ organizationId: 'org-1' }),
    });
    expect(plan.autoApplicable.some((i) => i.setupId === 'fixture-exact')).toBe(true);
    expect(plan.autoApplicable.find((i) => i.setupId === 'fixture-exact')?.confidence).toBe(
      'EXACT',
    );
  });

  it('auto-applies HIGH_CONFIDENCE', () => {
    const plan = planBackfillApply({
      auditRows: rows,
      request: baseApplyRequest({ organizationId: 'org-1' }),
    });
    expect(plan.autoApplicable.some((i) => i.setupId === 'fixture-dimo-high')).toBe(true);
  });

  it('rejects MEDIUM_CONFIDENCE for auto apply (manual review only)', () => {
    const plan = planBackfillApply({
      auditRows: rows,
      request: baseApplyRequest({ organizationId: 'org-2' }),
    });
    expect(plan.autoApplicable.some((i) => i.setupId === 'fixture-medium-handover')).toBe(false);
    expect(plan.manualReview.some((i) => i.setupId === 'fixture-medium-handover')).toBe(true);
  });

  it('routes NO_SAFE_CANDIDATE to measurement required when flagged', () => {
    const plan = planBackfillApply({
      auditRows: rows,
      request: baseApplyRequest({
        organizationId: 'org-3',
        applyMeasurementRequiredStatus: true,
        apply: true,
        maxBatchSize: 5,
      }),
    });
    expect(plan.measurementRequired.some((i) => i.setupId === 'fixture-none')).toBe(true);
    const update = buildMeasurementRequiredUpdate();
    expect(update.odometerAnchorStatus).toBe('MEASUREMENT_REQUIRED');
    expect(update.installedOdometerKm).toBeNull();
  });

  it('scopes by organization (cross-tenant isolation)', () => {
    const planOrg1 = planBackfillApply({
      auditRows: rows,
      request: baseApplyRequest({ organizationId: 'org-1' }),
    });
    expect(planOrg1.autoApplicable.every((i) => i.organizationId === 'org-1')).toBe(true);
    expect(planOrg1.autoApplicable.some((i) => i.setupId === 'fixture-hm-high')).toBe(false);

    const planOrg2 = planBackfillApply({
      auditRows: rows,
      request: baseApplyRequest({ organizationId: 'org-2' }),
    });
    expect(planOrg2.autoApplicable.some((i) => i.setupId === 'fixture-hm-high')).toBe(true);
    expect(planOrg2.autoApplicable.some((i) => i.setupId === 'fixture-exact')).toBe(false);
  });

  it('enforces batch limit on apply', () => {
    expect(() =>
      planBackfillApply({
        auditRows: rows,
        request: baseApplyRequest({
          apply: true,
          organizationId: 'org-1',
          maxBatchSize: 1,
        }),
      }),
    ).toThrow(/Batch limit exceeded/);
  });

  it('skips idempotent candidate hash replays', () => {
    const exact = rows.find((r) => r.setupId === 'fixture-exact')!;
    const plan = planBackfillApply({
      auditRows: rows,
      request: baseApplyRequest({ organizationId: 'org-1' }),
      existingBackfillHashes: new Set([`${exact.setupId}:${exact.candidateHash}`]),
    });
    expect(plan.skipped.some((i) => i.action === 'SKIP_IDEMPOTENT')).toBe(true);
  });

  it('skips already anchored setups', () => {
    const plan = planBackfillApply({
      auditRows: rows,
      request: baseApplyRequest({ organizationId: 'org-1' }),
      alreadyAnchoredSetupIds: new Set(['fixture-exact']),
    });
    expect(plan.skipped.some((i) => i.action === 'SKIP_ALREADY_ANCHORED')).toBe(true);
  });
});

describe('tire-odometer-anchor-backfill-apply payloads', () => {
  const rows = auditRowsFromFixtures();
  const exactItem = planBackfillApply({
    auditRows: rows,
    request: baseApplyRequest({ organizationId: 'org-1' }),
  }).autoApplicable.find((i) => i.setupId === 'fixture-exact')!;

  it('builds anchor update with source, captured at, confidence', () => {
    const update = buildAnchorApplyUpdate(exactItem);
    expect(update.installedOdometerKm).toBe(45200);
    expect(update.installedOdometerSource).toBe('DOCUMENTED');
    expect(update.installedOdometerCapturedAt).toBeInstanceOf(Date);
    expect(update.odometerAnchorStatus).toBe('ANCHORED');
    expect(update.odometerAnchorConfidence).toBeGreaterThanOrEqual(88);
  });

  it('builds tire event payload with audit log and evidence summary', () => {
    const payload = buildBackfillEventPayload({
      item: exactItem,
      operator: 'ops@test',
      reason: 'test',
      auditLog: [],
    });
    expect(payload.command).toBe('odometerAnchorBackfill');
    expect(payload.candidateEvidenceSummary).toEqual(
      expect.objectContaining({
        odometerKm: 45200,
        source: 'DOCUMENTED_INSTALL_MEASUREMENT',
      }),
    );
    expect(payload.operator).toBe('ops@test');
    expect(payload.auditLog).toEqual([]);
  });
});

describe('TireOdometerAnchorBackfillService', () => {
  const rows = auditRowsFromFixtures();
  const mockTx = {
    vehicleTireSetup: { update: jest.fn() },
    vehicleTireSetupMountPeriod: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
    tireEvent: { create: jest.fn() },
  };
  const mockPrisma = {
    vehicleTireSetup: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    tireEvent: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx)),
  } as any;
  const mockHealth = { recalculate: jest.fn() } as any;
  const svc = new TireOdometerAnchorBackfillService(mockPrisma, mockHealth);

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.vehicleTireSetup.findUnique.mockImplementation(async ({ where }: any) => ({
      id: where.id,
      vehicleId: `veh-${where.id}`,
      organizationId: 'org-1',
      installedAt: new Date('2026-03-15T10:00:00.000Z'),
      status: TireSetupStatus.ACTIVE,
      odometerAnchorStatus: TireOdometerAnchorStatus.ANCHOR_REQUIRED,
      installedOdometerKm: null,
    }));
  });

  it('dry run does not write', async () => {
    mockPrisma.vehicleTireSetup.findMany.mockResolvedValue([]);
    const { result } = await svc.run({
      request: baseApplyRequest({ organizationId: 'org-1' }),
    });
    expect(result.dryRun).toBe(true);
    expect(result.applied).toBe(0);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('execute applies EXACT anchor and creates tire event', async () => {
    const exact = rows.find((r) => r.setupId === 'fixture-exact')!;
    const plan = svc.planFromAuditRows([exact], baseApplyRequest({ organizationId: 'org-1' }));
    expect(plan.autoApplicable).toHaveLength(1);

    const item = plan.autoApplicable[0]!;
    const applyResult = await (svc as any).executeApply(
      plan,
      baseApplyRequest({ apply: true, organizationId: 'org-1', operator: 'ops@test' }),
    );

    expect(applyResult.applied).toBe(1);
    expect(mockTx.vehicleTireSetup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'fixture-exact' },
        data: expect.objectContaining({
          installedOdometerKm: 45200,
          odometerAnchorStatus: TireOdometerAnchorStatus.ANCHORED,
        }),
      }),
    );
    expect(mockTx.tireEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: TireEventType.ODOMETER_ANCHOR_BACKFILLED,
          tireSetId: 'fixture-exact',
          payload: expect.objectContaining({
            candidateHash: exact.candidateHash,
            candidateEvidenceSummary: expect.any(Object),
          }),
        }),
      }),
    );
    expect(item.setupId).toBe('fixture-exact');
  });

  it('re-applies idempotently without duplicate writes when hash already exists', () => {
    const exact = rows.find((r) => r.setupId === 'fixture-exact')!;
    const first = svc.planFromAuditRows([exact], baseApplyRequest({ organizationId: 'org-1' }));
    const second = svc.planFromAuditRows([exact], baseApplyRequest({ organizationId: 'org-1' }), {
      existingBackfillHashes: new Set([`${exact.setupId}:${exact.candidateHash}`]),
    });
    expect(first.autoApplicable).toHaveLength(1);
    expect(second.autoApplicable).toHaveLength(0);
    expect(second.skipped.some((s) => s.action === 'SKIP_IDEMPOTENT')).toBe(true);
  });

  it('rejects cross-tenant setup at execute time', async () => {
    mockPrisma.vehicleTireSetup.findUnique.mockResolvedValue({
      id: 'fixture-exact',
      vehicleId: 'veh-1',
      organizationId: 'org-other',
      installedAt: new Date(),
      status: TireSetupStatus.ACTIVE,
      odometerAnchorStatus: TireOdometerAnchorStatus.ANCHOR_REQUIRED,
      installedOdometerKm: null,
    });
    const exact = rows.find((r) => r.setupId === 'fixture-exact')!;
    const plan = svc.planFromAuditRows([exact], baseApplyRequest({ organizationId: 'org-1' }));
    const result = await (svc as any).executeApply(
      plan,
      baseApplyRequest({ apply: true, organizationId: 'org-1' }),
    );
    expect(result.applied).toBe(0);
    expect(result.errors.some((e: string) => e.includes('Cross-tenant'))).toBe(true);
  });

  it('optional recalculation is separate and batch-limited', async () => {
    const exact = rows.find((r) => r.setupId === 'fixture-exact')!;
    const dimo = rows.find((r) => r.setupId === 'fixture-dimo-high')!;
    const plan = svc.planFromAuditRows(
      [exact, dimo],
      baseApplyRequest({ organizationId: 'org-1', apply: true, maxBatchSize: 5 }),
    );
    await (svc as any).executeApply(
      plan,
      baseApplyRequest({
        apply: true,
        organizationId: 'org-1',
        recalculate: true,
        recalculateMaxVehicles: 1,
      }),
    );
    expect(mockHealth.recalculate).toHaveBeenCalledTimes(1);
  });
});

describe('tire-odometer-anchor-backfill-apply safety', () => {
  const originalUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalUrl;
    delete process.env.TIRE_ODOMETER_ANCHOR_APPLY_ALLOW_PROD;
    delete process.env.TIRE_ODOMETER_ANCHOR_APPLY_ALLOW_REMOTE;
  });

  it('blocks production-like DATABASE_URL without override', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@vps.synq/prod';
    expect(() => assertSafeTireOdometerAnchorApplyTarget()).toThrow(/production-like/);
  });
});
