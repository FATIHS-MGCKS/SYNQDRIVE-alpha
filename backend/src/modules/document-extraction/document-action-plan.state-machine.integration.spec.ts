import { AUTHORITY_LETTER } from './__fixtures__/document-archive-fixtures';
import { DocumentActionExecutorRegistry } from './document-action-executor.registry';
import { DocumentActionOrchestratorService } from './document-action-orchestrator.service';
import { readDocumentActionPlanState } from './document-action-plan.store';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_ACTION_PLAN_STATUSES,
  DOCUMENT_ACTION_REQUIREMENTS,
} from './document-action.types';
import { DocumentActionTechnicalError } from './document-action.errors';
import { ArchiveDocumentActionExecutor } from './executors/archive-document-action.executor';
import { LinkEntityDocumentActionExecutor } from './executors/link-entity-document-action.executor';
import { CreateFineDocumentActionExecutor } from './executors/create-fine-document-action.executor';
import {
  CreateCreditNoteDocumentActionExecutor,
  CreateInvoiceDocumentActionExecutor,
} from './executors/create-invoice-document-action.executor';
import {
  CreateComplianceServiceEventDocumentActionExecutor,
  CreateServiceEventDocumentActionExecutor,
} from './executors/create-service-document-action.executor';
import {
  RefreshVehicleServiceHistoryDocumentActionExecutor,
  UpdateVehicleComplianceDocumentActionExecutor,
} from './executors/update-vehicle-from-extraction-document-action.executor';
import {
  CreateDamageDraftDocumentActionExecutor,
  CreateDamageRecordDocumentActionExecutor,
  LinkExistingDamageDocumentActionExecutor,
} from './executors/create-damage-document-action.executor';
import {
  ApplyBatteryMeasurementDocumentActionExecutor,
  ApplyBrakeMeasurementDocumentActionExecutor,
  ApplyTireMeasurementDocumentActionExecutor,
} from './executors/apply-technical-document-action.executor';

