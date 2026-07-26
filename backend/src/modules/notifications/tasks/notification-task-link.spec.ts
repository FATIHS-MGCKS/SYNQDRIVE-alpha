import { WorkflowExecutionMode } from '@modules/workflows/workflow-execution-mode';
import type { ActionExecutionContext } from '@modules/workflows/workflow-action-executor.service';
import {
  buildNotificationTaskLink,
  extractNotificationTaskLink,
  mergeNotificationTaskMetadata,
  toNotificationTaskUpsertFields,
} from './notification-task-materializer';
import { buildNotificationActionIdempotencyKey } from '@modules/workflows/workflow-notification-idempotency.util';

const ORG = 'org-a';
const NOTIF = 'notif-1';
const RUN = 'run-1';
const ACTION_KEY = buildNotificationActionIdempotencyKey({
  organizationId: ORG,
  workflowId: 'wf-1',
  notificationId: NOTIF,
  notificationGeneration: 1,
  actionDefinitionId: 'task.create:0',
});

function makeCtx(): ActionExecutionContext {
  return {
    organizationId: ORG,
    workflowId: 'wf-1',
    workflowRunId: RUN,
    actionRunId: 'ar-1',
    actionIndex: 0,
    actionDefinitionId: 'task.create:0',
    eventType: 'notification.opened',
    entityType: 'vehicle',
    entityId: 'veh-1',
    payload: {
      notificationId: NOTIF,
      lifecycleGeneration: 1,
      fingerprint: 'fp-1',
    },
    idempotencyKey: 'notification-run:org-a:wf-1:notification.opened:notif-1:gen:1',
    actionIdempotencyKey: ACTION_KEY,
    notificationContext: {
      notificationId: NOTIF,
      notificationFingerprint: 'fp-1',
      notificationGeneration: 1,
      triggerEventId: 'notification.opened:notif-1:gen:1',
      correlationId: 'corr-1',
      causationId: null,
    },
    executionMode: WorkflowExecutionMode.LIVE,
  };
}

describe('notification-task-materializer', () => {
  it('builds canonical task link from workflow action context', () => {
    const link = buildNotificationTaskLink(makeCtx(), ACTION_KEY);
    expect(link).toEqual({
      organizationId: ORG,
      notificationId: NOTIF,
      workflowRunId: RUN,
      sourceEventType: 'notification.opened',
      idempotencyKey: ACTION_KEY,
      workflowId: 'wf-1',
      actionDefinitionId: 'task.create:0',
      notificationGeneration: 1,
      notificationFingerprint: 'fp-1',
    });
  });

  it('maps link to org task upsert columns', () => {
    const link = buildNotificationTaskLink(makeCtx(), ACTION_KEY)!;
    expect(toNotificationTaskUpsertFields(link)).toEqual({
      notificationId: NOTIF,
      workflowRunId: RUN,
      sourceEventType: 'notification.opened',
      dedupKey: ACTION_KEY,
    });
  });

  it('round-trips link through task metadata', () => {
    const link = buildNotificationTaskLink(makeCtx(), ACTION_KEY)!;
    const metadata = mergeNotificationTaskMetadata(link, { extra: true });
    expect(extractNotificationTaskLink(metadata)).toEqual(link);
  });

  it('returns null link without notification context', () => {
    const ctx = makeCtx();
    ctx.notificationContext = undefined;
    ctx.payload = {};
    expect(buildNotificationTaskLink(ctx, ACTION_KEY)).toBeNull();
  });
});

describe('notification task deduplication contract', () => {
  it('uses same idempotency key for duplicate workflow action', () => {
    const a = buildNotificationTaskLink(makeCtx(), ACTION_KEY);
    const b = buildNotificationTaskLink(makeCtx(), ACTION_KEY);
    expect(a?.idempotencyKey).toBe(b?.idempotencyKey);
  });

  it('uses different idempotency key for new notification generation', () => {
    const ctxGen1 = makeCtx();
    const ctxGen2 = makeCtx();
    const keyGen2 = buildNotificationActionIdempotencyKey({
      organizationId: ORG,
      workflowId: 'wf-1',
      notificationId: NOTIF,
      notificationGeneration: 2,
      actionDefinitionId: 'task.create:0',
    });
    ctxGen2.notificationContext!.notificationGeneration = 2;
    const link1 = buildNotificationTaskLink(ctxGen1, ACTION_KEY);
    const link2 = buildNotificationTaskLink(ctxGen2, keyGen2);
    expect(link1?.idempotencyKey).not.toBe(link2?.idempotencyKey);
  });
});
