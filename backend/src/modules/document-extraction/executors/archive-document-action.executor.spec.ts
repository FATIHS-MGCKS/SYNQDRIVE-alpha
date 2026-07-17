import { AUTHORITY_LETTER } from '../__fixtures__/document-archive-fixtures';
import { ArchiveDocumentActionExecutor } from './archive-document-action.executor';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_ACTION_REQUIREMENTS,
} from '../document-action.types';
import type { DocumentActionPlan } from '../document-action-plan.types';

function buildContext(confirmedData: Record<string, unknown>) {
  const plan: DocumentActionPlan = {
    planId: 'plan-1',
    planVersion: 1,
    fingerprint: 'fp-1',
    status: 'CONFIRMED',
    extractionId: 'ext-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    documentType: 'OTHER',
    planOutcome: 'ARCHIVE_ONLY',
    actions: [
      {
        semanticAction: 'ARCHIVE_DOCUMENT',
        requirement: DOCUMENT_ACTION_REQUIREMENTS.REQUIRED,
        sequence: 1,
      },
    ],
    confirmedAt: new Date().toISOString(),
  };

  return {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    extractionId: 'ext-1',
    documentType: 'OTHER',
    confirmedData,
    sourceFileUrl: 'storage://file.pdf',
    plan,
    action: plan.actions[0],
    actionIndex: 0,
    idempotencyKey: 'ext-1:v1:fp-1:a1:ARCHIVE_DOCUMENT',
  };
}

describe('ArchiveDocumentActionExecutor', () => {
  const observability = {
    recordArchive: jest.fn(),
  };
  const executor = new ArchiveDocumentActionExecutor(observability as any);

  it('archives a valid authority letter', async () => {
    const result = await executor.execute(buildContext(AUTHORITY_LETTER));

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED);
    expect(result.resultEntityType).toBe('document_extraction');
    expect(result.resultEntityId).toBe('ext-1');
    expect(result.output?.archived).toBe(true);
    expect(result.output?.archiveSubtype).toBe('AUTHORITY_LETTER');
  });

  it('fails when archive metadata is missing', async () => {
    const result = await executor.execute(buildContext({ archiveSubtype: 'UNKNOWN' }));

    expect(result.status).toBe(DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED);
    expect(result.errorCode).toBe('ARCHIVE_GATE_BLOCKED');
  });

  it('returns prior result on retry', async () => {
    const prior = {
      status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
      resultEntityId: 'ext-1',
      output: { archived: true },
    };
    const result = await executor.execute({
      ...buildContext(AUTHORITY_LETTER),
      priorResult: prior,
    });

    expect(result).toBe(prior);
  });
});
