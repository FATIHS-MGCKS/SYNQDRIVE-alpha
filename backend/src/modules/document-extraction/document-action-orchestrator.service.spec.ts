import { AUTHORITY_LETTER } from './__fixtures__/document-archive-fixtures';
import { DocumentActionExecutorRegistry } from './document-action-executor.registry';
import { buildDocumentActionPlan } from './document-action-plan.builder';
import { DocumentActionOrchestratorService } from './document-action-orchestrator.service';
import { ArchiveDocumentActionExecutor } from './executors/archive-document-action.executor';
import { LinkEntityDocumentActionExecutor } from './executors/link-entity-document-action.executor';
import { CreateFineDocumentActionExecutor } from './executors/create-fine-document-action.executor';
import {
  CreateCreditNoteDocumentActionExecutor,
  CreateInvoiceDocumentActionExecutor,
} from './executors/create-invoice-document-action.executor';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_ACTION_PLAN_STATUSES,
} from './document-action.types';
import { DocumentActionPlanError } from './document-action.errors';
import { readDocumentActionPlanState } from './document-action-plan.store';

describe('DocumentActionOrchestratorService', () => {
  const prisma = {
    vehicleDocumentExtraction: {
      update: jest.fn().mockResolvedValue({}),
    },
  };

  const registry = new DocumentActionExecutorRegistry();
  registry.register(new ArchiveDocumentActionExecutor());
  registry.register(new LinkEntityDocumentActionExecutor());

  const orchestrator = new DocumentActionOrchestratorService(
    prisma as any,
    registry,
    new ArchiveDocumentActionExecutor(),
    new LinkEntityDocumentActionExecutor(),
    new CreateFineDocumentActionExecutor({ createFromDocumentExtraction: jest.fn() } as any),
    new CreateInvoiceDocumentActionExecutor({ createFromDocumentExtraction: jest.fn() } as any),
    new CreateCreditNoteDocumentActionExecutor({ createFromDocumentExtraction: jest.fn() } as any),
  );

  const baseInput = {
    extractionId: 'ext-archive-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    documentType: 'OTHER',
    confirmedData: AUTHORITY_LETTER,
    sourceFileUrl: 'storage://authority.pdf',
    confirmedById: 'user-1',
    plausibilityChecks: [],
    plausibility: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds an executable archive plan with required archive action', () => {
    const plan = buildDocumentActionPlan(baseInput);

    expect(plan.planOutcome).toBe('ARCHIVE_ONLY');
    expect(plan.actions.map((action) => action.semanticAction)).toContain('ARCHIVE_DOCUMENT');
    expect(plan.status).toBe(DOCUMENT_ACTION_PLAN_STATUSES.CONFIRMED);
  });

  it('executes archive and link actions and stores auditable execution state', async () => {
    const result = await orchestrator.executeConfirmedPlan(baseInput);

    expect(result.detail).toMatchObject({
      archived: true,
      archiveSubtype: 'AUTHORITY_LETTER',
      extractionId: 'ext-archive-1',
    });

    const updatePayload = prisma.vehicleDocumentExtraction.update.mock.calls.at(-1)?.[0];
    const state = readDocumentActionPlanState(updatePayload.data.plausibility);
    expect(state.actionPlan?.status).toBe(DOCUMENT_ACTION_PLAN_STATUSES.COMPLETED);
    expect(state.actionPlanExecution?.status).toBe('COMPLETED');
    expect(
      state.actionPlanExecution?.actions.some(
        (row) =>
          row.semanticAction === 'ARCHIVE_DOCUMENT' &&
          row.status === DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
      ),
    ).toBe(true);
  });

  it('is idempotent on retry with the same stored plan', async () => {
    const first = await orchestrator.executeConfirmedPlan(baseInput);
    const storedPlausibility = prisma.vehicleDocumentExtraction.update.mock.calls.at(-1)?.[0]
      .data.plausibility;

    const second = await orchestrator.executeConfirmedPlan({
      ...baseInput,
      plausibility: storedPlausibility,
    });

    expect(second.detail).toEqual(first.detail);
    const state = readDocumentActionPlanState(storedPlausibility);
    const archiveRuns = state.actionPlanExecution?.actions.filter(
      (row) => row.semanticAction === 'ARCHIVE_DOCUMENT',
    );
    expect(archiveRuns).toHaveLength(1);
  });

  it('rejects execution when stored plan fingerprint no longer matches confirmed data', async () => {
    await orchestrator.executeConfirmedPlan(baseInput);
    const storedPlausibility = prisma.vehicleDocumentExtraction.update.mock.calls.at(-1)?.[0]
      .data.plausibility;

    await expect(
      orchestrator.executeConfirmedPlan({
        ...baseInput,
        confirmedData: { ...AUTHORITY_LETTER, summary: 'Changed after confirm' },
        plausibility: storedPlausibility,
      }),
    ).rejects.toBeInstanceOf(DocumentActionPlanError);
  });

  it('blocks execution for plans with BLOCKED outcome', async () => {
    await expect(
      orchestrator.executeConfirmedPlan({
        ...baseInput,
        confirmedData: { archiveSubtype: 'UNKNOWN' },
      }),
    ).rejects.toBeInstanceOf(DocumentActionPlanError);
  });
});
