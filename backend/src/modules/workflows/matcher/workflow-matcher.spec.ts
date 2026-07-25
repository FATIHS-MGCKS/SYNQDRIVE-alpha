import type { WorkflowDomainEventEnvelope } from '../envelope';
import { WorkflowMatcherRepository } from './workflow-matcher.repository';
import { WorkflowMatcherService } from './workflow-matcher.service';
import { evaluateWorkflowMatcherScope } from './workflow-matcher-scope.util';
import * as scopeUtil from './workflow-matcher-scope.util';
import {
  evaluateWorkflowFeatureFlag,
  resolveWorkflowAutomationPlatformEnabled,
} from './workflow-matcher-feature-flag.util';
import { buildWorkflowMatcherEventContext } from './workflow-matcher-context.util';
import type { WorkflowMatcherCandidateRow } from './workflow-matcher.types';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VEHICLE_1 = '11111111-1111-4111-8111-111111111111';
const VEHICLE_2 = '22222222-2222-4222-8222-222222222222';
const STATION_1 = '33333333-3333-4333-8333-333333333333';
const DEF_A = 'def-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DEF_B = 'def-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VER_A = 'ver-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VER_B = 'ver-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function envelope(overrides: Partial<WorkflowDomainEventEnvelope> = {}): WorkflowDomainEventEnvelope {
  return {
    eventId: 'evt-0001',
    eventType: 'booking.returned',
    eventVersion: '1.0.0',
    organizationId: ORG_A,
    occurredAt: '2026-07-25T10:00:00.000Z',
    receivedAt: '2026-07-25T10:00:01.000Z',
    entityType: 'booking',
    entityId: 'booking-1',
    correlationId: 'corr-1',
    causationId: null,
    source: 'bookings',
    payload: {
      bookingId: 'booking-1',
      vehicleId: VEHICLE_1,
      stationId: STATION_1,
    },
    metadata: {},
    schemaVersion: '1.0.0',
    ...overrides,
  };
}

function candidate(overrides: Partial<WorkflowMatcherCandidateRow> = {}): WorkflowMatcherCandidateRow {
  return {
    triggerId: 'trg-1',
    triggerType: 'booking.returned',
    triggerConfig: {},
    versionId: VER_A,
    versionNumber: 1,
    versionStatus: 'ACTIVE',
    publishedAt: new Date('2026-07-01'),
    definitionId: DEF_A,
    definitionName: 'Alpha Workflow',
    definitionSlug: 'alpha',
    definitionCreatedAt: new Date('2026-07-01'),
    definitionLifecycleStatus: 'ACTIVE',
    remediationRequired: false,
    activeVersionId: VER_A,
    scopeType: 'ORGANIZATION',
    bindings: [],
    actions: [{ actionType: 'task.create', actionIndex: 0, capabilityStatusAtPublish: 'AVAILABLE' }],
    ...overrides,
  };
}

function createMatcherHarness() {
  const candidates: WorkflowMatcherCandidateRow[] = [];
  const flags: Awaited<ReturnType<WorkflowMatcherRepository['loadFeatureFlags']>> = [];

  const repository = {
    findTriggerCandidates: jest.fn(async ({ organizationId, eventType }: { organizationId: string; eventType: string }) => {
      if (organizationId !== ORG_A) return [];
      return candidates.filter((c) => c.triggerType === eventType);
    }),
    loadFeatureFlags: jest.fn(async () => flags),
  } as unknown as WorkflowMatcherRepository;

  const service = new WorkflowMatcherService(repository);

  return {
    service,
    repository,
    candidates,
    flags,
    addCandidate(row: WorkflowMatcherCandidateRow) {
      candidates.push(row);
    },
  };
}

