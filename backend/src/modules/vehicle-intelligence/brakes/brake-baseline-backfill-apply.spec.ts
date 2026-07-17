import {
  BRAKE_BASELINE_BACKFILL_SCHEMA_VERSION,
  BRAKE_BASELINE_CANDIDATE_VERSION,
  buildSyntheticBrakeBaselineFixtures,
} from './brake-baseline-candidate-audit';
import {
  buildBrakeBaselineApplyAuditRows,
  computeBrakeBaselineReportHash,
  planBrakeBaselineBackfillApply,
  validateBrakeBaselineBackfillApplyRequest,
  type BrakeBaselineBackfillApplyRequest,
} from './brake-baseline-backfill-apply';
import { assertSafeBrakeBaselineBackfillApplyTarget } from './brake-baseline-backfill-apply.safety';
import { BrakeBaselineBackfillService } from './brake-baseline-backfill.service';
import { BrakeComponentLifecycleService } from './brake-component-lifecycle.service';
import { BrakeRecalculationOrchestratorService } from './brake-recalculation-orchestrator.service';

function baseApplyRequest(
  overrides: Partial<BrakeBaselineBackfillApplyRequest> = {},
): BrakeBaselineBackfillApplyRequest {
  return {
    apply: false,
    expectedAuditVersion: BRAKE_BASELINE_CANDIDATE_VERSION,
    confirmGitRef: 'abc123',
    confirmSchemaVersion: BRAKE_BASELINE_BACKFILL_SCHEMA_VERSION,
    confirmBackup: true,
    operator: 'ops@test',
    reason: 'prompt-12-test',
    maxBatchSize: 25,
    ...overrides,
  };
}

function fixtureInputs() {
  return buildSyntheticBrakeBaselineFixtures();
}

function fixtureRows(salt = 'test-salt') {
  return buildBrakeBaselineApplyAuditRows(fixtureInputs(), salt);
}

describe('brake-baseline-backfill-apply guards', () => {
  const rows = fixtureRows();

  it('defaults to dry run plan', () => {
    const plan = planBrakeBaselineBackfillApply({
      auditRows: rows,
      request: baseApplyRequest({ organizationId: 'org-fixture-1' }),
    });
    expect(plan.dryRun).toBe(true);
    expect(plan.autoApplicable.length).toBeGreaterThan(0);
  });

  it('rejects apply without organization or vehicle selection', () => {
    expect(() =>
      validateBrakeBaselineBackfillApplyRequest(baseApplyRequest({ apply: true })),
    ).toThrow(/organization-id or explicit --vehicle-id/);
  });

  it('rejects apply without backup confirmation', () => {
    expect(() =>
      validateBrakeBaselineBackfillApplyRequest(
        baseApplyRequest({
          apply: true,
          organizationId: 'org-fixture-1',
          confirmBackup: false,
        }),
      ),
    ).toThrow(/confirm-backup/);
  });

  it('rejects audit version mismatch', () => {
    expect(() =>
      validateBrakeBaselineBackfillApplyRequest(
        baseApplyRequest({
          apply: true,
          organizationId: 'org-fixture-1',
          expectedAuditVersion: 'wrong',
        }),
      ),
    ).toThrow(/Audit version mismatch/);
  });

  it('rejects report hash mismatch on apply', () => {
    const scoped = rows.filter((r) => r.organizationId === 'org-fixture-1');
    expect(() =>
      planBrakeBaselineBackfillApply({
        auditRows: scoped,
        request: baseApplyRequest({
          apply: true,
          organizationId: 'org-fixture-1',
          expectedReportHash: 'deadbeefdeadbeef',
        }),
      }),
    ).toThrow(/Report hash mismatch/);
  });

  it('accepts matching report hash on apply', () => {
    const scoped = rows.filter((r) => r.organizationId === 'org-fixture-1');
    const reportHash = computeBrakeBaselineReportHash(scoped);
    const plan = planBrakeBaselineBackfillApply({
      auditRows: scoped,
      request: baseApplyRequest({
        apply: true,
        organizationId: 'org-fixture-1',
        expectedReportHash: reportHash,
      }),
    });
    expect(plan.reportHash).toBe(reportHash);
    expect(
      plan.autoApplicable.some(
        (i) => i.vehicleId === 'fixture-exact-measured' && i.component === 'FRONT_PADS',
      ),
    ).toBe(true);
  });

  it('blocks production-like apply without override', () => {
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgres://synqdrive-prod/db';
    expect(() => assertSafeBrakeBaselineBackfillApplyTarget()).toThrow(/production-like/);
    process.env.DATABASE_URL = prev;
  });
});

