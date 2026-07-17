import type { DocumentCategory, DocumentExtractionType } from '@prisma/client';
import type { DocumentActionPlannerInput } from './document-action-planner.types';
import { DEFAULT_DOCUMENT_DOWNSTREAM_CAPABILITIES } from './document-action-planner.capabilities';
import { DOCUMENT_ACTION_PLANNER_VERSION } from './document-action-planner.types';

export function buildPlannerTestInput(
  overrides: Partial<DocumentActionPlannerInput> = {},
): DocumentActionPlannerInput {
  return {
    organizationId: 'org-1',
    extractionId: 'ext-1',
    documentCategory: 'SERVICE' as DocumentCategory,
    documentSubtype: 'STANDARD',
    effectiveDocumentType: 'SERVICE' as DocumentExtractionType,
    confirmedData: {
      eventDate: '2026-01-15',
      odometerKm: 45000,
      workshopName: 'Werkstatt Nord',
      description: 'Inspektion',
      costCents: 19900,
    },
    plausibility: {
      overallStatus: 'OK',
      checks: [],
      recommendedHumanReviewNotes: [],
    },
    entityLinks: [
      {
        role: 'PRIMARY_VEHICLE',
        entityType: 'VEHICLE',
        entityId: 'veh-1',
      },
    ],
    entityCandidates: [],
    featureFlags: {
      documentIntakeV2: true,
      actionPreviewEnabled: true,
      autoApplyEnabled: false,
      archiveOnlyFallback: true,
    },
    downstreamCapabilities: { ...DEFAULT_DOCUMENT_DOWNSTREAM_CAPABILITIES },
    plannerVersion: DOCUMENT_ACTION_PLANNER_VERSION,
    applyMode: 'PREVIEW',
    ...overrides,
  };
}
