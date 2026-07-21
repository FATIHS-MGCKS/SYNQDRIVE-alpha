import { createHash } from 'crypto';
import {
  BULLMQ_JOB_ID_DEFAULT_MAX_LENGTH,
  fingerprintBullMqJobIdKey,
  formatBullMqJobIdLogContext,
  isBullMqCompatibleJobId,
  sanitizeBullMqJobId,
} from './bullmq-job-id.sanitizer';

/** Mirrors BullMQ `Job.validateOptions` custom-id colon rule — no Redis / no queue. */
function assertBullMqAcceptsCustomJobId(jobId: string): void {
  if (`${parseInt(jobId, 10)}` === jobId) {
    throw new Error('Custom Id cannot be integers');
  }
  if (jobId.includes(':') && jobId.split(':').length !== 3) {
    throw new Error('Custom Id cannot contain :');
  }
}

const VEH = 'clveh1234567890123456789012';
const UUID = '00000000-0000-4000-8000-000000000001';
const REST_WINDOW_ID = `lv-rest:${VEH}:1721124000000`;
const COMPOSITE_KEY = `battery-rest:${VEH}:${REST_WINDOW_ID}:60m`;

describe('bullmq-job-id.sanitizer', () => {
  describe('sanitizeBullMqJobId', () => {
    it('encodes colon-separated composite ids without colons', () => {
      const jobId = sanitizeBullMqJobId({
        namespace: 'battery-v2',
        key: COMPOSITE_KEY,
      });

      expect(jobId).not.toContain(':');
      expect(jobId.startsWith('battery-v2_')).toBe(true);
      expect(isBullMqCompatibleJobId(jobId)).toBe(true);
      expect(() => assertBullMqAcceptsCustomJobId(jobId)).not.toThrow();
    });

    it('preserves UUID-shaped keys when characters are already safe', () => {
      const jobId = sanitizeBullMqJobId({
        namespace: 'notification-evaluation',
        key: UUID,
      });

      expect(jobId).toBe(`notification-evaluation_${UUID}`);
      expect(jobId).not.toContain(':');
      expect(/\s/.test(jobId)).toBe(false);
    });

    it('encodes whitespace and special characters injectively', () => {
      const withSpaces = sanitizeBullMqJobId({
        namespace: 'extract',
        key: 'org id with spaces',
      });
      const withSpecial = sanitizeBullMqJobId({
        namespace: 'extract',
        key: 'org@id#with$chars',
      });

      expect(withSpaces).not.toMatch(/\s/);
      expect(withSpecial).not.toMatch(/[@#$]/);
      expect(withSpaces).not.toBe(withSpecial);
      expect(isBullMqCompatibleJobId(withSpaces)).toBe(true);
      expect(isBullMqCompatibleJobId(withSpecial)).toBe(true);
    });

    it('distinguishes keys that would collide under naive colon replacement', () => {
      const encodedColon = sanitizeBullMqJobId({ key: 'a:b' });
      const literalUnderscore = sanitizeBullMqJobId({ key: 'a_b' });

      expect(encodedColon).toBe('a_3ab');
      expect(literalUnderscore).toBe('a__b');
      expect(encodedColon).not.toBe(literalUnderscore);
    });

    it('hashes very long keys deterministically within maxLength', () => {
      const longKey = `battery-obs:${'x'.repeat(400)}`;
      const jobId = sanitizeBullMqJobId({
        namespace: 'battery-v2',
        key: longKey,
      });

      expect(jobId.length).toBeLessThanOrEqual(BULLMQ_JOB_ID_DEFAULT_MAX_LENGTH);
      expect(jobId).toBe(
        sanitizeBullMqJobId({ namespace: 'battery-v2', key: longKey }),
      );
      expect(jobId).toMatch(/^battery-v2_[a-f0-9]{40}$/);

      const expectedHash = createHash('sha256')
        .update(`battery-v2\x1f${longKey}`, 'utf8')
        .digest('hex')
        .slice(0, 40);
      expect(jobId).toBe(`battery-v2_${expectedHash}`);
    });

    it('returns the same output for the same input', () => {
      const input = { namespace: 'battery-v2', key: COMPOSITE_KEY };
      const first = sanitizeBullMqJobId(input);
      const second = sanitizeBullMqJobId(input);

      expect(first).toBe(second);
    });

    it('returns different outputs for different inputs', () => {
      const base = sanitizeBullMqJobId({
        namespace: 'battery-v2',
        key: COMPOSITE_KEY,
      });
      const otherVehicle = sanitizeBullMqJobId({
        namespace: 'battery-v2',
        key: COMPOSITE_KEY.replace(VEH, 'clveh999999999999999999999999'),
      });
      const otherNamespace = sanitizeBullMqJobId({
        namespace: 'task-automation',
        key: COMPOSITE_KEY,
      });

      expect(otherVehicle).not.toBe(base);
      expect(otherNamespace).not.toBe(base);
    });

    it('rejects empty keys', () => {
      expect(() => sanitizeBullMqJobId({ key: '' })).toThrow(/non-empty string/);
    });
  });

  describe('isBullMqCompatibleJobId', () => {
    it('rejects colons, whitespace, and pure integers', () => {
      expect(isBullMqCompatibleJobId('battery-v2:broken')).toBe(false);
      expect(isBullMqCompatibleJobId('job with space')).toBe(false);
      expect(isBullMqCompatibleJobId('12345')).toBe(false);
      expect(isBullMqCompatibleJobId('battery-v2_safe-id')).toBe(true);
    });
  });

  describe('safe logging helpers', () => {
    it('fingerprints keys without exposing raw values', () => {
      const fingerprint = fingerprintBullMqJobIdKey(COMPOSITE_KEY);

      expect(fingerprint).toHaveLength(12);
      expect(fingerprint).toMatch(/^[a-f0-9]+$/);
      expect(fingerprint).not.toContain(VEH);
      expect(fingerprint).not.toContain(':');
    });

    it('formats log context without the raw business key', () => {
      const jobId = sanitizeBullMqJobId({
        namespace: 'battery-v2',
        key: COMPOSITE_KEY,
      });
      const formatted = formatBullMqJobIdLogContext({
        namespace: 'battery-v2',
        key: COMPOSITE_KEY,
        jobId,
      });

      expect(formatted).toContain(`jobId=${jobId}`);
      expect(formatted).toContain('keyFp=');
      expect(formatted).toContain('ns=battery-v2');
      expect(formatted).not.toContain(COMPOSITE_KEY);
      expect(formatted).not.toMatch(/key=/);
    });
  });
});
