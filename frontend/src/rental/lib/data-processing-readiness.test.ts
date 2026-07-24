import { describe, expect, it } from 'vitest';
import {
  buildDataProcessingReadinessSummary,
  formatDataProcessingOverallDetail,
} from './data-processing-readiness';
import type {
  DataAuthorizationDto,
  DataProcessingAgreementListItem,
  EnforcementCoverageSummaryDto,
  ProcessingActivityRegisterListItem,
} from '../../lib/api';

function activity(
  overrides: Partial<ProcessingActivityRegisterListItem> = {},
): ProcessingActivityRegisterListItem {
  return {
    id: 'act-1',
    activityCode: 'PA-001',
    title: 'Fleet telemetry',
    status: 'ACTIVE',
    versionNumber: 1,
    isCurrentVersion: true,
    dpiaStatus: 'NOT_REQUIRED',
    hasBlockingGaps: false,
    completeness: { status: 'COMPLETE', blockingGaps: [] },
    runtimeCoverage: null,
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}

function coverage(overrides: Partial<EnforcementCoverageSummaryDto> = {}): EnforcementCoverageSummaryDto {
  return {
    coverageVersion: '2026.07.24',
    gitCommit: null,
    buildVersion: null,
    evaluatedAt: '2026-07-24T00:00:00.000Z',
    totalFlows: 4,
    enforcedCount: 4,
    notImplementedCount: 0,
    enforcementErrorCount: 0,
    partiallyEnforcedCount: 0,
    fullyProtected: true,
    flows: [],
    ...overrides,
  };
}

function partner(
  overrides: Partial<DataProcessingAgreementListItem> = {},
): DataProcessingAgreementListItem {
  return {
    id: 'dpa-1',
    processorName: 'Stripe',
    status: 'ACTIVE',
    versionNumber: 1,
    contractReference: 'AVV-2026',
    transferAssessmentStatus: 'ASSESSED',
    ...overrides,
  };
}

function legacyAuth(overrides: Partial<DataAuthorizationDto> = {}): DataAuthorizationDto {
  return {
    id: 'auth-1',
    organizationId: 'org-1',
    title: 'DIMO access',
    description: null,
    requestingEntity: 'Org',
    moduleOrigin: 'dimo',
    purpose: 'Telemetry',
    purposes: ['telemetry'],
    sourceType: 'SYSTEM',
    processorType: 'DIMO',
    processorName: 'DIMO',
    scope: 'Fleet',
    scopeKey: 'fleet',
    dataCategories: ['location'],
    destination: 'EU',
    vehicleIds: null,
    vehicleCount: 3,
    customerIds: [],
    bookingIds: [],
    accessPattern: 'API',
    accessPatternKey: 'api',
    status: 'Active',
    statusKey: 'ACTIVE',
    riskLevel: 'Medium',
    riskLevelKey: 'MEDIUM',
    systemKey: 'dimo',
    isSystemGenerated: true,
    lastAccessAt: null,
    accessCount: 0,
    revokeReason: null,
    grantedById: null,
    grantedByName: null,
    grantedAt: null,
    revokedById: null,
    revokedByName: null,
    revokedAt: null,
    expiresAt: null,
    notes: null,
    scopeNote: null,
    lastSyncedAt: '2026-07-24T00:00:00.000Z',
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildDataProcessingReadinessSummary', () => {
  it('returns neutral noData when register and legacy lists are empty', () => {
    const summary = buildDataProcessingReadinessSummary({
      activities: [],
      coverage: null,
      partners: [],
      legacyAuthorizations: [],
    });
    expect(summary.overallKey).toBe('noData');
    expect(summary.overallTone).toBe('neutral');
  });

  it('flags blockingGaps when activities have register gaps', () => {
    const summary = buildDataProcessingReadinessSummary({
      activities: [activity({ hasBlockingGaps: true, completeness: { status: 'INCOMPLETE', blockingGaps: ['LEGAL_BASIS'] } })],
      coverage: coverage(),
      partners: [],
      legacyAuthorizations: [legacyAuth()],
    });
    expect(summary.overallKey).toBe('blockingGaps');
    expect(summary.overallTone).toBe('critical');
    expect(summary.activitiesWithGaps).toBe(1);
  });

  it('flags blockingGaps when enforcement coverage has open flows', () => {
    const summary = buildDataProcessingReadinessSummary({
      activities: [activity()],
      coverage: coverage({ notImplementedCount: 2, enforcedCount: 2, totalFlows: 4 }),
      partners: [],
      legacyAuthorizations: [],
    });
    expect(summary.overallKey).toBe('blockingGaps');
    expect(summary.coverageGaps).toBe(2);
  });

  it('does not show false green when coverage gaps exist despite complete activities', () => {
    const summary = buildDataProcessingReadinessSummary({
      activities: [activity()],
      coverage: coverage({ enforcementErrorCount: 1, enforcedCount: 3, totalFlows: 4 }),
      partners: [partner()],
      legacyAuthorizations: [],
    });
    expect(summary.overallKey).toBe('blockingGaps');
    expect(summary.overallTone).toBe('critical');
  });

  it('returns partnerReview watch tone when DPA needs attention', () => {
    const summary = buildDataProcessingReadinessSummary({
      activities: [activity()],
      coverage: coverage(),
      partners: [partner({ transferAssessmentStatus: 'NOT_ASSESSED' })],
      legacyAuthorizations: [],
    });
    expect(summary.overallKey).toBe('partnerReview');
    expect(summary.overallTone).toBe('watch');
    expect(summary.partnerGaps).toBe(1);
  });

  it('returns traceable success when no blocking gaps remain', () => {
    const summary = buildDataProcessingReadinessSummary({
      activities: [activity()],
      coverage: coverage(),
      partners: [partner()],
      legacyAuthorizations: [legacyAuth()],
    });
    expect(summary.overallKey).toBe('traceable');
    expect(summary.overallTone).toBe('success');
  });
});

describe('formatDataProcessingOverallDetail', () => {
  const t = (key: string, vars?: Record<string, string | number>) => {
    if (vars) return `${key}:${Object.values(vars).join(',')}`;
    return key;
  };

  it('joins activity and coverage gap details', () => {
    const summary = buildDataProcessingReadinessSummary({
      activities: [activity({ hasBlockingGaps: true, completeness: { status: 'INCOMPLETE', blockingGaps: ['X'] } })],
      coverage: coverage({ notImplementedCount: 1, enforcedCount: 3, totalFlows: 4 }),
      partners: [],
      legacyAuthorizations: [],
    });
    const detail = formatDataProcessingOverallDetail(summary, t);
    expect(detail).toContain('blockingGapsActivities:1');
    expect(detail).toContain('blockingGapsCoverage:1');
    expect(detail).toContain(' · ');
  });
});
