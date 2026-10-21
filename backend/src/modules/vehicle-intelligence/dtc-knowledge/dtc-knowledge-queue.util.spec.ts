import {
  buildDtcGenericEnrichmentJobId,
  buildDtcVehicleEnrichmentJobId,
} from './dtc-knowledge-queue.util';
import { isBullMqCompatibleJobId } from '@shared/queue/bullmq-job-id.sanitizer';

describe('dtc-knowledge-queue.util', () => {
  it('generic enrichment job ids are colon-free', () => {
    const jobId = buildDtcGenericEnrichmentJobId('P0675', 'de');
    expect(jobId).not.toContain(':');
    expect(isBullMqCompatibleJobId(jobId)).toBe(true);
  });

  it('vehicle enrichment job ids are colon-free and distinct', () => {
    const base = {
      normalizedCode: 'P0675',
      make: 'BMW',
      model: '320d',
      year: 2019,
      fuelType: 'DIESEL',
      language: 'de',
    };
    const jobId = buildDtcVehicleEnrichmentJobId(base);
    expect(jobId).not.toContain(':');
    expect(isBullMqCompatibleJobId(jobId)).toBe(true);
    expect(buildDtcVehicleEnrichmentJobId({ ...base, make: 'Audi' })).not.toBe(jobId);
  });
});
