import { AUTHORITY_LETTER } from './__fixtures__/document-archive-fixtures';
import { DocumentActionExecutorRegistry } from './document-action-executor.registry';
import { DocumentActionOrchestratorService } from './document-action-orchestrator.service';
import { readDocumentActionPlanState } from './document-action-plan.store';
import { DOCUMENT_ACTION_EXECUTION_STATUSES } from './document-action.types';
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

describe('Document Intake V2 race conditions (integration)', () => {
  const prisma = {
    vehicleDocumentExtraction: {
      update: jest.fn().mockResolvedValue({}),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'ext-race-1',
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        status: 'READY_FOR_REVIEW',
        confirmedData: AUTHORITY_LETTER,
        plausibility: {},
      }),
    },
    vehicleDamage: { findMany: jest.fn().mockResolvedValue([]) },
    fine: { findFirst: jest.fn().mockResolvedValue(null) },
    vendor: { findFirst: jest.fn().mockResolvedValue(null) },
    orgInvoice: { findFirst: jest.fn().mockResolvedValue(null) },
  };

  let archiveCalls = 0;
  const countingArchiveExecutor = {
    actionType: 'ARCHIVE_DOCUMENT',
    execute: jest.fn().mockImplementation(async () => {
      archiveCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
        resultEntityId: 'ext-race-1',
        output: { archived: true, archiveSubtype: 'AUTHORITY_LETTER' },
      };
    }),
  };

  const registry = new DocumentActionExecutorRegistry();
  registry.register(countingArchiveExecutor as any);
  registry.register(new LinkEntityDocumentActionExecutor());

  const orchestrator = new DocumentActionOrchestratorService(
    prisma as any,
    registry,
    countingArchiveExecutor as any,
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
    extractionId: 'ext-race-1',
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
    archiveCalls = 0;
  });

  it('returns cached execution on duplicate confirm without re-running archive', async () => {
    const first = await orchestrator.executeConfirmedPlan(baseInput);
    const storedPlausibility = prisma.vehicleDocumentExtraction.update.mock.calls.at(-1)?.[0]
      .data.plausibility;

    const second = await orchestrator.executeConfirmedPlan({
      ...baseInput,
      plausibility: storedPlausibility,
    });

    expect(second.detail).toEqual(first.detail);
    expect(countingArchiveExecutor.execute).toHaveBeenCalledTimes(1);
  });
});
