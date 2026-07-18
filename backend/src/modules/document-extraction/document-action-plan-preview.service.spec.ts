import { BadRequestException } from '@nestjs/common';
import { DocumentActionPlanPreviewService } from './document-action-plan-preview.service';
import { DocumentActionOrchestratorService } from './document-action-orchestrator.service';
import { FINE_COMPLETE } from './__fixtures__/document-fine-fixtures';

describe('DocumentActionPlanPreviewService', () => {
  const orchestrator = {
    supportsExecutorPath: jest.fn().mockReturnValue(true),
    buildPreviewPlan: jest.fn(),
  } as unknown as DocumentActionOrchestratorService;

  const service = new DocumentActionPlanPreviewService(orchestrator);

  beforeEach(() => {
    jest.clearAllMocks();
    (orchestrator.buildPreviewPlan as jest.Mock).mockResolvedValue({
      planId: 'plan-1',
      planVersion: 1,
      fingerprint: 'fp-abc123',
      status: 'CONFIRMED',
      extractionId: 'ext-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      documentType: 'FINE',
      planOutcome: 'READY',
      actions: [
        { semanticAction: 'CREATE_FINE_DRAFT', requirement: 'REQUIRED', sequence: 1 },
      ],
      confirmedAt: new Date().toISOString(),
      metadata: { missingRequirements: [] },
    });
  });

  it('rejects preview before saved field review', async () => {
    await expect(
      service.buildForRecord({
        id: 'ext-1',
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        status: 'READY_FOR_REVIEW',
        confirmedData: { acceptedEntityLinks: [] },
        plausibility: { overallStatus: 'OK', checks: [] },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns preview with fingerprint for saved fine review', async () => {
    const preview = await service.buildForRecord({
      id: 'ext-1',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      status: 'READY_FOR_REVIEW',
      documentType: 'FINE',
      effectiveDocumentType: 'FINE',
      confirmedData: FINE_COMPLETE,
      plausibility: { overallStatus: 'OK', checks: [] },
    });

    expect(preview.fingerprint).toBe('fp-abc123');
    expect(preview.canConfirm).toBe(true);
    expect(preview.actions[0]?.title).toBe('Bußgeldentwurf anlegen');
  });
});
