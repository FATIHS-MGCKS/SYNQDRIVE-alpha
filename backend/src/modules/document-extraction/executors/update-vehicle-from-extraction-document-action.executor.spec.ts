import { TUV_NO_DEFECT } from '../__fixtures__/document-inspection-fixtures';
import { OIL_CHANGE_COMPLETE } from '../__fixtures__/document-service-fixtures';
import {
  RefreshVehicleServiceHistoryDocumentActionExecutor,
  UpdateVehicleComplianceDocumentActionExecutor,
} from './update-vehicle-from-extraction-document-action.executor';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_ACTION_REQUIREMENTS,
} from '../document-action.types';
import type { DocumentActionPlan } from '../document-action-plan.types';

function buildContext(input: {
  documentType: string;
  confirmedData: Record<string, unknown>;
  semanticAction: string;
}) {
  const plan: DocumentActionPlan = {
    planId: 'plan-vehicle-1',
    planVersion: 1,
    fingerprint: 'fp-vehicle',
    status: 'CONFIRMED',
    extractionId: 'ext-vehicle-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    documentType: input.documentType as DocumentActionPlan['documentType'],
    planOutcome: 'READY',
    actions: [
      {
        semanticAction: input.semanticAction,
        requirement: DOCUMENT_ACTION_REQUIREMENTS.REQUIRED,
        sequence: 1,
      },
    ],
    confirmedAt: new Date().toISOString(),
    metadata: {},
  };

  return {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    extractionId: 'ext-vehicle-1',
    documentType: input.documentType,
    confirmedData: input.confirmedData,
    sourceFileUrl: 'storage://doc.pdf',
    plan,
    action: plan.actions[0],
    actionIndex: 0,
    idempotencyKey: `ext-vehicle-1:v1:fp-vehicle:a1:${input.semanticAction}`,
  };
}

describe('UpdateVehicleComplianceDocumentActionExecutor', () => {
  const serviceEvents = {
    applyComplianceVehicleUpdateFromExtraction: jest.fn(),
  };
  const executor = new UpdateVehicleComplianceDocumentActionExecutor(serviceEvents as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates compliance dates for inspection documents', async () => {
    serviceEvents.applyComplianceVehicleUpdateFromExtraction.mockResolvedValue({
      vehicleId: 'veh-1',
      applied: true,
      skipped: false,
    });

    const result = await executor.execute(
      buildContext({
        documentType: 'TUV_REPORT',
        confirmedData: TUV_NO_DEFECT,
        semanticAction: 'UPDATE_VEHICLE_COMPLIANCE_DATES',
      }),
    );

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED);
    expect(result.resultEntityId).toBe('veh-1');
    expect(serviceEvents.applyComplianceVehicleUpdateFromExtraction).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        documentExtractionId: 'ext-vehicle-1',
      }),
    );
  });

  it('skips when compliance payload is incomplete', async () => {
    const result = await executor.execute(
      buildContext({
        documentType: 'TUV_REPORT',
        confirmedData: { inspectionDate: '2026-06-01' },
        semanticAction: 'UPDATE_VEHICLE_COMPLIANCE_DATES',
      }),
    );

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SKIPPED);
    expect(serviceEvents.applyComplianceVehicleUpdateFromExtraction).not.toHaveBeenCalled();
  });

  it('returns prior result on retry', async () => {
    const prior = {
      status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
      resultEntityId: 'veh-1',
    };

    const result = await executor.execute({
      ...buildContext({
        documentType: 'TUV_REPORT',
        confirmedData: TUV_NO_DEFECT,
        semanticAction: 'UPDATE_VEHICLE_COMPLIANCE_DATES',
      }),
      priorResult: prior,
    });

    expect(result).toBe(prior);
    expect(serviceEvents.applyComplianceVehicleUpdateFromExtraction).not.toHaveBeenCalled();
  });
});

describe('RefreshVehicleServiceHistoryDocumentActionExecutor', () => {
  const serviceEvents = {
    refreshVehicleServiceHistoryFromExtraction: jest.fn(),
  };
  const executor = new RefreshVehicleServiceHistoryDocumentActionExecutor(serviceEvents as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes service history for service documents', async () => {
    serviceEvents.refreshVehicleServiceHistoryFromExtraction.mockResolvedValue({
      vehicleId: 'veh-1',
      applied: true,
      skipped: false,
    });

    const result = await executor.execute(
      buildContext({
        documentType: 'OIL_CHANGE',
        confirmedData: OIL_CHANGE_COMPLETE,
        semanticAction: 'REFRESH_VEHICLE_SERVICE_HISTORY',
      }),
    );

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED);
    expect(serviceEvents.refreshVehicleServiceHistoryFromExtraction).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        documentExtractionId: 'ext-vehicle-1',
      }),
    );
  });

  it('fails for unsupported document types', async () => {
    const result = await executor.execute(
      buildContext({
        documentType: 'FINE',
        confirmedData: {},
        semanticAction: 'REFRESH_VEHICLE_SERVICE_HISTORY',
      }),
    );

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED);
    expect(serviceEvents.refreshVehicleServiceHistoryFromExtraction).not.toHaveBeenCalled();
  });
});
