import { BATTERY_HV_SOH } from '../__fixtures__/document-battery-fixtures';
import { BRAKE_COMPLETE } from '../__fixtures__/document-brake-fixtures';
import { TIRE_COMPLETE } from '../__fixtures__/document-tire-fixtures';
import {
  ApplyBatteryMeasurementDocumentActionExecutor,
  ApplyBrakeMeasurementDocumentActionExecutor,
  ApplyTireMeasurementDocumentActionExecutor,
} from './apply-technical-document-action.executor';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_ACTION_REQUIREMENTS,
} from '../document-action.types';
import type { DocumentActionPlan } from '../document-action-plan.types';

function buildContext(
  documentType: string,
  confirmedData: Record<string, unknown>,
  semanticAction: string,
) {
  const plan: DocumentActionPlan = {
    planId: `plan-${documentType.toLowerCase()}-1`,
    planVersion: 1,
    fingerprint: `fp-${documentType.toLowerCase()}`,
    status: 'CONFIRMED',
    extractionId: `ext-${documentType.toLowerCase()}-1`,
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    documentType,
    planOutcome: 'READY',
    actions: [
      {
        semanticAction,
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
    extractionId: plan.extractionId,
    documentType,
    confirmedData,
    sourceFileUrl: 'storage://technical.pdf',
    plan,
    action: plan.actions[0],
    actionIndex: 0,
    idempotencyKey: `${plan.extractionId}:v1:${plan.fingerprint}:a1:${semanticAction}`,
  };
}

describe('ApplyTechnicalDocumentActionExecutors', () => {
  const tireLifecycle = { applyMeasurementFromDocumentExtraction: jest.fn() };
  const brakeLifecycle = { applyFromDocumentExtraction: jest.fn() };
  const batteryHealth = { applyFromDocumentExtraction: jest.fn() };

  const tireExecutor = new ApplyTireMeasurementDocumentActionExecutor(tireLifecycle as any);
  const brakeExecutor = new ApplyBrakeMeasurementDocumentActionExecutor(brakeLifecycle as any);
  const batteryExecutor = new ApplyBatteryMeasurementDocumentActionExecutor(batteryHealth as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies tire measurement and stores result entity id', async () => {
    tireLifecycle.applyMeasurementFromDocumentExtraction.mockResolvedValue({
      measurementId: 'meas-1',
      reused: false,
    });

    const result = await tireExecutor.execute(
      buildContext('TIRE', TIRE_COMPLETE, 'APPLY_TIRE_MEASUREMENT'),
    );

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED);
    if (result.status !== DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED) return;
    expect(result.resultEntityId).toBe('meas-1');
    expect(result.output).toMatchObject({
      treadDepthUnit: 'mm',
      pressureUnit: 'bar',
    });
  });

  it('applies brake measurement with evidence ids', async () => {
    brakeLifecycle.applyFromDocumentExtraction.mockResolvedValue({
      serviceEventId: 'evt-brake-1',
      evidenceIds: ['ev-1', 'ev-2'],
      lifecycleApplied: true,
      initialized: true,
      status: 'initialized',
      message: 'ok',
    });

    const result = await brakeExecutor.execute(
      buildContext('BRAKE', BRAKE_COMPLETE, 'APPLY_BRAKE_MEASUREMENT'),
    );

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED);
    if (result.status !== DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED) return;
    expect(result.resultEntityId).toBe('evt-brake-1');
    expect(result.output?.brakeEvidenceIds).toEqual(['ev-1', 'ev-2']);
  });

  it('applies battery measurement without direct health score override', async () => {
    batteryHealth.applyFromDocumentExtraction.mockResolvedValue({
      serviceEventId: null,
      evidenceIds: ['ev-batt-1'],
      snapshotId: null,
    });

    const result = await batteryExecutor.execute(
      buildContext('BATTERY', BATTERY_HV_SOH, 'APPLY_BATTERY_MEASUREMENT'),
    );

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED);
    if (result.status !== DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED) return;
    expect(result.resultEntityId).toBe('ev-batt-1');
    expect(result.output).toMatchObject({
      scope: 'HV',
      measurementType: expect.any(String),
    });
  });
});
