import { EvaluationsAuditService } from './evaluations-audit.service';
import { BusinessAuditService } from '@modules/business-audit/business-audit.service';
import {
  EVALUATIONS_AUDIT_ENTITY_TYPE,
  EvaluationsAuditAction,
} from './evaluations-audit.constants';
import { scanBusinessAuditPayloadForSecrets } from '@modules/business-audit/business-audit-sanitize.util';

describe('EvaluationsAuditService', () => {
  const businessAudit = {
    enqueue: jest.fn(),
    enqueueInTransaction: jest.fn(),
    processOutboxIds: jest.fn(),
    flushCritical: jest.fn(),
  };

  let service: EvaluationsAuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    businessAudit.enqueue.mockResolvedValue({ id: 'outbox-1' });
    businessAudit.processOutboxIds.mockResolvedValue(undefined);
    service = new EvaluationsAuditService(businessAudit as unknown as BusinessAuditService);
  });

  it('enqueues finance export audit with aggregate metadata only', async () => {
    await service.recordFinanceExport('org-a', {
      actorUserId: 'user-1',
      correlationId: 'req-123',
    }, {
      exportId: 'export-1',
      stationId: 'station-1',
      activeInsightCount: 4,
    });

    expect(businessAudit.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        action: EvaluationsAuditAction.FINANCE_EXPORT,
        entityType: EVALUATIONS_AUDIT_ENTITY_TYPE.EXPORT,
        entityId: 'export-1',
        correlationId: 'req-123',
        outcome: 'SUCCESS',
        actorUserId: 'user-1',
      }),
    );

    const payload = businessAudit.enqueue.mock.calls[0][0];
    const violations = scanBusinessAuditPayloadForSecrets({
      metadata: payload.metadata,
      description: payload.description,
    });
    expect(violations).toEqual([]);
    expect(payload.metadata).toMatchObject({
      evaluationsAudit: expect.objectContaining({
        outcome: 'SUCCESS',
        targetType: EVALUATIONS_AUDIT_ENTITY_TYPE.EXPORT,
      }),
      stationId: 'station-1',
      activeInsightCount: 4,
      format: 'json',
    });
    expect(JSON.stringify(payload)).not.toContain('customerName');
  });

  it('records failed export with FAILED outcome', async () => {
    await service.recordFinanceExport('org-a', {
      actorUserId: 'user-1',
      correlationId: 'req-456',
    }, {
      exportId: 'export-2',
      outcome: 'FAILED',
      reason: 'Station not found',
    });

    expect(businessAudit.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'FAILED',
        changeReason: 'Station not found',
      }),
    );
  });

  it('records PII label access with counts but no raw identifiers', async () => {
    await service.recordPiiDataAccess('org-a', {
      actorUserId: 'user-2',
      correlationId: 'req-789',
    }, {
      entityId: 'evaluation-labels:org-a',
      tier: 'full',
      requestedCount: 3,
      returnedCount: 2,
    });

    const payload = businessAudit.enqueue.mock.calls[0][0];
    expect(payload.action).toBe(EvaluationsAuditAction.PII_DATA_ACCESSED);
    expect(payload.metadata).toMatchObject({
      tier: 'full',
      requestedCount: 3,
      returnedCount: 2,
    });
    expect(JSON.stringify(payload)).not.toMatch(/@/);
  });

  it('maps model activation to MODEL_ACTIVATED action', async () => {
    await service.recordModelStatusChange('org-a', {
      actorUserId: 'admin-1',
      correlationId: 'req-approve',
    }, {
      entityId: 'DEMAND:7',
      modelKey: 'DEMAND',
      modelVersion: 'v1',
      horizonDays: 7,
      previousStatus: 'SHADOW',
      nextStatus: 'APPROVED',
    });

    expect(businessAudit.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        action: EvaluationsAuditAction.MODEL_ACTIVATED,
        entityType: EVALUATIONS_AUDIT_ENTITY_TYPE.MODEL_REGISTRY,
      }),
    );
  });

  it('processes outbox after enqueue', async () => {
    await service.record({
      organizationId: 'org-a',
      actor: { actorUserId: 'user-1', correlationId: 'corr-1' },
      action: EvaluationsAuditAction.DATA_QUALITY_ACTION,
      entityType: EVALUATIONS_AUDIT_ENTITY_TYPE.ADMIN_DIAGNOSTICS,
      entityId: 'diag-1',
      outcome: 'SUCCESS',
      description: 'Diagnostics read',
    });

    expect(businessAudit.processOutboxIds).toHaveBeenCalledWith(['outbox-1']);
  });
});
