import { DENY_SWITCH_SCOPE } from './deny-switch.constants';
import { DenySwitchLocalStore } from './deny-switch.local-store';
import { DenySwitchPropagationService } from './deny-switch.propagation.service';
import { DenySwitchMetricsService } from './deny-switch.metrics';
import { DenySwitchService } from './deny-switch.service';
import { AUTHORIZATION_DECISION_ACTION } from '../authorization-decision-engine/authorization-decision.constants';

describe('DenySwitchService', () => {
  let service: DenySwitchService;
  let prisma: { $transaction: jest.Mock };
  let repo: {
    activateInTransaction: jest.Mock;
    buildIdempotencyKey: jest.Mock;
    findAllActive: jest.Mock;
    findActiveForOrganization: jest.Mock;
    findByOrganization: jest.Mock;
  };
  let localStore: DenySwitchLocalStore;
  let propagation: { publish: jest.Mock };
  let metrics: DenySwitchMetricsService;
  let auditOutbox: { enqueueInTransaction: jest.Mock };
  let authorizationDecision: { invalidateOrganizationCache: jest.Mock };
  let redis: { publish: jest.Mock };

  beforeEach(() => {
    localStore = new DenySwitchLocalStore();
    prisma = { $transaction: jest.fn(async (fn) => fn(prisma)) };
    repo = {
      activateInTransaction: jest.fn().mockResolvedValue({
        row: {
          id: 'ds-1',
          organizationId: 'org-1',
          scopeType: 'ORGANIZATION',
          scopeEntityId: 'org-1',
          resourceType: null,
          resourceId: null,
          sequence: 1n,
          active: true,
          blocksIngest: true,
          blocksRead: true,
          blocksQueueEnqueue: true,
          trigger: 'REVOKED',
          activatedAt: new Date(),
        },
        idempotentReplay: false,
      }),
      buildIdempotencyKey: jest.fn().mockReturnValue('key-1'),
      findAllActive: jest.fn().mockResolvedValue([]),
      findActiveForOrganization: jest.fn().mockResolvedValue([]),
      findByOrganization: jest.fn().mockResolvedValue([]),
    };
    propagation = { publish: jest.fn().mockResolvedValue(true) };
    metrics = new DenySwitchMetricsService();
    auditOutbox = { enqueueInTransaction: jest.fn().mockResolvedValue({}) };
    authorizationDecision = { invalidateOrganizationCache: jest.fn().mockReturnValue(2) };
    redis = { publish: jest.fn() };

    service = new DenySwitchService(
      prisma as never,
      repo as never,
      localStore,
      propagation as never,
      metrics,
      auditOutbox as never,
      authorizationDecision as never,
      redis as never,
    );
  });

  it('activates local deny immediately before redis publish', async () => {
    const result = await service.activateSync({
      organizationId: 'org-1',
      scopeType: DENY_SWITCH_SCOPE.ORGANIZATION,
      scopeEntityId: 'org-1',
      trigger: 'REVOKED',
      correlationId: 'corr-1',
    });

    expect(result.idempotentReplay).toBe(false);
    expect(localStore.isReady()).toBe(true);
    expect(localStore.listForOrganization('org-1')).toHaveLength(1);
    expect(authorizationDecision.invalidateOrganizationCache).toHaveBeenCalledWith('org-1');
    expect(propagation.publish).toHaveBeenCalled();
    expect(auditOutbox.enqueueInTransaction).toHaveBeenCalled();
  });

  it('returns idempotent replay on duplicate activation', async () => {
    repo.activateInTransaction.mockResolvedValueOnce({
      row: {
        id: 'ds-1',
        organizationId: 'org-1',
        scopeType: 'ORGANIZATION',
        scopeEntityId: 'org-1',
        resourceType: null,
        resourceId: null,
        sequence: 1n,
        active: true,
        blocksIngest: true,
        blocksRead: true,
        blocksQueueEnqueue: true,
        trigger: 'REVOKED',
        activatedAt: new Date(),
      },
      idempotentReplay: true,
    });

    const result = await service.activateSync({
      organizationId: 'org-1',
      scopeType: DENY_SWITCH_SCOPE.ORGANIZATION,
      scopeEntityId: 'org-1',
      trigger: 'REVOKED',
      correlationId: 'corr-dup',
    });
    expect(result.idempotentReplay).toBe(true);
  });

  it('evaluates deny for activated organization before propagation completes elsewhere', async () => {
    await service.activateSync({
      organizationId: 'org-1',
      scopeType: DENY_SWITCH_SCOPE.ORGANIZATION,
      scopeEntityId: 'org-1',
      trigger: 'REVOKED',
      correlationId: 'corr-2',
    });

    const deny = service.evaluate({
      organizationId: 'org-1',
      action: AUTHORIZATION_DECISION_ACTION.INGEST,
    });
    expect(deny?.denied).toBe(true);
  });

  it('continues local deny when redis publish fails', async () => {
    propagation.publish.mockResolvedValueOnce(false);
    await service.activateSync({
      organizationId: 'org-1',
      scopeType: DENY_SWITCH_SCOPE.PROCESSING_ACTIVITY,
      scopeEntityId: 'pa-1',
      trigger: 'SUSPENDED',
      correlationId: 'corr-3',
    });
    const deny = service.evaluate({
      organizationId: 'org-1',
      action: AUTHORIZATION_DECISION_ACTION.READ,
      processingActivityId: 'pa-1',
    });
    expect(deny?.denied).toBe(true);
  });

  it('hydrates active switches from database on restart', async () => {
    repo.findAllActive.mockResolvedValue([
      {
        organizationId: 'org-1',
        scopeType: 'CONSENT',
        scopeEntityId: 'c-1',
        resourceType: null,
        resourceId: null,
        sequence: 7n,
        active: true,
        blocksIngest: true,
        blocksRead: true,
        blocksQueueEnqueue: true,
        trigger: 'REVOKED',
        activatedAt: new Date(),
      },
    ]);
    const count = await service.hydrateFromDatabase();
    expect(count).toBe(1);
    expect(localStore.isReady()).toBe(true);
    const deny = service.evaluate({
      organizationId: 'org-1',
      action: AUTHORIZATION_DECISION_ACTION.INGEST,
      consentId: 'c-1',
    });
    expect(deny?.denied).toBe(true);
  });

  it('applies distributed propagation only for newer sequence', () => {
    const propagationService = new DenySwitchPropagationService(
      localStore,
      metrics,
      { host: 'localhost', port: 6379, password: undefined, db: 0 } as never,
    );
    localStore.apply({
      organizationId: 'org-1',
      scopeType: DENY_SWITCH_SCOPE.PROVIDER_GRANT,
      scopeEntityId: 'pg-1',
      resourceType: null,
      resourceId: null,
      sequence: 20n,
      active: true,
      blocksIngest: true,
      blocksRead: true,
      blocksQueueEnqueue: true,
      trigger: 'REVOKED',
      activatedAt: new Date().toISOString(),
    });

    const stale = propagationService.applyMessage({
      organizationId: 'org-1',
      scopeType: 'PROVIDER_GRANT',
      scopeEntityId: 'pg-1',
      resourceType: null,
      resourceId: null,
      sequence: '10',
      active: false,
      blocksIngest: true,
      blocksRead: true,
      blocksQueueEnqueue: true,
      trigger: 'REVOKED',
      activatedAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
      instanceId: 'other',
    });
    expect(stale).toBe(false);
    expect(localStore.get('org-1:PROVIDER_GRANT:pg-1::')?.active).toBe(true);
  });

  it('records propagation latency metrics', () => {
    const propagationService = new DenySwitchPropagationService(
      localStore,
      metrics,
      { host: 'localhost', port: 6379, password: undefined, db: 0 } as never,
    );
    const activatedAt = new Date(Date.now() - 50).toISOString();
    propagationService.applyMessage({
      organizationId: 'org-2',
      scopeType: 'ORGANIZATION',
      scopeEntityId: 'org-2',
      resourceType: null,
      resourceId: null,
      sequence: '2',
      active: true,
      blocksIngest: true,
      blocksRead: true,
      blocksQueueEnqueue: true,
      trigger: 'REVOKED',
      activatedAt,
      publishedAt: new Date().toISOString(),
      instanceId: 'worker-1',
    });
    const snapshot = metrics.snapshot();
    expect(snapshot.propagationLatencyMs.sampleCount).toBeGreaterThan(0);
  });

  it('activateForRevocation creates org + entity scopes', async () => {
    const results = await service.activateForRevocation({
      organizationId: 'org-1',
      correlationId: 'corr-4',
      processingActivityId: 'pa-1',
      enforcementPolicyId: 'ep-1',
      vehicleIds: ['veh-1'],
    });
    expect(results.length).toBeGreaterThanOrEqual(4);
    expect(repo.activateInTransaction).toHaveBeenCalled();
  });
});