describe('brake-baseline-backfill-apply classification', () => {
  const rows = fixtureRows();

  it('auto-applies EXACT_MEASURED with resolved odometer', () => {
    const plan = planBrakeBaselineBackfillApply({
      auditRows: rows,
      request: baseApplyRequest({ organizationId: 'org-fixture-1' }),
    });
    expect(
      plan.autoApplicable.some(
        (i) =>
          i.vehicleId === 'fixture-exact-measured' &&
          i.component === 'FRONT_PADS' &&
          i.candidateClass === 'EXACT_MEASURED',
      ),
    ).toBe(true);
  });

  it('auto-applies CONFIRMED_REPLACEMENT', () => {
    const plan = planBrakeBaselineBackfillApply({
      auditRows: rows,
      request: baseApplyRequest({ organizationId: 'org-fixture-1' }),
    });
    expect(
      plan.autoApplicable.some(
        (i) =>
          i.vehicleId === 'fixture-confirmed-replacement' &&
          i.candidateClass === 'CONFIRMED_REPLACEMENT',
      ),
    ).toBe(true);
  });

  it('auto-applies HIGH_CONFIDENCE_DOCUMENTED only with clear policy', () => {
    const plan = planBrakeBaselineBackfillApply({
      auditRows: rows,
      request: baseApplyRequest({ organizationId: 'org-fixture-1' }),
    });
    expect(
      plan.autoApplicable.some(
        (i) =>
          i.vehicleId === 'fixture-high-confidence-documented' &&
          i.candidateClass === 'HIGH_CONFIDENCE_DOCUMENTED',
      ),
    ).toBe(true);
  });

  it('rejects SPEC_ONLY from auto apply', () => {
    const plan = planBrakeBaselineBackfillApply({
      auditRows: rows,
      request: baseApplyRequest({ organizationId: 'org-fixture-1' }),
    });
    expect(plan.autoApplicable.some((i) => i.vehicleId === 'fixture-spec-only')).toBe(false);
    expect(
      plan.manualReview.some(
        (i) => i.vehicleId === 'fixture-spec-only' && i.candidateClass === 'SPEC_ONLY',
      ),
    ).toBe(true);
  });

  it('keeps CONFLICTING_DATA in manual review', () => {
    const plan = planBrakeBaselineBackfillApply({
      auditRows: rows,
      request: baseApplyRequest({ organizationId: 'org-fixture-1' }),
    });
    expect(
      plan.manualReview.some(
        (i) => i.vehicleId === 'fixture-conflicting' && i.candidateClass === 'CONFLICTING_DATA',
      ),
    ).toBe(true);
    expect(plan.autoApplicable.some((i) => i.vehicleId === 'fixture-conflicting')).toBe(false);
  });

  it('marks uncertain baseline as MEASUREMENT_REQUIRED without invented thickness', () => {
    const plan = planBrakeBaselineBackfillApply({
      auditRows: rows,
      request: baseApplyRequest({ organizationId: 'org-fixture-1' }),
    });
    const rearPartial = plan.manualReview.find(
      (i) => i.vehicleId === 'fixture-partial-service' && i.component === 'REAR_PADS',
    );
    expect(rearPartial?.reviewReasons).toContain('UNKNOWN_HISTORY');
    expect(rearPartial?.thicknessMm).toBeNull();
  });

  it('skips idempotent duplicate fingerprint on retry', () => {
    const scoped = rows.filter((r) => r.organizationId === 'org-fixture-1');
    const exact = scoped.find(
      (r) => r.vehicleId === 'fixture-exact-measured' && r.component === 'FRONT_PADS',
    )!;
    const fingerprints = new Set([exact.idempotencyFingerprint]);
    const plan = planBrakeBaselineBackfillApply({
      auditRows: scoped,
      request: baseApplyRequest({ organizationId: 'org-fixture-1' }),
      alreadyAppliedFingerprints: fingerprints,
    });
    expect(
      plan.skipped.some(
        (i) =>
          i.vehicleId === 'fixture-exact-measured' &&
          i.component === 'FRONT_PADS' &&
          i.action === 'SKIP_IDEMPOTENT',
      ),
    ).toBe(true);
  });

  it('scopes apply plan by organization (cross-tenant guard)', () => {
    const plan = planBrakeBaselineBackfillApply({
      auditRows: rows,
      request: baseApplyRequest({ organizationId: 'other-org' }),
    });
    expect(plan.autoApplicable.length).toBe(0);
    expect(plan.manualReview.length).toBe(0);
    expect(plan.skipped.length).toBe(0);
  });

  it('demotes overflow batch items to manual review', () => {
    const scoped = rows.filter((r) => r.organizationId === 'org-fixture-1');
    const plan = planBrakeBaselineBackfillApply({
      auditRows: scoped,
      request: baseApplyRequest({ organizationId: 'org-fixture-1', maxBatchSize: 1 }),
    });
    expect(plan.autoApplicable.length).toBe(1);
    expect(plan.manualReview.some((i) => i.reviewReasons.includes('exceeds_max_batch_size'))).toBe(
      true,
    );
  });
});