describe('WorkflowMatcherService', () => {
  it('matches organization-scoped workflow for correct tenant', async () => {
    const h = createMatcherHarness();
    h.addCandidate(candidate());

    const result = await h.service.match({ envelope: envelope() });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].workflowDefinitionId).toBe(DEF_A);
    expect(result.matches[0].matchRank).toBe(1);
    expect(result.skipped).toHaveLength(0);
    expect(h.repository.findTriggerCandidates).toHaveBeenCalledWith({
      organizationId: ORG_A,
      eventType: 'booking.returned',
    });
  });

  it('returns no candidates for wrong organization (cross-tenant)', async () => {
    const h = createMatcherHarness();
    h.addCandidate(candidate());

    const result = await h.service.match({
      envelope: envelope({ organizationId: ORG_B }),
    });

    expect(result.matches).toHaveLength(0);
    expect(h.repository.findTriggerCandidates).toHaveBeenCalledWith({
      organizationId: ORG_B,
      eventType: 'booking.returned',
    });
  });

  it('skips archived definition without blocking other workflows', async () => {
    const h = createMatcherHarness();
    h.addCandidate(candidate({ definitionLifecycleStatus: 'ARCHIVED' }));
    h.addCandidate(candidate({
      definitionId: DEF_B,
      versionId: VER_B,
      activeVersionId: VER_B,
      definitionName: 'Beta Workflow',
      definitionCreatedAt: new Date('2026-07-02'),
    }));

    const result = await h.service.match({ envelope: envelope() });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].definitionName).toBe('Beta Workflow');
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].skipReason).toBe('DEFINITION_ARCHIVED');
  });

  it('skips inactive version pointer', async () => {
    const h = createMatcherHarness();
    h.addCandidate(candidate({ activeVersionId: 'other-version' }));

    const result = await h.service.match({ envelope: envelope() });
    expect(result.matches).toHaveLength(0);
    expect(result.skipped[0].skipReason).toBe('NOT_ACTIVE_VERSION_POINTER');
  });

  it('skips unsupported event version', async () => {
    const h = createMatcherHarness();
    h.addCandidate(candidate({
      triggerConfig: { supportedEventVersions: ['2.0.0'] },
    }));

    const result = await h.service.match({ envelope: envelope({ eventVersion: '1.0.0' }) });
    expect(result.skipped[0].skipReason).toBe('UNSUPPORTED_EVENT_VERSION');
  });

  it('matches vehicle scope when binding matches', async () => {
    const h = createMatcherHarness();
    h.addCandidate(candidate({
      scopeType: 'VEHICLE',
      bindings: [{ bindingType: 'VEHICLE', bindingId: VEHICLE_1 }],
    }));

    const result = await h.service.match({ envelope: envelope() });
    expect(result.matches).toHaveLength(1);
  });

  it('fails closed on empty vehicle scope bindings', async () => {
    const h = createMatcherHarness();
    h.addCandidate(candidate({ scopeType: 'VEHICLE', bindings: [] }));

    const result = await h.service.match({ envelope: envelope() });
    expect(result.skipped[0].skipReason).toBe('SCOPE_EMPTY_BINDINGS');
  });

  it('skips station scope mismatch', async () => {
    const h = createMatcherHarness();
    h.addCandidate(candidate({
      scopeType: 'STATION',
      bindings: [{ bindingType: 'STATION', bindingId: 'other-station' }],
    }));

    const result = await h.service.match({ envelope: envelope() });
    expect(result.skipped[0].skipReason).toBe('SCOPE_STATION_MISMATCH');
  });

  it('orders multiple workflows deterministically', async () => {
    const h = createMatcherHarness();
    h.addCandidate(candidate({
      definitionId: DEF_B,
      versionId: VER_B,
      activeVersionId: VER_B,
      definitionName: 'Zulu',
      definitionCreatedAt: new Date('2026-07-03'),
    }));
    h.addCandidate(candidate({
      definitionName: 'Alpha',
      definitionCreatedAt: new Date('2026-07-01'),
    }));
    h.addCandidate(candidate({
      definitionId: 'def-c',
      versionId: 'ver-c',
      activeVersionId: 'ver-c',
      definitionName: 'Mike',
      definitionCreatedAt: new Date('2026-07-02'),
    }));

    const first = await h.service.match({ envelope: envelope() });
    const second = await h.service.match({ envelope: envelope() });

    expect(first.matches.map((m) => m.definitionName)).toEqual(['Alpha', 'Mike', 'Zulu']);
    expect(second.matches.map((m) => m.definitionName)).toEqual(first.matches.map((m) => m.definitionName));
    expect(first.matches.map((m) => m.matchRank)).toEqual([1, 2, 3]);
  });

  it('isolates evaluation errors per workflow', async () => {
    const h = createMatcherHarness();
    h.addCandidate(candidate({ definitionName: 'Broken' }));
    h.addCandidate(candidate({
      definitionId: DEF_B,
      versionId: VER_B,
      activeVersionId: VER_B,
      definitionName: 'Healthy',
      definitionCreatedAt: new Date('2026-07-02'),
    }));

    const spy = jest.spyOn(scopeUtil, 'evaluateWorkflowMatcherScope');
    spy.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    const result = await h.service.match({ envelope: envelope() });
    spy.mockRestore();

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].definitionName).toBe('Healthy');
    expect(result.skipped.some((s) => s.skipReason === 'EVALUATION_ERROR')).toBe(true);
  });

  it('evaluates 250 candidates within performance budget', async () => {
    const h = createMatcherHarness();
    for (let i = 0; i < 250; i++) {
      h.addCandidate(candidate({
        definitionId: `def-${i}`,
        versionId: `ver-${i}`,
        activeVersionId: `ver-${i}`,
        definitionName: `Workflow ${String(i).padStart(3, '0')}`,
        definitionCreatedAt: new Date(2026, 6, 1 + (i % 28)),
      }));
    }

    const started = performance.now();
    const result = await h.service.match({ envelope: envelope() });
    const elapsed = performance.now() - started;

    expect(result.matches).toHaveLength(250);
    expect(elapsed).toBeLessThan(500);
  });

  it('dry run explain returns skip reasons without side effects', async () => {
    const h = createMatcherHarness();
    h.addCandidate(candidate({ scopeType: 'VEHICLE', bindings: [] }));

    const result = await h.service.explain({ envelope: envelope() });
    expect(result.dryRun).toBe(true);
    expect(result.skipped[0].skipReason).toBe('SCOPE_EMPTY_BINDINGS');
    expect(result.skipped[0].skipDetail).toContain('vehicle binding');
  });
});

