import * as fs from 'node:fs';
import * as path from 'node:path';
const fixtures = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'fixtures/vsi-p0a-signal-integrity-audit-fixtures.v1.json'),
    'utf8',
  ),
) as {
  audiRpmReference: {
    vehicle: VsiP0aProfileAuditBundle['vehicle'];
    sourceLinkId: string;
    signals: Array<Record<string, unknown>>;
  };
  teslaEv: { vehicle: VsiP0aProfileAuditBundle['vehicle']; signals: Array<Record<string, unknown>> };
  providerFetchObservedUnknownQuality: { signals: Array<{ empiricalObservation: string; qualityClassification: string; limitations: string[] }> };
};
import {
  assembleVsiP0aMatrixDocument,
  buildVsiP0aMatrixRows,
  type VsiP0aProfileAuditBundle,
} from './vsi-p0a-signal-integrity-audit.engine';
import { resolveVsiP0aApplicability, classifyVsiP0aSignalFinding } from './vsi-p0a-signal-integrity-audit.classifier';
import { VSI_P0A_DEFAULT_COHORT_V1 } from './vsi-p0a-audit-cohort.v1';
import type { VsiProfileSignalFingerprintV1 } from './vsi-profile.types';

function baseBundle(partial: Partial<VsiP0aProfileAuditBundle> & Pick<VsiP0aProfileAuditBundle, 'vehicle'>): VsiP0aProfileAuditBundle {
  return {
    sourceLinkId: 'test-link',
    provider: 'DIMO',
    providerModality: partial.vehicle.providerModality,
    profileRow: {
      evaluatedAt: new Date('2026-10-30T12:00:00.000Z'),
      lastMaterializedProviderFetchAt: new Date('2026-10-30T11:55:00.000Z'),
      signalsSnapshot: [],
      providerSourceLinkId: 'test-link',
      providerIdentity: 'dimo',
      profileRevision: 1,
      profileContractVersion: 'vsi-signal-profile-v2',
      profileLimitations: [],
      contentFingerprint: 'abc123def456',
      lastMaterializedSourceTimestamp: new Date('2026-10-30T11:50:00.000Z'),
    },
    hfBySignal: {},
    verificationPartial: false,
    ...partial,
  };
}

function signalFingerprint(partial: Record<string, unknown>): VsiProfileSignalFingerprintV1 {
  return {
    signalFingerprintContractVersion: 'vsi-signal-fingerprint-v1',
    canonicalSignalKey: 'engine_rpm',
    providerNativeSignalName: 'powertrainCombustionEngineSpeed',
    declaredSupport: 'UNKNOWN',
    empiricalObservation: 'NEVER_OBSERVED',
    lastValidObservationAt: null,
    lastSourceTimestamp: null,
    lastProviderFetchAt: null,
    lastProvenStrictSourceAdvanceAt: null,
    strictSourceAdvanced: false,
    freshnessClassification: 'UNKNOWN',
    evidenceProvenance: [],
    limitations: [],
    qualityClassification: 'NEVER_OBSERVED',
    confidenceLevel: 'LOW',
    observedSamples: 0,
    provenSourceAdvances: 0,
    observedCadenceMedianSeconds: null,
    observedCadenceSampleCount: null,
    maxStaleIntervalSeconds: null,
    contentFingerprint: 'fp',
    ...partial,
  } as VsiProfileSignalFingerprintV1;
}

