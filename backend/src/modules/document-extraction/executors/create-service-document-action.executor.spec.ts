import { SERVICE_COMPLETE } from '../__fixtures__/document-service-fixtures';
import { TUV_NO_DEFECT, TUV_MISSING_VALIDITY } from '../__fixtures__/document-inspection-fixtures';
import { CreateServiceEventDocumentActionExecutor } from './create-service-document-action.executor';
import { UpdateVehicleComplianceDocumentActionExecutor } from './update-vehicle-from-extraction-document-action.executor';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_ACTION_REQUIREMENTS,
} from '../document-action.types';
import type { DocumentActionPlan } from '../document-action-plan.types';

function buildServiceContext(confirmedData: Record<string, unknown>) {
  const plan: DocumentActionPlan = {
    planId: 'plan-svc-1',
    planVersion: 1,
    fingerprint: 'fp-svc',
    status: 'CONFIRMED',
    extractionId: 'ext-svc-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    documentType: 'SERVICE',
    planOutcome: 'READY',
    actions: [
      {
        semanticAction: 'CREATE_SERVICE_EVENT',
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
    extractionId: 'ext-svc-1',
    documentType: 'SERVICE',
    confirmedData,
    sourceFileUrl: 'storage://service.pdf',
    plan,
    action: plan.actions[0],
    actionIndex: 0,
    idempotencyKey: 'ext-svc-1:v1:fp-svc:a1:CREATE_SERVICE_EVENT',
  };
}

describe('CreateServiceEventDocumentActionExecutor', () => {
  const serviceEvents = {
    createFromDocumentExtraction: jest.fn(),
  };
  const executor = new CreateServiceEventDocumentActionExecutor(serviceEvents as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates service event and returns result entity id', async () => {
    serviceEvents.createFromDocumentExtraction.mockResolvedValue({
      id: 'evt-1',
      eventType: 'FULL_SERVICE',
    });

    const result = await executor.execute(buildServiceContext(SERVICE_COMPLETE));

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED);
    expect(result.resultEntityType).toBe('serviceEvent');
    expect(result.resultEntityId).toBe('evt-1');
  });
});

describe('UpdateVehicleComplianceDocumentActionExecutor', () => {
  const serviceEvents = {
    applyComplianceVehicleUpdateFromExtraction: jest.fn(),
  };
  const executor = new UpdateVehicleComplianceDocumentActionExecutor(serviceEvents as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies compliance update for TÜV with validUntil', async () => {
    serviceEvents.applyComplianceVehicleUpdateFromExtraction.mockResolvedValue({
      applied: true,
      skipped: false,
      vehicleId: 'veh-1',
    });

    const plan: DocumentActionPlan = {
      planId: 'plan-tuv-1',
      planVersion: 1,
      fingerprint: 'fp-tuv',
      status: 'CONFIRMED',
      extractionId: 'ext-tuv-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      documentType: 'TUV_REPORT',
      planOutcome: 'READY',
      actions: [
        {
          semanticAction: 'UPDATE_VEHICLE_COMPLIANCE_DATES',
          requirement: DOCUMENT_ACTION_REQUIREMENTS.REQUIRED,
          sequence: 2,
        },
      ],
      confirmedAt: new Date().toISOString(),
      metadata: {},
    };

    const result = await executor.execute({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      extractionId: 'ext-tuv-1',
      documentType: 'TUV_REPORT',
      confirmedData: TUV_NO_DEFECT,
      sourceFileUrl: 'storage://tuv.pdf',
      plan,
      action: plan.actions[0],
      actionIndex: 1,
      idempotencyKey: 'ext-tuv-1:v1:fp-tuv:a2:UPDATE_VEHICLE_COMPLIANCE_DATES',
    });

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED);
    expect(result.resultEntityId).toBe('veh-1');
  });

  it('skips compliance update when validUntil is missing', async () => {
    const plan: DocumentActionPlan = {
      planId: 'plan-tuv-missing',
      planVersion: 1,
      fingerprint: 'fp-tuv-missing',
      status: 'CONFIRMED',
      extractionId: 'ext-tuv-missing',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      documentType: 'TUV_REPORT',
      planOutcome: 'ARCHIVE_ONLY',
      actions: [
        {
          semanticAction: 'UPDATE_VEHICLE_COMPLIANCE_DATES',
          requirement: DOCUMENT_ACTION_REQUIREMENTS.REQUIRED,
          sequence: 2,
        },
      ],
      confirmedAt: new Date().toISOString(),
      metadata: {},
    };

    const result = await executor.execute({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      extractionId: 'ext-tuv-missing',
      documentType: 'TUV_REPORT',
      confirmedData: TUV_MISSING_VALIDITY,
      sourceFileUrl: 'storage://tuv.pdf',
      plan,
      action: plan.actions[0],
      actionIndex: 1,
      idempotencyKey: 'ext-tuv-missing:v1:fp:a2:UPDATE_VEHICLE_COMPLIANCE_DATES',
    });

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SKIPPED);
    expect(serviceEvents.applyComplianceVehicleUpdateFromExtraction).not.toHaveBeenCalled();
  });
});
