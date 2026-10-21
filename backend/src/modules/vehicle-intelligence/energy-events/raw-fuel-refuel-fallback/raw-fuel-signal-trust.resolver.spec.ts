import { randomUUID } from 'crypto';
import { FuelType } from '@prisma/client';
import {
  RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV,
  RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV,
} from './raw-fuel-hybrid-trust-activation.authority';
import {
  buildEventBDualChannelCorroboratedSamples,
} from './testing/hybrid-trust-event-b-samples.fixture';
import { buildBaselineRecencyEvidenceMeta } from '../raw-fuel-rise-detector/raw-fuel-pre-plateau-baseline-recency.policy';
import {
  ABSOLUTE_SIGNAL_TRUST_AUTHORITY_AVAILABLE,
  buildRawFuelSignalTrustObservationContext,
  resolveRawFuelSignalTrust,
} from './raw-fuel-signal-trust.resolver';

describe('RawFuelSignalTrustResolver', () => {
  it('absolute trust authority is not yet available', () => {
    expect(ABSOLUTE_SIGNAL_TRUST_AUTHORITY_AVAILABLE).toBe(false);
  });

  it('defaults absoluteSignalTrust to UNKNOWN', () => {
    expect(resolveRawFuelSignalTrust().absoluteSignalTrust).toBe('UNKNOWN');
  });

  it('does not derive TRUSTED from fuelType alone', () => {
    for (const fuelType of Object.values(FuelType)) {
      expect(
        resolveRawFuelSignalTrust({ fuelType, samplePresenceOnly: true }).absoluteSignalTrust,
      ).toBe('UNKNOWN');
    }
  });

  it('does not derive promotion TRUSTED from absolute sample presence alone', () => {
    const result = resolveRawFuelSignalTrust({
      samples: [{ timestamp: new Date('2026-09-13T08:00:00.000Z'), absoluteLiters: 42.5 }],
      scanWindowStart: new Date('2026-09-13T07:00:00.000Z'),
      scanWindowEnd: new Date('2026-09-13T09:00:00.000Z'),
    });
    expect(result.absoluteSignalTrust).toBe('UNKNOWN');
    expect(result.absoluteDetectionAdmissibility).toBe('ADMISSIBLE');
  });

  it('relative availability is separate and requires semantically valid relative samples', () => {
    const windowStart = new Date('2026-09-13T07:00:00.000Z');
    const windowEnd = new Date('2026-09-13T09:00:00.000Z');

    expect(
      resolveRawFuelSignalTrust({
        samples: [{ timestamp: new Date('2026-09-13T08:00:00.000Z'), relativePercent: 55 }],
        scanWindowStart: windowStart,
        scanWindowEnd: windowEnd,
      }).relativeSignalAvailable,
    ).toBe(true);

    expect(
      resolveRawFuelSignalTrust({
        samples: [{ timestamp: new Date('2026-09-13T08:00:00.000Z'), relativePercent: 150 }],
        scanWindowStart: windowStart,
        scanWindowEnd: windowEnd,
      }).relativeSignalAvailable,
    ).toBe(false);
  });

  it('relative availability does not imply absolute TRUSTED', () => {
    const result = resolveRawFuelSignalTrust({
      samples: [{ timestamp: new Date('2026-09-13T08:00:00.000Z'), relativePercent: 40 }],
      scanWindowStart: new Date('2026-09-13T07:00:00.000Z'),
      scanWindowEnd: new Date('2026-09-13T09:00:00.000Z'),
    });
    expect(result.relativeSignalAvailable).toBe(true);
    expect(result.absoluteSignalTrust).toBe('UNKNOWN');
    expect(result.absoluteDetectionAdmissibility).toBe('UNKNOWN');
  });

  it('ALPHA_ALLOWLIST + allowed org passes effective TRUSTED when hybrid corroborates', () => {
    const orgId = randomUUID();
    const prevMode = process.env[RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV];
    const prevOrgs = process.env[RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV];
    process.env[RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV] = 'ALPHA_ALLOWLIST';
    process.env[RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV] = orgId;
    const riseOnset = new Date('2026-09-27T21:34:16.923Z');
    const riseEnd = new Date('2026-09-27T21:36:46.923Z');
    const observation = buildRawFuelSignalTrustObservationContext({
      evidenceMeta: {
        baselineRecency: buildBaselineRecencyEvidenceMeta({
          classification: 'FRESH',
          reason: 'test',
          bridgeGapSeconds: 120,
          prePlateauStartAt: new Date('2026-09-27T21:30:00.000Z'),
          prePlateauEndAt: new Date('2026-09-27T21:34:00.000Z'),
          riseOnsetAt: riseOnset,
          interveningPrimarySampleCount: 0,
          interveningContradictionCount: 0,
        }),
      },
      riseOnsetAt: riseOnset,
      riseEndAt: riseEnd,
      preFuelAbsoluteLiters: 4,
      postFuelAbsoluteLiters: 13,
    });
    const resolved = resolveRawFuelSignalTrust({
      samples: buildEventBDualChannelCorroboratedSamples(),
      scanWindowStart: new Date('2026-09-27T21:17:16.923Z'),
      scanWindowEnd: new Date('2026-09-27T22:02:16.923Z'),
      organizationId: orgId,
      vehicleId: randomUUID(),
      observation,
    });
    expect(resolved.hybridTrustProvenance.classification).toBe('TRUSTED');
    expect(resolved.hybridTrustActivation.activationAuthorized).toBe(true);
    expect(resolved.absoluteSignalTrust).toBe('TRUSTED');
    expect(resolved.hybridTrustActivation.effectiveAbsoluteSignalTrust).toBe('TRUSTED');
    if (prevMode === undefined) delete process.env[RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV];
    else process.env[RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV] = prevMode;
    if (prevOrgs === undefined) delete process.env[RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV];
    else process.env[RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV] = prevOrgs;
  });

  it('negative absolute liters are INADMISSIBLE not ADMISSIBLE', () => {
    const result = resolveRawFuelSignalTrust({
      samples: [{ timestamp: new Date('2026-09-13T08:00:00.000Z'), absoluteLiters: -1 }],
      scanWindowStart: new Date('2026-09-13T07:00:00.000Z'),
      scanWindowEnd: new Date('2026-09-13T09:00:00.000Z'),
    });
    expect(result.absoluteDetectionAdmissibility).toBe('INADMISSIBLE');
    expect(['UNKNOWN', 'UNTRUSTED']).toContain(result.absoluteSignalTrust);
  });
});