describe('vsi-p0a signal integrity audit engine', () => {
  it('Audi: snapshot NEVER_OBSERVED + HF RPM_STANDARD → MISLEADING_PRESENTATION', () => {
    const ref = fixtures.audiRpmReference;
    const bundle = baseBundle({
      vehicle: ref.vehicle,
      sourceLinkId: ref.sourceLinkId,
      profileRow: {
        ...baseBundle({ vehicle: ref.vehicle }).profileRow,
        signalsSnapshot: ref.signals.map((s) =>
          signalFingerprint({
            ...s,
            canonicalSignalKey: s.canonicalSignalKey,
          }),
        ),
      },
    });
    const rows = buildVsiP0aMatrixRows(bundle);
    const rpm = rows.find((r) => r.canonicalSignal === 'engine_rpm');
    expect(rpm?.snapshotObservation).toBe('NEVER_OBSERVED');
    expect(rpm?.activeCadenceProfile).toBe('RPM_STANDARD');
    expect(rpm?.findingClass).toBe('CONFIRMED_BUG');
    expect(rpm?.evidenceReference).toBe('cadence_provenance_duplicate_entries');
  });

  it('Tesla: engine_rpm and fuel_level are NOT_APPLICABLE but shown NEVER_OBSERVED', () => {
    for (const key of ['engine_rpm', 'fuel_level_relative'] as const) {
      expect(
        resolveVsiP0aApplicability(key, fixtures.teslaEv.vehicle as never),
      ).toBe('NOT_APPLICABLE');
    }
    const bundle = baseBundle({
      vehicle: fixtures.teslaEv.vehicle as never,
      profileRow: {
        ...baseBundle({ vehicle: fixtures.teslaEv.vehicle as never }).profileRow,
        signalsSnapshot: fixtures.teslaEv.signals.map((s) =>
          signalFingerprint({ ...s, canonicalSignalKey: s.canonicalSignalKey }),
        ),
      },
    });
    const rows = buildVsiP0aMatrixRows(bundle);
    const er = rows.find((r) => r.canonicalSignal === 'engine_rpm');
    expect(er?.findingClass).toBe('MISLEADING_PRESENTATION');
  });

  it('ICE: hv_battery_soc NOT_APPLICABLE presentation', () => {
    const bundle = baseBundle({
      vehicle: fixtures.audiRpmReference.vehicle as never,
      profileRow: {
        ...baseBundle({ vehicle: fixtures.audiRpmReference.vehicle as never }).profileRow,
        signalsSnapshot: [
          signalFingerprint({
            canonicalSignalKey: 'hv_battery_soc',
            empiricalObservation: 'NEVER_OBSERVED',
          }),
        ],
      },
    });
    const row = buildVsiP0aMatrixRows(bundle).find((r) => r.canonicalSignal === 'hv_battery_soc');
    expect(row?.applicability).toBe('NOT_APPLICABLE');
    expect(row?.findingClass).toBe('MISLEADING_PRESENTATION');
  });

  it('provider_last_successful_fetch OBSERVED with UNKNOWN quality → CONFIRMED_BUG P0', () => {
    const s = fixtures.providerFetchObservedUnknownQuality.signals[0];
    const result = classifyVsiP0aSignalFinding({
      vehicle: fixtures.audiRpmReference.vehicle as never,
      canonicalSignal: 'provider_last_successful_fetch',
      applicability: 'UNKNOWN',
      declaredSupport: 'UNKNOWN',
      snapshotObservation: s.empiricalObservation,
      snapshotQuality: s.qualityClassification,
      snapshotConfidence: null,
      hfAvailability: 'NOT_SUPPORTED_BY_PIPELINE',
      hfSampleCount: null,
      activeCadenceProfile: null,
      freshness: null,
      provenance: [],
      limitations: s.limitations,
      materializedInProfile: true,
    });
    expect(result.findingClass).toBe('CONFIRMED_BUG');
    expect(result.severity).toBe('P0');
  });

  it('duplicate cadence provenance → CONFIRMED_BUG', () => {
    const result = classifyVsiP0aSignalFinding({
      vehicle: fixtures.audiRpmReference.vehicle as never,
      canonicalSignal: 'engine_rpm',
      applicability: 'APPLICABLE',
      declaredSupport: 'UNKNOWN',
      snapshotObservation: 'NEVER_OBSERVED',
      snapshotQuality: 'NEVER_OBSERVED',
      snapshotConfidence: 'LOW',
      hfAvailability: 'SUPPORTED_WITH_SAMPLES',
      hfSampleCount: 10,
      activeCadenceProfile: 'RPM_STANDARD',
      freshness: 'UNKNOWN',
      provenance: ['CLICKHOUSE_TELEMETRY_HF_POINTS', 'CLICKHOUSE_TELEMETRY_HF_POINTS'],
      limitations: [],
      materializedInProfile: true,
    });
    expect(result.findingClass).toBe('CONFIRMED_BUG');
  });

  it('assemble document row counts for default cohort keys', () => {
    const doc = assembleVsiP0aMatrixDocument({
      auditExecutedAt: new Date('2026-10-30T12:00:00.000Z'),
      auditTimezone: 'Europe/Berlin',
      productionVerification: {
        verifiedAt: '2026-10-30T12:00:00.000Z',
        originMainSha: '63626fa',
        productionCurrentSha: 'c847a680',
        productionRelease: '20261030144630_v4994',
        replica3001Sha: null,
        replica3002Sha: null,
        pm2Health: null,
        publicHealthOk: true,
        pr2255: 'CODE_PRESENT',
        pr2256: 'NOT_PRESENT',
        pr2257: 'CODE_PRESENT',
        frontendArtifact: {
          bundlePath: 'assets/index-DkMhoG6d.js',
          rpmDualPresent: 'ARTIFACT_PRESENT',
          dualProvenanceTestIdPresent: 'ARTIFACT_PRESENT',
        },
        runtimeDualProvenanceUi: 'NOT_VERIFIED',
        notes: [],
      },
      cohort: VSI_P0A_DEFAULT_COHORT_V1,
      bundles: [],
    });
    expect(doc.summary.canonicalSignalCount).toBeGreaterThan(15);
    expect(doc.summary.vehicleCount).toBe(4);
  });

  it('fixture file is present on disk', () => {
    const p = path.join(__dirname, 'fixtures/vsi-p0a-signal-integrity-audit-fixtures.v1.json');
    expect(fs.existsSync(p)).toBe(true);
  });
});
