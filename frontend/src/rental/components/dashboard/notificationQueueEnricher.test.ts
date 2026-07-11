import { describe, expect, it } from 'vitest';
import {
  buildNotificationQueueModel,
  createNotificationTranslator,
  enrichNotificationQueueItem,
} from './notificationQueueEnricher';
import { buildQueueWithNotifications } from './notificationEngine.test-utils';
import {
  baseQueueInput,
  drivingAssessmentInsight,
  NOTIFICATION_TEST_NOW_MS,
  wobComplaintsHealthAlert,
  WOB_PLATE,
  WOB_VEHICLE_ID,
} from './notificationEngine.fixtures';

describe('notificationQueueEnricher', () => {
  const t = createNotificationTranslator('de');

  it('maps recovering driving assessment to success + resolved lifecycle', () => {
    const [row] = buildQueueWithNotifications(
      baseQueueInput({ insights: [drivingAssessmentInsight('RECOVERING')] }),
    );
    expect(row.queue?.severity).toBe('success');
    expect(row.queue?.lifecycleStatus).toBe('resolved');
    expect(row.queue?.readStatus).toBe('read');
    expect(row.queue?.domain).toBe('driving-analysis');
    expect(row.title).toContain('normalisiert');
    expect(row.title).not.toMatch(/warning|Warnung/i);
  });

  it('degraded driving assessment stays warning + open', () => {
    const [row] = buildQueueWithNotifications(
      baseQueueInput({ insights: [drivingAssessmentInsight('DEGRADED')] }),
    );
    expect(row.queue?.severity).toBe('warning');
    expect(row.queue?.lifecycleStatus).toBe('open');
    expect(row.queue?.readStatus).toBe('unread');
  });

  it('unread readStatus does not elevate severity', () => {
    const [row] = buildQueueWithNotifications(
      baseQueueInput({ insights: [drivingAssessmentInsight('DEGRADED')] }),
    );
    expect(row.queue?.readStatus).toBe('unread');
    expect(row.queue?.severity).toBe('warning');
  });

  it('localizes technical observation title in German', () => {
    const [row] = buildQueueWithNotifications(
      baseQueueInput({ vehicleHealthAlerts: [wobComplaintsHealthAlert()] }),
    );
    expect(row.title).toContain('Technische Beobachtung');
    expect(row.title).toContain(WOB_PLATE);
    expect(row.title).not.toContain('Station Shortage');
  });

  it('sort order stable when referenceNowMs is fixed', () => {
    const input = baseQueueInput({
      insights: [drivingAssessmentInsight('DEGRADED')],
      vehicleHealthAlerts: [wobComplaintsHealthAlert()],
      referenceNowMs: NOTIFICATION_TEST_NOW_MS,
    });
    const run1 = buildQueueWithNotifications(input).map((i) => i.id);
    const run2 = buildQueueWithNotifications(input).map((i) => i.id);
    expect(run1).toEqual(run2);
  });

  it('buildNotificationQueueModel sets structured timestamps', () => {
    const [raw] = buildQueueWithNotifications(
      baseQueueInput({
        insights: [
          drivingAssessmentInsight('DEGRADED', {
            metrics: { vehicleStatus: 'DEGRADED', degradedSince: '2026-07-08T08:00:00.000Z' },
          }),
        ],
      }),
    );
    const model = buildNotificationQueueModel(raw);
    expect(model.occurredAt).toBe('2026-07-08T08:00:00.000Z');
    expect(model.entityType).toBe('vehicle');
    expect(model.entityId).toBe(WOB_VEHICLE_ID);
    expect(model.semanticKey).toBeTruthy();
  });

  it('enrichNotificationQueueItem wires CTA from resolver', () => {
    const [raw] = buildQueueWithNotifications(
      baseQueueInput({ vehicleHealthAlerts: [wobComplaintsHealthAlert()] }),
    );
    const enriched = enrichNotificationQueueItem(raw, {
      locale: 'de',
      referenceNowMs: NOTIFICATION_TEST_NOW_MS,
      t,
    });
    expect(enriched.cta).toBe('open-vehicle');
    expect(enriched.queue.actionTarget.module).toBe('complaints');
  });
});
