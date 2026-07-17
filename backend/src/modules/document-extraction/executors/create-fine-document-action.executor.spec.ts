import { FINE_COMPLETE } from '../__fixtures__/document-fine-fixtures';
import { CreateFineDocumentActionExecutor } from './create-fine-document-action.executor';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_ACTION_REQUIREMENTS,
} from '../document-action.types';
import type { DocumentActionPlan } from '../document-action-plan.types';

function buildContext(confirmedData: Record<string, unknown>) {
  const plan: DocumentActionPlan = {
    planId: 'plan-fine-1',
    planVersion: 1,
    fingerprint: 'fp-fine',
    status: 'CONFIRMED',
    extractionId: 'ext-fine-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    documentType: 'FINE',
    planOutcome: 'READY',
    actions: [
      {
        semanticAction: 'CREATE_FINE_DRAFT',
        requirement: DOCUMENT_ACTION_REQUIREMENTS.REQUIRED,
        sequence: 1,
      },
    ],
    confirmedAt: new Date().toISOString(),
    metadata: { duplicateReferenceFineId: null },
  };

  return {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    extractionId: 'ext-fine-1',
    documentType: 'FINE',
    confirmedData,
    sourceFileUrl: 'storage://fine.pdf',
    plan,
    action: plan.actions[0],
    actionIndex: 0,
    idempotencyKey: 'ext-fine-1:v1:fp-fine:a1:CREATE_FINE_DRAFT',
  };
}

describe('CreateFineDocumentActionExecutor', () => {
  const finesService = {
    createFromDocumentExtraction: jest.fn(),
  };
  const executor = new CreateFineDocumentActionExecutor(finesService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates fine draft and returns result entity id', async () => {
    finesService.createFromDocumentExtraction.mockResolvedValue({
      id: 'fine-1',
      status: 'UNDER_REVIEW',
    });

    const result = await executor.execute(buildContext(FINE_COMPLETE));

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED);
    expect(result.resultEntityType).toBe('fine');
    expect(result.resultEntityId).toBe('fine-1');
    expect(result.output).toMatchObject({
      fineId: 'fine-1',
      draft: true,
      documentExtractionId: 'ext-fine-1',
    });
  });

  it('returns prior result on retry', async () => {
    const prior = {
      status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
      resultEntityId: 'fine-1',
    };

    const result = await executor.execute({
      ...buildContext(FINE_COMPLETE),
      priorResult: prior,
    });

    expect(result).toBe(prior);
    expect(finesService.createFromDocumentExtraction).not.toHaveBeenCalled();
  });
});