describe('evaluateWorkflowMatcherScope', () => {
  const ctx = buildWorkflowMatcherEventContext(envelope());

  it('matches ORGANIZATION scope without bindings', () => {
    expect(
      evaluateWorkflowMatcherScope({ scopeType: 'ORGANIZATION', bindings: [] }, ctx).matched,
    ).toBe(true);
  });

  it('rejects missing scope configuration', () => {
    const result = evaluateWorkflowMatcherScope({ scopeType: null, bindings: [] }, ctx);
    expect(result.matched).toBe(false);
    if (!result.matched) expect(result.reason).toBe('SCOPE_NOT_CONFIGURED');
  });
});

describe('workflow feature flags', () => {
  it('disables platform automation when flag is off', () => {
    const enabled = resolveWorkflowAutomationPlatformEnabled([
      {
        id: 'f1',
        scope: 'PLATFORM',
        organizationId: null,
        workflowDefinitionId: null,
        flagKey: 'workflow_automation_enabled',
        enabled: false,
        rolloutPercentage: null,
        rolloutScopes: [],
      },
    ]);
    expect(enabled).toBe(false);
  });

  it('excludes rollout percentage deterministically', () => {
    const flags = [
      {
        id: 'f1',
        scope: 'WORKFLOW_DEFINITION',
        organizationId: ORG_A,
        workflowDefinitionId: DEF_A,
        flagKey: 'workflow_definition_enabled',
        enabled: true,
        rolloutPercentage: 0,
        rolloutScopes: [],
      },
    ];
    const ctx = buildWorkflowMatcherEventContext(envelope());
    const evalResult = evaluateWorkflowFeatureFlag(flags, {
      workflowDefinitionId: DEF_A,
      ctx,
    });
    expect(evalResult.allowed).toBe(false);
    if (!evalResult.allowed) {
      expect(evalResult.reason).toBe('ROLLOUT_PERCENTAGE_EXCLUDED');
    }
  });
});
