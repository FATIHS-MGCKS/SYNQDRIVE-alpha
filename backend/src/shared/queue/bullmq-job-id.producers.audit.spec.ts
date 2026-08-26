/**
 * Repository contract: executable BullMQ custom jobId builders must be colon-free.
 *
 * Complements per-producer unit tests and `isBullMqCompatibleJobId` collision tests.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { buildBrakeRecalculationJobId } from '@modules/vehicle-intelligence/brakes/brake-recalculation-fingerprint';
import { buildBatteryV2JobId } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-job-queue.util';
import { buildBookingDocumentGenerationBullJobId } from '@modules/documents/booking-document-generation/booking-document-generation.contract';
import { buildExtractionJobId } from '@modules/document-extraction/document-extraction-queue.util';
import { DeviceConnectionWebhookQueueProducer } from '@modules/dimo/device-connection-webhook-queue.producer';
import {
  buildDtcGenericEnrichmentJobId,
  buildDtcVehicleEnrichmentJobId,
} from '@modules/vehicle-intelligence/dtc-knowledge/dtc-knowledge-queue.util';
import { buildDeliveryJobId } from '@modules/notifications/delivery/notification-delivery-queue.util';
import { buildNotificationEvaluationJobId } from '@modules/notifications/runtime/notification-evaluation-queue.util';
import { buildPaymentEmailJobId } from '@modules/payments/email/payment-email-queue.util';
import { buildTaskAutomationOutboxJobId } from '@modules/tasks/outbox/task-automation-outbox-queue.util';
import {
  buildVoiceWebhookJobId,
  buildVoiceWebhookReplayJobId,
} from '@modules/voice-webhook-ingestion/voice-webhook-queue.util';
import { buildDtcPollVehicleJobId } from '@workers/processors/dimo-dtc-queue.util';
import {
  isBullMqCompatibleJobId,
  sanitizeBullMqJobId,
} from './bullmq-job-id.sanitizer';

const SAMPLE_UUID = 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63';
const SAMPLE_ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';

const CANONICAL_BUILDERS: Array<{ name: string; build: () => string }> = [
  {
    name: 'connectivity-webhook',
    build: () => new DeviceConnectionWebhookQueueProducer({} as never).buildJobId('inbox-1'),
  },
  {
    name: 'connectivity-webhook-replay',
    build: () => new DeviceConnectionWebhookQueueProducer({} as never).buildJobId('inbox-1', true),
  },
  { name: 'payment-email', build: () => buildPaymentEmailJobId(SAMPLE_UUID) },
  {
    name: 'notification-evaluation-debounced',
    build: () => buildNotificationEvaluationJobId(SAMPLE_ORG, 'debounced'),
  },
  {
    name: 'notification-evaluation-scheduled',
    build: () => buildNotificationEvaluationJobId(SAMPLE_ORG, 'scheduled'),
  },
  { name: 'notification-delivery', build: () => buildDeliveryJobId(SAMPLE_UUID) },
  { name: 'task-automation-outbox', build: () => buildTaskAutomationOutboxJobId(SAMPLE_UUID) },
  { name: 'brake-recalc-burst', build: () => buildBrakeRecalculationJobId(SAMPLE_UUID) },
  {
    name: 'brake-recalc-scheduled',
    build: () => buildBrakeRecalculationJobId(SAMPLE_UUID, 99),
  },
  { name: 'dtc-poll-vehicle', build: () => buildDtcPollVehicleJobId(SAMPLE_UUID, 42) },
  { name: 'dtc-generic-enrichment', build: () => buildDtcGenericEnrichmentJobId('P0675', 'de') },
  {
    name: 'dtc-vehicle-enrichment',
    build: () =>
      buildDtcVehicleEnrichmentJobId({
        normalizedCode: 'P0675',
        make: 'BMW',
        model: '320d',
        year: 2019,
        fuelType: 'DIESEL',
        language: 'de',
      }),
  },
  { name: 'voice-webhook', build: () => buildVoiceWebhookJobId(SAMPLE_UUID) },
  {
    name: 'voice-webhook-replay',
    build: () => buildVoiceWebhookReplayJobId(SAMPLE_UUID, 1_726_200_000_000),
  },
  {
    name: 'battery-v2',
    build: () => buildBatteryV2JobId(`battery-obs:${SAMPLE_UUID}:60m`),
  },
  {
    name: 'booking-doc',
    build: () =>
      buildBookingDocumentGenerationBullJobId(
        `booking-doc:initial:${SAMPLE_ORG}:${SAMPLE_UUID}`,
      ),
  },
  { name: 'document-extraction', build: () => buildExtractionJobId(SAMPLE_UUID) },
];

function collectTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      collectTsFiles(full, acc);
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('bullmq-job-id.producers.audit', () => {
  describe('canonical builders', () => {
    it.each(CANONICAL_BUILDERS)('$name emits colon-free compatible job ids', ({ build }) => {
      const jobId = build();
      expect(jobId).not.toContain(':');
      expect(isBullMqCompatibleJobId(jobId)).toBe(true);
    });
  });

  describe('collision safety (sanitizer)', () => {
    it('does not collapse encoded colon vs literal underscore', () => {
      const encodedColon = sanitizeBullMqJobId({ key: 'a:b' });
      const literalUnderscore = sanitizeBullMqJobId({ key: 'a_b' });
      expect(encodedColon).not.toBe(literalUnderscore);
      expect(encodedColon).not.toContain(':');
      expect(literalUnderscore).not.toContain(':');
    });
  });

  describe('static source scan', () => {
    it('has no executable jobId template literals containing ":" in backend/src', () => {
      const srcRoot = join(__dirname, '..', '..');
      const offenders: string[] = [];
      const pattern = /jobId:\s*`[^`]*:[^`]*`/;

      for (const file of collectTsFiles(srcRoot)) {
        const content = readFileSync(file, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
          if (pattern.test(line)) {
            offenders.push(`${file}: ${trimmed}`);
          }
        }
      }

      expect(offenders).toEqual([]);
    });
  });
});
