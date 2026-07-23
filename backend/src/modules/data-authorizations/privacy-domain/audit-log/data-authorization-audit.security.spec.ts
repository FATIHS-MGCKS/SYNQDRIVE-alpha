import { AuthorizationActorType, DataAuthorizationAuditOutboxStatus } from '@prisma/client';
import { AuthorizationDecisionService } from '../../authorization-decision-engine/authorization-decision.service';
import {
  AUTHORIZATION_DECISION_ACTION,
  AUTHORIZATION_DECISION_OUTCOME,
} from '../../authorization-decision-engine/authorization-decision.constants';
import { buildAuthorizationDecisionContext } from '../../authorization-decision-engine/authorization-decision.context';
import { evaluateAuthorizationDecision } from '../../authorization-decision-engine/authorization-decision.engine';
import { POLICY_RESOLVER_DECISION } from '../../policy-resolver/policy-resolver.constants';
import { buildAuditIdempotencyKey } from './data-authorization-audit.constants';
import { DataAuthorizationAuditOutboxRepository } from './data-authorization-audit-outbox.repository';
import { DataAuthorizationAuditOutboxProcessorService } from './data-authorization-audit-outbox.processor';
import { DataAuthorizationAuditOutboxMetricsService } from './data-authorization-audit-outbox.metrics';
import { DataAuthorizationAuditService } from './data-authorization-audit.service';
import {
  pseudonymizeProcessorIdentity,
  pseudonymizeResourceReference,
  sanitizeAuditPayload,
} from './data-authorization-audit-sanitize.util';
import { mustAuditFully, shouldSampleAllow } from './data-authorization-audit-sampling';

