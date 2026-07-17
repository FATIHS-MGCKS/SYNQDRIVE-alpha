import { FINE_COMPLETE } from '../__fixtures__/document-fine-fixtures';
import { DocumentIntakeActionRecoveryService } from './document-intake-action-recovery.service';
import { DocumentIntakeReconciliationService } from './document-intake-reconciliation.service';
import { DOCUMENT_INTAKE_FINDING_CODES } from './document-intake-reconciliation.types';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_ACTION_PLAN_STATUSES,
  DOCUMENT_ACTION_REQUIREMENTS,
} from '../document-action.types';
import { DocumentExtractionType } from '@prisma/client';

describe('DocumentIntakeReconciliationService', () => {
  const prisma = {
    vehicleDocumentExtraction: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    fine: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
    },
    orgInvoice: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
  };

  const service = new DocumentIntakeReconciliationService(prisma as any);

  it('detects historical FINE no-op: APPLIED without downstream fine', async () => {
    prisma.vehicleDocumentExtraction.findMany.mockResolvedValue([
      {
        id: 'ext-fine-noop-1',
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        status: 'APPLIED',
        effectiveDocumentType: 'FINE',
        documentType: 'FINE',
        appliedAt: new Date('2026-07-16T20:42:00.000Z'),
        confirmedData: FINE_COMPLETE,
        plausibility: null,
        updatedAt: new Date('2026-07-16T20:42:00.000Z'),
      },
    ]);
    prisma.fine.findUnique.mockResolvedValue(null);

    const report = await service.runReconciliation({ organizationId: 'org-1' });
    const finding = report.findings.find(
      (row) => row.code === DOCUMENT_INTAKE_FINDING_CODES.APPLIED_WITHOUT_DOWNSTREAM,
    );

    expect(finding).toMatchObject({
      extractionId: 'ext-fine-noop-1',
      documentType: 'FINE',
      severity: 'ERROR',
      details: { historicalFineNoOpCandidate: true },
    });
    expect(report.totals.APPLIED_WITHOUT_DOWNSTREAM).toBe(1);
  });
});

describe('DocumentIntakeActionRecoveryService', () => {
  const docConfig = {
    staleApplyingThresholdMs: 600_000,
    maxActionRecoveryAttempts: 3,
  };

  const prisma = {
    vehicleDocumentExtraction: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    fine: {
      findUnique: jest.fn(),
    },
    orgInvoice: { findFirst: jest.fn() },
    vehicleServiceEvent: { findFirst: jest.fn() },
    vehicleDamage: { findFirst: jest.fn() },
    vehicleTireTreadMeasurement: { findFirst: jest.fn() },
    brakeEvidence: { findFirst: jest.fn() },
    batteryEvidence: { findFirst: jest.fn() },
  };

  const orchestrator = {
    executeConfirmedPlan: jest.fn(),
  };

  const service = new DocumentIntakeActionRecoveryService(
    prisma as any,
    orchestrator as any,
    docConfig as any,
  );

  it('reconciles stuck APPLYING when downstream fine already exists (idempotency probe)', async () => {
    const plausibility = {
      _pipeline: {
        actionPlan: {
          planId: 'plan-1',
          planVersion: 1,
          fingerprint: 'fp-1',
          status: DOCUMENT_ACTION_PLAN_STATUSES.EXECUTING,
          extractionId: 'ext-stuck-1',
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          documentType: 'FINE',
          planOutcome: 'CREATE_FINE_DRAFT',
          actions: [
            {
              semanticAction: 'CREATE_FINE_DRAFT',
              requirement: DOCUMENT_ACTION_REQUIREMENTS.REQUIRED,
              sequence: 1,
            },
          ],
          confirmedAt: new Date().toISOString(),
        },
        actionPlanExecution: {
          planId: 'plan-1',
          planVersion: 1,
          fingerprint: 'fp-1',
          status: 'EXECUTING',
          actions: [],
          startedAt: new Date().toISOString(),
        },
        actionPlanApplyLifecycle: {
          status: 'APPLYING',
          updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
        },
      },
    };

    const record = {
      id: 'ext-stuck-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      status: 'CONFIRMED',
      effectiveDocumentType: 'FINE' as DocumentExtractionType,
      documentType: 'FINE' as DocumentExtractionType,
      confirmedData: FINE_COMPLETE,
      plausibility,
      sourceFileUrl: 'storage://fine.pdf',
      objectKey: 'fine.pdf',
      appliedAt: null,
      updatedAt: new Date(Date.now() - 3_600_000),
    };

    prisma.fine.findUnique.mockResolvedValue({ id: 'fine-existing-1' });

    const result = await service.recoverExtraction(record, false);

    expect(result.action).toBe('FINALIZE_APPLIED');
    expect(orchestrator.executeConfirmedPlan).not.toHaveBeenCalled();
    expect(prisma.vehicleDocumentExtraction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ext-stuck-1' },
        data: expect.objectContaining({
          status: 'APPLIED',
          appliedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('dry-run reports unwind for stale APPLYING without downstream entity', async () => {
    const record = {
      id: 'ext-stuck-2',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      status: 'CONFIRMED',
      effectiveDocumentType: 'FINE' as DocumentExtractionType,
      documentType: 'FINE' as DocumentExtractionType,
      confirmedData: FINE_COMPLETE,
      plausibility: {
        _pipeline: {
          actionPlan: {
            planId: 'plan-2',
            planVersion: 1,
            fingerprint: 'fp-2',
            status: DOCUMENT_ACTION_PLAN_STATUSES.EXECUTING,
            extractionId: 'ext-stuck-2',
            organizationId: 'org-1',
            vehicleId: 'veh-1',
            documentType: 'FINE',
            planOutcome: 'CREATE_FINE_DRAFT',
            actions: [
              {
                semanticAction: 'CREATE_FINE_DRAFT',
                requirement: DOCUMENT_ACTION_REQUIREMENTS.REQUIRED,
                sequence: 1,
              },
            ],
            confirmedAt: new Date().toISOString(),
          },
          actionPlanExecution: {
            planId: 'plan-2',
            planVersion: 1,
            fingerprint: 'fp-2',
            status: 'EXECUTING',
            actions: [
              {
                actionIndex: 0,
                semanticAction: 'CREATE_FINE_DRAFT',
                requirement: DOCUMENT_ACTION_REQUIREMENTS.REQUIRED,
                idempotencyKey: 'ext-stuck-2:v1:fp-2:a1:CREATE_FINE_DRAFT',
                status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
              },
            ],
          },
          actionPlanApplyLifecycle: {
            status: 'APPLYING',
            updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
          },
        },
      },
      sourceFileUrl: 'storage://fine.pdf',
      objectKey: 'fine.pdf',
      appliedAt: null,
      updatedAt: new Date(Date.now() - 3_600_000),
    };

    prisma.fine.findUnique.mockResolvedValue(null);

    const result = await service.recoverExtraction(record, true);

    expect(result.action).toBe('UNWIND_STALE_APPLYING');
    expect(result.dryRun).toBe(true);
    expect(orchestrator.executeConfirmedPlan).not.toHaveBeenCalled();
  });
});
