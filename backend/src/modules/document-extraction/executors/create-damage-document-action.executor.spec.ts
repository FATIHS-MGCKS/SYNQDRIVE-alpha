import { DAMAGE_COMPLETE, DAMAGE_UNKNOWN_TYPE } from '../__fixtures__/document-damage-fixtures';
import {
  CreateDamageDraftDocumentActionExecutor,
  CreateDamageRecordDocumentActionExecutor,
  LinkExistingDamageDocumentActionExecutor,
} from './create-damage-document-action.executor';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_ACTION_REQUIREMENTS,
} from '../document-action.types';
import type { DocumentActionPlan } from '../document-action-plan.types';

function buildPlan(
  actions: DocumentActionPlan['actions'],
  metadata: Record<string, unknown> = {},
): DocumentActionPlan {
  return {
    planId: 'plan-damage-1',
    planVersion: 1,
    fingerprint: 'fp-damage',
    status: 'CONFIRMED',
    extractionId: 'ext-damage-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    documentType: 'DAMAGE',
    planOutcome: 'READY',
    actions,
    confirmedAt: new Date().toISOString(),
    metadata: { duplicateDamageId: null, ...metadata },
  };
}

function buildContext(
  confirmedData: Record<string, unknown>,
  options?: {
    semanticAction?: string;
    metadata?: Record<string, unknown>;
    documentType?: string;
  },
) {
  const semanticAction = options?.semanticAction ?? 'CREATE_DAMAGE_DRAFT';
  const plan = buildPlan(
    [
      {
        semanticAction,
        requirement: DOCUMENT_ACTION_REQUIREMENTS.REQUIRED,
        sequence: 1,
      },
    ],
    options?.metadata,
  );

  return {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    extractionId: 'ext-damage-1',
    documentType: options?.documentType ?? 'DAMAGE',
    confirmedData,
    sourceFileUrl: 'storage://damage.pdf',
    plan,
    action: plan.actions[0],
    actionIndex: 0,
    idempotencyKey: `ext-damage-1:v1:fp-damage:a1:${semanticAction}`,
  };
}

describe('CreateDamageDocumentActionExecutors', () => {
  const damagesService = {
    createDraftFromDocumentExtraction: jest.fn(),
    applyRecordFromDocumentExtraction: jest.fn(),
    linkExistingDamageFromDocumentExtraction: jest.fn(),
  };

  const draftExecutor = new CreateDamageDraftDocumentActionExecutor(damagesService as any);
  const recordExecutor = new CreateDamageRecordDocumentActionExecutor(damagesService as any);
  const linkExecutor = new LinkExistingDamageDocumentActionExecutor(damagesService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates damage draft and returns result entity id', async () => {
    damagesService.createDraftFromDocumentExtraction.mockResolvedValue({
      id: 'damage-1',
      status: 'OPEN',
    });

    const result = await draftExecutor.execute(buildContext(DAMAGE_UNKNOWN_TYPE));

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED);
    if (result.status !== DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED) return;
    expect(result.resultEntityType).toBe('damage');
    expect(result.resultEntityId).toBe('damage-1');
    expect(damagesService.createDraftFromDocumentExtraction).toHaveBeenCalledWith(
      expect.objectContaining({
        documentExtractionId: 'ext-damage-1',
        damageType: 'UNKNOWN',
        severity: 'UNKNOWN',
      }),
    );
  });

  it('passes linkCandidateId to draft create for appraisal linkage', async () => {
    damagesService.createDraftFromDocumentExtraction.mockResolvedValue({
      id: 'damage-existing-1',
      status: 'OPEN',
    });

    await draftExecutor.execute(
      buildContext(DAMAGE_COMPLETE, {
        metadata: { linkCandidateId: 'damage-existing-1' },
      }),
    );

    expect(damagesService.createDraftFromDocumentExtraction).toHaveBeenCalledWith(
      expect.objectContaining({
        linkExistingDamageId: 'damage-existing-1',
      }),
    );
  });

  it('applies damage record with confirmed values', async () => {
    damagesService.applyRecordFromDocumentExtraction.mockResolvedValue({
      id: 'damage-1',
      status: 'OPEN',
    });

    const result = await recordExecutor.execute(
      buildContext(DAMAGE_COMPLETE, { semanticAction: 'CREATE_DAMAGE_RECORD' }),
    );

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED);
    if (result.status !== DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED) return;
    expect(result.resultEntityId).toBe('damage-1');
    expect(damagesService.applyRecordFromDocumentExtraction).toHaveBeenCalledWith(
      expect.objectContaining({
        damageType: 'PAINT_DAMAGE',
        severity: 'MODERATE',
        documentExtractionId: 'ext-damage-1',
      }),
    );
  });

  it('links existing damage case without creating duplicate', async () => {
    damagesService.linkExistingDamageFromDocumentExtraction.mockResolvedValue({
      id: 'damage-existing-1',
      status: 'OPEN',
    });

    const result = await linkExecutor.execute(
      buildContext(DAMAGE_COMPLETE, {
        semanticAction: 'LINK_EXISTING_DAMAGE',
        metadata: { linkCandidateId: 'damage-existing-1' },
      }),
    );

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED);
    if (result.status !== DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED) return;
    expect(result.resultEntityId).toBe('damage-existing-1');
    expect(result.output).toMatchObject({ linkedExisting: true });
  });

  it('returns prior result on retry', async () => {
    const prior = {
      status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
      resultEntityId: 'damage-1',
    };

    const result = await draftExecutor.execute({
      ...buildContext(DAMAGE_UNKNOWN_TYPE),
      priorResult: prior,
    });

    expect(result).toBe(prior);
    expect(damagesService.createDraftFromDocumentExtraction).not.toHaveBeenCalled();
  });
});