describe('brake-baseline-backfill service', () => {
  const inputs = fixtureInputs();
  const lifecycle = {
    registerMeasuredBaseline: jest.fn(),
    registerDocumentedReplacement: jest.fn(),
  };
  const recalcOrchestrator = { enqueue: jest.fn().mockResolvedValue({ queued: true }) };
  const mockPrisma = {
    vehicleServiceEvent: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    brakeComponentInstallation: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as any;

  const svc = new BrakeBaselineBackfillService(
    mockPrisma,
    lifecycle as unknown as BrakeComponentLifecycleService,
    recalcOrchestrator as unknown as BrakeRecalculationOrchestratorService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    lifecycle.registerMeasuredBaseline.mockResolvedValue({
      idempotentReplay: false,
      installationIds: ['inst-1'],
      serviceEventId: 'svc-1',
    });
    lifecycle.registerDocumentedReplacement.mockResolvedValue({
      idempotentReplay: false,
      installationIds: ['inst-2'],
      serviceEventId: 'svc-2',
    });
  });

  it('executes apply for auto-applicable components and writes audit log', async () => {
    const scoped = inputs.filter((i) => i.organizationId === 'org-fixture-1');
    const auditRows = buildBrakeBaselineApplyAuditRows(scoped, 'test-salt');
    const reportHash = computeBrakeBaselineReportHash(auditRows);
    const { result } = await svc.run({
      auditInputs: scoped,
      auditSalt: 'test-salt',
      request: baseApplyRequest({
        apply: true,
        organizationId: 'org-fixture-1',
        expectedReportHash: reportHash,
        maxBatchSize: 5,
      }),
      allowRemote: true,
    });
    expect(result.applied).toBeGreaterThan(0);
    expect(lifecycle.registerMeasuredBaseline).toHaveBeenCalled();
    expect(result.auditLog.some((e) => e.action === 'APPLY_BASELINE')).toBe(true);
  });

  it('treats idempotent replay as unchanged without failure', async () => {
    lifecycle.registerMeasuredBaseline.mockResolvedValue({
      idempotentReplay: true,
      installationIds: ['inst-1'],
      serviceEventId: 'svc-1',
    });
    const scoped = inputs.filter((i) => i.organizationId === 'org-fixture-1');
    const auditRows = buildBrakeBaselineApplyAuditRows(scoped, 'test-salt');
    const reportHash = computeBrakeBaselineReportHash(auditRows);
    const { result } = await svc.run({
      auditInputs: scoped,
      auditSalt: 'test-salt',
      request: baseApplyRequest({
        apply: true,
        organizationId: 'org-fixture-1',
        expectedReportHash: reportHash,
        maxBatchSize: 1,
      }),
      allowRemote: true,
    });
    expect(result.unchanged).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);
  });

  it('records partial batch failure without stopping audit log', async () => {
    lifecycle.registerMeasuredBaseline
      .mockResolvedValueOnce({
        idempotentReplay: false,
        installationIds: ['inst-1'],
        serviceEventId: 'svc-1',
      })
      .mockRejectedValueOnce(new Error('db_timeout'));
    const scoped = inputs.filter((i) => i.organizationId === 'org-fixture-1');
    const auditRows = buildBrakeBaselineApplyAuditRows(scoped, 'test-salt');
    const reportHash = computeBrakeBaselineReportHash(auditRows);
    const { result } = await svc.run({
      auditInputs: scoped,
      auditSalt: 'test-salt',
      request: baseApplyRequest({
        apply: true,
        organizationId: 'org-fixture-1',
        expectedReportHash: reportHash,
        maxBatchSize: 2,
      }),
      allowRemote: true,
    });
    expect(result.applied).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors.some((e) => e.includes('db_timeout'))).toBe(true);
    expect(result.auditLog.some((e) => e.action === 'FAILED')).toBe(true);
  });

  it('optionally recalculates affected vehicles with batch limit (separate step)', async () => {
    const scoped = inputs.filter((i) => i.organizationId === 'org-fixture-1');
    const auditRows = buildBrakeBaselineApplyAuditRows(scoped, 'test-salt');
    const reportHash = computeBrakeBaselineReportHash(auditRows);
    const { result } = await svc.run({
      auditInputs: scoped,
      auditSalt: 'test-salt',
      request: baseApplyRequest({
        apply: true,
        organizationId: 'org-fixture-1',
        expectedReportHash: reportHash,
        maxBatchSize: 3,
        recalculate: true,
        recalculateMaxVehicles: 1,
      }),
      allowRemote: true,
    });
    expect(recalcOrchestrator.enqueue).toHaveBeenCalledTimes(1);
    expect(result.recalculatedVehicleIds.length).toBe(1);
  });
});
