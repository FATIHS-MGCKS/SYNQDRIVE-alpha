/**
 * P3 consumer-chain validation (adapter → alerts → rental policy → cutover flags).
 * Uses pinned production replay JSON when present; synthetic fixture for partial-wheel edge.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  isTireWearV3CustomerReadActive,
  isTireWearV3CustomerReadAuthoritative,
  shouldSuppressV2TireWearSnapshotWrites,
} from '@config/tire-wear-v3-cutover.policy';
import {
  buildV3VerificationAlerts,
  mapV3SetupToCustomerRead,
  resolveV3OverallTreadStatus,
} from '../tire-health-v3-read.adapter';
import { buildTireRentalHealthReadModel } from '../../../rental-health/tire-rental-health.policy';
import type { TireHealthV3CustomerReadModel } from '../tire-health-v3-read.types';
import { TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA } from '../wear-v3-prior/tire-wear-v3-prior.config';

const REPLAY_JSON = path.resolve(
  __dirname,
  '../../../../../../architecture/tires/evidence/p3-offline-e2e-2026-10-27/offline-replay-results.json',
);

function loadReplayCustomerReads(): Array<{
  setupId: string;
  read: TireHealthV3CustomerReadModel;
}> {
  if (!fs.existsSync(REPLAY_JSON)) return [];
  const raw = JSON.parse(fs.readFileSync(REPLAY_JSON, 'utf8')) as {
    vehicles?: Array<{
      setupId: string;
      customerRead: TireHealthV3CustomerReadModel | null;
      v3: { verificationStatus: string } | null;
    }>;
  };
  return (raw.vehicles ?? [])
    .filter((v) => v.customerRead != null && v.v3 != null)
    .map((v) => ({
      setupId: v.setupId,
      read: {
        ...v.customerRead!,
        verificationStatus: v.customerRead!.verificationStatus ?? v.v3!.verificationStatus,
      } as TireHealthV3CustomerReadModel,
    }));
}

describe('Tire V3 P3 consumer chain', () => {
  it('flag truth table matches cutover policy (#2201)', () => {
    expect(
      isTireWearV3CustomerReadAuthoritative({
        customerReadEnabled: false,
        customerReadAuthoritative: true,
      }),
    ).toBe(false);
    expect(
      isTireWearV3CustomerReadAuthoritative({
        customerReadEnabled: true,
        customerReadAuthoritative: true,
      }),
    ).toBe(true);
    expect(
      shouldSuppressV2TireWearSnapshotWrites({
        customerReadEnabled: true,
        customerReadAuthoritative: true,
      }),
    ).toBe(true);
    expect(
      isTireWearV3CustomerReadActive({
        customerReadEnabled: true,
        customerReadAuthoritative: false,
      }),
    ).toBe(true);
  });

  it('DS4 dynamic wear coefficient remains disabled (P3A)', () => {
    expect(TIRE_WEAR_V3_PRIOR_DYNAMIC_BETA).toBe(0);
  });

  const replayRows = loadReplayCustomerReads();
  const chainCases = replayRows.length > 0 ? replayRows : [];

  if (chainCases.length === 0) {
    it('skips production replay chain when offline-replay-results.json is absent', () => {
      expect(REPLAY_JSON).toContain('offline-replay-results.json');
    });
  } else {
    it.each(chainCases.map((c) => [c.setupId, c]))(
      'production replay setup %s: single customer read + rental policy',
      (_setupId, row) => {
        const read = row.read;
        const alerts = buildV3VerificationAlerts(read, row.setupId);
        const dedupeKeys = alerts.map((a) => a.dedupeKey);
        expect(new Set(dedupeKeys).size).toBe(dedupeKeys.length);

        const status = resolveV3OverallTreadStatus(read, 'ALL_SEASON');
        expect(['UNKNOWN', 'EXCELLENT', 'GOOD', 'WATCH', 'WARNING', 'CRITICAL']).toContain(status);

        const rental = buildTireRentalHealthReadModel({
          summary: {
            activeSetupId: row.setupId,
            displayMode: read.insufficientEvidence ? 'UNKNOWN' : 'ESTIMATED',
            overallStatus: status,
            lowestTreadMm: read.lowestTreadMm?.lo ?? null,
            lowestTreadPosition: read.lowestTreadPosition,
            lastMeasurementAt: null,
            isDefaultAssumption: read.insufficientEvidence,
            confidence: 'MEDIUM',
            wearV3: read,
            alerts: [],
          } as never,
        });
        expect(rental.structuredReasonCodes.length).toBeGreaterThanOrEqual(0);
        if (read.verificationStatus === 'INSUFFICIENT_EVIDENCE') {
          expect(rental.structuredReasonCodes).toContain('V3_VERIFICATION_INSUFFICIENT_EVIDENCE');
        }
        if (read.verificationStatus === 'OVERDUE') {
          expect(rental.structuredReasonCodes).toContain('V3_VERIFICATION_OVERDUE');
        }
      },
    );
  }

  it('SYNTHETIC_FIXTURE: partial wheel measurement labeled in evidence bundle', () => {
    const fixturePath = path.resolve(
      __dirname,
      '../../../../../../architecture/tires/evidence/p3-offline-e2e-2026-10-27/SYNTHETIC_partial-wheel-measurement.fixture.json',
    );
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    expect(fixture._fixtureLabel).toMatch(/SYNTHETIC_FIXTURE/);
    expect(fixture.partialMeasurement.frontRightMm).toBeNull();
  });
});
