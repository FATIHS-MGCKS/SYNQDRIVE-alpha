import { buildBookingDocumentGenerationBullJobId } from '@modules/documents/booking-document-generation/booking-document-generation.contract';
import { buildDeviceConnectionWebhookJobId } from '@modules/dimo/device-connection-webhook-queue.producer';
import { buildExtractionJobId } from '@modules/document-extraction/document-extraction-queue.util';
import { buildDeliveryJobId } from '@modules/notifications/delivery/notification-delivery-queue.util';
import { buildNotificationEvaluationJobId } from '@modules/notifications/runtime/notification-evaluation-queue.util';
import { buildPaymentEmailJobId } from '@modules/payments/email/payment-email-queue.util';
import { buildTaskAutomationOutboxJobId } from '@modules/tasks/outbox/task-automation-outbox-queue.util';
import {
  buildVoiceWebhookJobId,
  buildVoiceWebhookReplayJobId,
} from '@modules/voice-webhook-ingestion/voice-webhook-queue.util';
import { buildBatteryV2JobId } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-job-queue.util';
import { buildBrakeRecalculationJobId } from '@modules/vehicle-intelligence/brakes/brake-recalculation-fingerprint';
import {
  buildDtcKnowledgeGenericJobId,
  buildDtcKnowledgeVehicleJobId,
} from '@modules/vehicle-intelligence/dtc-knowledge/dtc-knowledge-queue.util';
import { buildBullJobId } from '@modules/vehicle-intelligence/driving-intelligence-jobs/driving-intelligence-jobs.contract';
import { buildDtcPollJobId } from '@workers/processors/dtc-poll-queue.util';
import { sanitizeBullMqJobId, isBullMqCompatibleJobId } from './bullmq-job-id.sanitizer';

const ORG = '00000000-0000-4000-8000-000000000001';
const OUTBOX = 'outbox-abc-123';
const EVENT = 'voice-event-uuid-1';
const VEHICLE = 'clveh1234567890123456789012';

type ProducerCase = {
  label: string;
  build: () => string;
  /** When set, replay/normal variants must differ from the primary id. */
  replayBuild?: () => string;
};

const PRODUCERS: ProducerCase[] = [
  {
    label: 'connectivity-webhook',
    build: () => buildDeviceConnectionWebhookJobId('inbox-1'),
    replayBuild: () => buildDeviceConnectionWebhookJobId('inbox-1', true),
  },
  {
    label: 'voice-webhook',
    build: () => buildVoiceWebhookJobId(EVENT),
    replayBuild: () => buildVoiceWebhookReplayJobId(EVENT, 1_725_000_000_000),
  },
  {
    label: 'notification-evaluation',
    build: () => buildNotificationEvaluationJobId(ORG, 'debounced'),
  },
  {
    label: 'notification-delivery',
    build: () => buildDeliveryJobId(OUTBOX),
  },
  {
    label: 'payment-email',
    build: () => buildPaymentEmailJobId(OUTBOX),
  },
  {
    label: 'task-automation-outbox',
    build: () => buildTaskAutomationOutboxJobId(OUTBOX),
  },
  {
    label: 'brake-recalc',
    build: () => buildBrakeRecalculationJobId(VEHICLE),
    replayBuild: () => buildBrakeRecalculationJobId(VEHICLE, 42),
  },
  {
    label: 'dtc-poll',
    build: () => buildDtcPollJobId(VEHICLE, 12345),
  },
  {
    label: 'dtc-knowledge-generic',
    build: () => buildDtcKnowledgeGenericJobId('P0675', 'de'),
  },
  {
    label: 'dtc-knowledge-vehicle',
    build: () =>
      buildDtcKnowledgeVehicleJobId({
        normalizedCode: 'P0675',
        make: 'VW',
        model: 'Golf',
        year: 2020,
        fuelType: 'PETROL',
        language: 'de',
      }),
  },
  {
    label: 'document-extraction',
    build: () => buildExtractionJobId('extract-e1'),
  },
  {
    label: 'booking-document-generation',
    build: () => buildBookingDocumentGenerationBullJobId('job-persist-1'),
  },
  {
    label: 'driving-intelligence',
    build: () => buildBullJobId('di-job-1'),
  },
  {
    label: 'battery-v2',
    build: () => buildBatteryV2JobId(`obs:${VEHICLE}:REST_60M:123`),
  },
  {
    label: 'clickhouse-mirror (inline)',
    build: () =>
      sanitizeBullMqJobId({
        namespace: 'ch-mirror',
        key: `telemetry_snapshot-${VEHICLE}-1725000000`,
      }),
  },
  {
    label: 'tire-recalc (inline)',
    build: () =>
      sanitizeBullMqJobId({
        namespace: 'tire-recalc',
        key: `${VEHICLE}:42`,
      }),
  },
];

describe('BullMQ v5 producer job-id contract', () => {
  it.each(PRODUCERS)('$label emits colon-free compatible job ids', ({ build }) => {
    const jobId = build();
    expect(jobId).not.toContain(':');
    expect(isBullMqCompatibleJobId(jobId)).toBe(true);
  });

  it.each(
    PRODUCERS.filter((p) => p.replayBuild),
  )('$label keeps replay/bucket ids distinguishable from primary', ({ build, replayBuild }) => {
    expect(replayBuild!()).not.toBe(build());
    expect(replayBuild!()).not.toContain(':');
    expect(isBullMqCompatibleJobId(replayBuild!())).toBe(true);
  });

  it('preserves deterministic identity per producer input', () => {
    for (const producer of PRODUCERS) {
      expect(producer.build()).toBe(producer.build());
    }
  });

  it('distinguishes collision-prone logical keys under sanitization', () => {
    const colonKey = buildDtcKnowledgeGenericJobId('A:B', 'de');
    const underscoreKey = sanitizeBullMqJobId({
      namespace: 'dtc-knowledge',
      key: 'generic:A_B:de',
    });
    expect(colonKey).not.toBe(underscoreKey);
    expect(colonKey).not.toContain(':');
    expect(underscoreKey).not.toContain(':');
  });

  it('connectivity replay ids are colon-free and include replay namespace', () => {
    const replay = buildDeviceConnectionWebhookJobId('inbox-1', true);
    expect(replay).not.toContain(':');
    expect(replay.startsWith('connectivity-webhook-replay__')).toBe(true);
    expect(replay).not.toBe(buildDeviceConnectionWebhookJobId('inbox-1'));
  });
});