describe('Document action plan apply lifecycle (integration)', () => {
  const prisma = {
    vehicleDocumentExtraction: {
      update: jest.fn().mockResolvedValue({}),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'ext-lifecycle-1',
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        status: 'READY_FOR_REVIEW',
        confirmedData: {},
        plausibility: {},
      }),
    },
    vehicleDamage: { findMany: jest.fn().mockResolvedValue([]) },
    fine: { findFirst: jest.fn().mockResolvedValue(null) },
    vendor: { findFirst: jest.fn().mockResolvedValue(null) },
    orgInvoice: { findFirst: jest.fn().mockResolvedValue(null) },
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
    new CreateServiceEventDocumentActionExecutor({ createFromDocumentExtraction: jest.fn() } as any),
    new CreateComplianceServiceEventDocumentActionExecutor({
      createFromDocumentExtraction: jest.fn(),
    } as any),
    new UpdateVehicleComplianceDocumentActionExecutor({
      applyComplianceVehicleUpdateFromExtraction: jest.fn(),
    } as any),
    new RefreshVehicleServiceHistoryDocumentActionExecutor({
      refreshVehicleServiceHistoryFromExtraction: jest.fn(),
    } as any),
    new CreateDamageDraftDocumentActionExecutor({ createDraftFromDocumentExtraction: jest.fn() } as any),
    new CreateDamageRecordDocumentActionExecutor({ applyRecordFromDocumentExtraction: jest.fn() } as any),
    new LinkExistingDamageDocumentActionExecutor({
      linkExistingDamageFromDocumentExtraction: jest.fn(),
    } as any),
    new ApplyTireMeasurementDocumentActionExecutor({
      applyMeasurementFromDocumentExtraction: jest.fn(),
    } as any),
    new ApplyBrakeMeasurementDocumentActionExecutor({ applyFromDocumentExtraction: jest.fn() } as any),
    new ApplyBatteryMeasurementDocumentActionExecutor({ applyFromDocumentExtraction: jest.fn() } as any),
    { syncForActionPlan: jest.fn().mockResolvedValue(undefined) } as any,
  );

  const baseInput = {
    extractionId: 'ext-lifecycle-1',
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

  it('runs full success lifecycle READY_FOR_ACTION_PREVIEW → APPLIED', async () => {
    const result = await orchestrator.executeConfirmedPlan(baseInput);

    expect(result.applyLifecycle?.status).toBe('APPLIED');
    expect(result.applyLifecycle?.applyOutcome).toBe('FULL_SUCCESS');
    expect(result.detail).toMatchObject({ archived: true });

    const finalPlausibility = prisma.vehicleDocumentExtraction.update.mock.calls.at(-1)?.[0]
      .data.plausibility;
    const state = readDocumentActionPlanState(finalPlausibility);
    expect(state.actionPlanApplyLifecycle?.status).toBe('APPLIED');
    expect(state.actionPlan?.status).toBe(DOCUMENT_ACTION_PLAN_STATUSES.COMPLETED);
    expect(
      state.actionPlanExecution?.actions.every(
        (row) =>
          row.requirement !== DOCUMENT_ACTION_REQUIREMENTS.REQUIRED ||
          row.status === DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
      ),
    ).toBe(true);
  });

  it('resolves APPLIED_WITH_WARNINGS when optional suggestion action fails', async () => {
    const failingLinkExecutor = {
      actionType: 'SUGGEST_ENTITY_LINK',
      execute: jest.fn().mockResolvedValue({
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'BUSINESS_RULE_VIOLATION',
        errorMessage: 'Link suggestion rejected',
      }),
    };
    const localRegistry = new DocumentActionExecutorRegistry();
    localRegistry.register(new ArchiveDocumentActionExecutor());
    localRegistry.register(failingLinkExecutor as any);

    const localOrchestrator = new DocumentActionOrchestratorService(
      prisma as any,
      localRegistry,
      new ArchiveDocumentActionExecutor(),
      failingLinkExecutor as any,
      new CreateFineDocumentActionExecutor({ createFromDocumentExtraction: jest.fn() } as any),
      new CreateInvoiceDocumentActionExecutor({ createFromDocumentExtraction: jest.fn() } as any),
      new CreateCreditNoteDocumentActionExecutor({ createFromDocumentExtraction: jest.fn() } as any),
      new CreateServiceEventDocumentActionExecutor({ createFromDocumentExtraction: jest.fn() } as any),
      new CreateComplianceServiceEventDocumentActionExecutor({
        createFromDocumentExtraction: jest.fn(),
      } as any),
      new UpdateVehicleComplianceDocumentActionExecutor({
        applyComplianceVehicleUpdateFromExtraction: jest.fn(),
      } as any),
      new RefreshVehicleServiceHistoryDocumentActionExecutor({
        refreshVehicleServiceHistoryFromExtraction: jest.fn(),
      } as any),
      new CreateDamageDraftDocumentActionExecutor({
        createDraftFromDocumentExtraction: jest.fn(),
      } as any),
      new CreateDamageRecordDocumentActionExecutor({
        applyRecordFromDocumentExtraction: jest.fn(),
      } as any),
      new LinkExistingDamageDocumentActionExecutor({
        linkExistingDamageFromDocumentExtraction: jest.fn(),
      } as any),
      new ApplyTireMeasurementDocumentActionExecutor({
        applyMeasurementFromDocumentExtraction: jest.fn(),
      } as any),
      new ApplyBrakeMeasurementDocumentActionExecutor({ applyFromDocumentExtraction: jest.fn() } as any),
      new ApplyBatteryMeasurementDocumentActionExecutor({ applyFromDocumentExtraction: jest.fn() } as any),
      { syncForActionPlan: jest.fn().mockResolvedValue(undefined) } as any,
    );

    const confirmedData = {
      ...AUTHORITY_LETTER,
      mentionedEntities: [{ entityType: 'BOOKING', entityId: 'booking-1', label: 'Booking 1' }],
    };

    const result = await localOrchestrator.executeConfirmedPlan({
      ...baseInput,
      extractionId: 'ext-lifecycle-warn',
      confirmedData,
    });

    expect(result.applyLifecycle?.status).toBe('APPLIED_WITH_WARNINGS');
    expect(result.applyLifecycle?.warningActionIndices?.length).toBeGreaterThan(0);
    expect(result.detail).toMatchObject({ archived: true });

    const archiveAction = (result.detail as any).execution.actions.find(
      (row: { semanticAction: string }) => row.semanticAction === 'ARCHIVE_DOCUMENT',
    );
    expect(archiveAction.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED);
  });

  it('fails with APPLY_FAILED and retries only failed required action', async () => {
    let archiveCalls = 0;
    const flakyArchiveExecutor = {
      actionType: 'ARCHIVE_DOCUMENT',
      execute: jest.fn().mockImplementation(async () => {
        archiveCalls += 1;
        if (archiveCalls === 1) {
          return {
            status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
            errorCode: 'TECHNICAL_FAILURE',
            errorMessage: 'Transient archive failure',
          };
        }
        return {
          status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
          resultEntityId: 'ext-lifecycle-retry',
          output: { archived: true, archiveSubtype: 'AUTHORITY_LETTER' },
        };
      }),
    };

    const localRegistry = new DocumentActionExecutorRegistry();
    localRegistry.register(flakyArchiveExecutor as any);
    localRegistry.register(new LinkEntityDocumentActionExecutor());

    const localOrchestrator = new DocumentActionOrchestratorService(
      prisma as any,
      localRegistry,
      flakyArchiveExecutor as any,
      new LinkEntityDocumentActionExecutor(),
      new CreateFineDocumentActionExecutor({ createFromDocumentExtraction: jest.fn() } as any),
      new CreateInvoiceDocumentActionExecutor({ createFromDocumentExtraction: jest.fn() } as any),
      new CreateCreditNoteDocumentActionExecutor({ createFromDocumentExtraction: jest.fn() } as any),
      new CreateServiceEventDocumentActionExecutor({ createFromDocumentExtraction: jest.fn() } as any),
      new CreateComplianceServiceEventDocumentActionExecutor({
        createFromDocumentExtraction: jest.fn(),
      } as any),
      new UpdateVehicleComplianceDocumentActionExecutor({
        applyComplianceVehicleUpdateFromExtraction: jest.fn(),
      } as any),
      new RefreshVehicleServiceHistoryDocumentActionExecutor({
        refreshVehicleServiceHistoryFromExtraction: jest.fn(),
      } as any),
      new CreateDamageDraftDocumentActionExecutor({
        createDraftFromDocumentExtraction: jest.fn(),
      } as any),
      new CreateDamageRecordDocumentActionExecutor({
        applyRecordFromDocumentExtraction: jest.fn(),
      } as any),
      new LinkExistingDamageDocumentActionExecutor({
        linkExistingDamageFromDocumentExtraction: jest.fn(),
      } as any),
      new ApplyTireMeasurementDocumentActionExecutor({
        applyMeasurementFromDocumentExtraction: jest.fn(),
      } as any),
      new ApplyBrakeMeasurementDocumentActionExecutor({ applyFromDocumentExtraction: jest.fn() } as any),
      new ApplyBatteryMeasurementDocumentActionExecutor({ applyFromDocumentExtraction: jest.fn() } as any),
      { syncForActionPlan: jest.fn().mockResolvedValue(undefined) } as any,
    );

    const input = { ...baseInput, extractionId: 'ext-lifecycle-retry' };

    await expect(localOrchestrator.executeConfirmedPlan(input)).rejects.toBeInstanceOf(
      DocumentActionTechnicalError,
    );

    const failedPlausibility = prisma.vehicleDocumentExtraction.update.mock.calls.at(-1)?.[0]
      .data.plausibility;
    const failedState = readDocumentActionPlanState(failedPlausibility);
    expect(failedState.actionPlanApplyLifecycle?.status).toBe('APPLY_FAILED');

    const retryResult = await localOrchestrator.executeConfirmedPlan({
      ...input,
      plausibility: failedPlausibility,
    });

    expect(retryResult.applyLifecycle?.status).toBe('APPLIED');
    expect(flakyArchiveExecutor.execute).toHaveBeenCalledTimes(2);
    const archiveRuns = (retryResult.detail as any).execution.actions.filter(
      (row: { semanticAction: string }) => row.semanticAction === 'ARCHIVE_DOCUMENT',
    );
    expect(archiveRuns).toHaveLength(1);
    expect(archiveRuns[0].status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED);
  });
});