describe('data-authorization audit logging', () => {
  describe('sampling', () => {
    it('never samples DENY decisions', () => {
      expect(
        shouldSampleAllow({
          decision: 'DENY',
          dataCategory: 'TELEMETRY',
          action: 'READ',
          reasonCode: 'POLICY_MATCH',
          allowSamplingRate: 1,
        }),
      ).toBe(false);
      expect(
        mustAuditFully({
          decision: 'DENY',
          dataCategory: 'TELEMETRY',
          action: 'READ',
          reasonCode: 'POLICY_MATCH',
        }),
      ).toBe(true);
    });

    it('never samples critical data categories or destructive actions', () => {
      expect(
        mustAuditFully({
          decision: 'ALLOW',
          dataCategory: 'CUSTOMER_DATA',
          action: 'READ',
          reasonCode: 'POLICY_MATCH',
        }),
      ).toBe(true);
      expect(
        mustAuditFully({
          decision: 'ALLOW',
          dataCategory: 'TELEMETRY',
          action: 'EXPORT',
          reasonCode: 'POLICY_MATCH',
        }),
      ).toBe(true);
    });
  });

  describe('sanitizeAuditPayload', () => {
    it('redacts sensitive keys from outbox payloads', () => {
      const sanitized = sanitizeAuditPayload({
        vehicleId: 'veh-1',
        customerId: 'cust-1',
        processorId: 'svc-1',
        status: 'ALLOW',
      }) as Record<string, unknown>;

      expect(sanitized.vehicleId).toBe('[REDACTED]');
      expect(sanitized.customerId).toBe('[REDACTED]');
      expect(sanitized.processorId).toBe('[REDACTED]');
      expect(sanitized.status).toBe('ALLOW');
    });

    it('pseudonymizes resource and processor references', () => {
      const hash = pseudonymizeResourceReference('org-a', 'VEHICLE', 'veh-123');
      expect(hash).toHaveLength(32);
      expect(hash).toBe(pseudonymizeResourceReference('org-a', 'VEHICLE', 'veh-123'));
      expect(pseudonymizeProcessorIdentity('synqdrive-ingestion')).toHaveLength(24);
    });
  });

  describe('DataAuthorizationAuditOutboxRepository', () => {
    it('returns existing row on duplicate idempotency key', async () => {
      const existing = { id: 'outbox-existing' };
      const create = jest.fn().mockRejectedValue({ code: 'P2002', clientVersion: 'test' });
      const findUnique = jest.fn().mockResolvedValue(existing);
      const tx = { dataAuthorizationAuditOutbox: { create, findUnique } };
      const repo = new DataAuthorizationAuditOutboxRepository({} as never);

      const result = await repo.enqueueInTransaction(tx as never, {
        organizationId: 'org-a',
        idempotencyKey: 'key-dup',
        eventKind: 'AUTHORIZATION_DECISION',
        correlationId: 'corr-1',
        payload: { decision: 'DENY' },
      });

      expect(result).toBe(existing);
    });
  });

  describe('DataAuthorizationAuditOutboxProcessorService', () => {
    const basePayload = {
      id: 'event-1',
      organizationId: 'org-a',
      eventType: 'DENY',
      dataCategory: 'GPS_LOCATION',
      processingPurpose: 'LIVE_MAP',
      reasonCode: 'POLICY_UNCLEAR',
      correlationId: 'corr-1',
      evaluatedAt: new Date().toISOString(),
      retentionClass: 'EXTENDED',
      sampled: false,
    };

    const baseRow = {
      id: 'outbox-1',
      organizationId: 'org-a',
      eventKind: 'AUTHORIZATION_DECISION',
      payload: basePayload,
      status: DataAuthorizationAuditOutboxStatus.PENDING,
      attempts: 0,
    };

    let prisma: {
      dataAuthorizationAuditOutbox: { findUnique: jest.Mock };
      authorizationDecisionEvent: { create: jest.Mock };
    };
    let outboxRepo: {
      claimForProcessing: jest.Mock;
      markProcessed: jest.Mock;
      markRetry: jest.Mock;
      markDeadLetter: jest.Mock;
    };
    let metrics: DataAuthorizationAuditOutboxMetricsService;
    let processor: DataAuthorizationAuditOutboxProcessorService;

    beforeEach(() => {
      prisma = {
        dataAuthorizationAuditOutbox: {
          findUnique: jest.fn().mockResolvedValue(baseRow),
        },
        authorizationDecisionEvent: {
          create: jest.fn().mockResolvedValue({ id: 'event-1' }),
        },
      };
      outboxRepo = {
        claimForProcessing: jest.fn().mockResolvedValue({ ...baseRow, attempts: 1 }),
        markProcessed: jest.fn().mockResolvedValue(undefined),
        markRetry: jest.fn().mockResolvedValue(undefined),
        markDeadLetter: jest.fn().mockResolvedValue(undefined),
      };
      metrics = new DataAuthorizationAuditOutboxMetricsService();
      processor = new DataAuthorizationAuditOutboxProcessorService(
        prisma as never,
        outboxRepo as unknown as DataAuthorizationAuditOutboxRepository,
        metrics,
      );
    });

    it('materializes authorization decision events append-only', async () => {
      const result = await processor.processOutboxId('outbox-1');

      expect(result).toBe('processed');
      expect(prisma.authorizationDecisionEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-a',
            vehicleId: null,
            eventType: 'DENY',
          }),
        }),
      );
      expect(outboxRepo.markProcessed).toHaveBeenCalledWith('outbox-1');
    });

    it('treats duplicate event id as idempotent success on retry', async () => {
      prisma.authorizationDecisionEvent.create.mockRejectedValueOnce({ code: 'P2002' });

      const result = await processor.processOutboxId('outbox-1');

      expect(result).toBe('processed');
      expect(outboxRepo.markProcessed).toHaveBeenCalledWith('outbox-1');
    });

    it('schedules retry when materialization fails', async () => {
      prisma.authorizationDecisionEvent.create.mockRejectedValueOnce(new Error('db unavailable'));

      const result = await processor.processOutboxId('outbox-1');

      expect(result).toBe('retry');
      expect(outboxRepo.markRetry).toHaveBeenCalled();
      expect(metrics.snapshot()['retry:AUTHORIZATION_DECISION']).toBe(1);
    });

    it('dead-letters after max attempts', async () => {
      outboxRepo.claimForProcessing.mockResolvedValue({ ...baseRow, attempts: 8 });
      prisma.authorizationDecisionEvent.create.mockRejectedValueOnce(new Error('db unavailable'));

      const result = await processor.processOutboxId('outbox-1');

      expect(result).toBe('dead_letter');
      expect(outboxRepo.markDeadLetter).toHaveBeenCalled();
    });
  });

  describe('DataAuthorizationAuditService tenant isolation', () => {
    it('scopes list queries to organizationId', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = { authorizationDecisionEvent: { findMany } };
      const audit = new DataAuthorizationAuditService(
        prisma as never,
        { enqueue: jest.fn() } as never,
        { processOutboxId: jest.fn() } as never,
      );

      await audit.listAuthorizationDecisions({ organizationId: 'org-b', limit: 10 });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-b' }),
        }),
      );
    });
  });

  describe('audit failure fail-closed', () => {
    it('denies in production when critical audit delivery fails', async () => {
      const { request } = buildAuthorizationDecisionContext({
        organizationId: 'org-1',
        sourceSystem: 'SYNQDRIVE_SYSTEM',
        dataCategory: 'GPS_LOCATION',
        purpose: 'LIVE_MAP',
        action: AUTHORIZATION_DECISION_ACTION.INGEST,
        processorType: 'SYNQDRIVE',
        processorId: 'synqdrive-platform',
        resourceType: 'VEHICLE',
        vehicleId: 'veh-1',
        resourceId: 'veh-1',
        correlationId: 'corr-audit-fail',
        actorType: AuthorizationActorType.SYSTEM,
      });

      const evaluated = request!;
      const result = evaluateAuthorizationDecision({
        request: evaluated,
        resolverResult: {
          decisionCandidate: POLICY_RESOLVER_DECISION.ALLOW,
          matchedPolicy: { id: 'pol-1', policyFamilyId: 'fam-1' } as never,
          policyVersion: 1,
          processingActivity: { status: 'ACTIVE', entityId: 'pa-1' } as never,
          legalBasisStatus: { status: 'APPROVED' } as never,
          consentStatus: { status: 'GRANTED' } as never,
          providerGrantStatus: { status: 'ACTIVE' } as never,
          dataSharingStatus: { status: 'AUTHORIZED' } as never,
          dpaStatus: { status: 'ACTIVE' } as never,
          scopeMatch: { matched: true, scopeType: 'VEHICLE' },
          blockingReasons: [],
          warnings: [],
          evaluatedAt: new Date().toISOString(),
          resolverVersion: '1.0.0',
          evaluatedContext: {} as never,
        },
        resolverError: false,
        globalDenySwitch: false,
        devBypassEnabled: false,
        isProduction: true,
      });

      const auditService = {
        recordAuthorizationDecision: jest.fn().mockRejectedValue(new Error('Critical audit delivery failed: dead_letter')),
      };
      const service = new AuthorizationDecisionService(
        { resolve: jest.fn() } as never,
        auditService as never,
      );

      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const finalized = await (service as unknown as {
          finalize: (
            raw: unknown,
            evaluated: unknown,
            result: { decision: string; reasonCode: string },
            config: { auditEnabled: boolean },
          ) => Promise<{ decision: string; reasonCode: string }>;
        }).finalize(
          { skipAudit: false },
          evaluated,
          result,
          { auditEnabled: true },
        );

        expect(finalized.decision).toBe(AUTHORIZATION_DECISION_OUTCOME.DENY);
        expect(finalized.reasonCode).toBe('DATABASE_ERROR');
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });

  describe('buildAuditIdempotencyKey', () => {
    it('builds stable tenant-scoped keys', () => {
      const key = buildAuditIdempotencyKey({
        eventKind: 'AUTHORIZATION_DECISION',
        organizationId: 'org-a',
        correlationId: 'corr-1',
        suffix: 'DENY:event-1',
      });

      expect(key).toBe(
        'data-auth-audit:org-a:AUTHORIZATION_DECISION:corr-1:DENY:event-1',
      );
    });
  });

  describe('immutable event surface', () => {
    it('audit service exposes append-only list APIs without update/delete', () => {
      const proto = Object.getOwnPropertyNames(DataAuthorizationAuditService.prototype);
      expect(proto).not.toEqual(expect.arrayContaining(['updateAuthorizationDecision', 'deleteAuthorizationDecision']));
      expect(proto).toEqual(
        expect.arrayContaining([
          'recordAuthorizationDecision',
          'listAuthorizationDecisions',
          'enqueueLifecycleAuditInTransaction',
          'enqueueReviewDecisionAuditInTransaction',
        ]),
      );
    });
  });
});
