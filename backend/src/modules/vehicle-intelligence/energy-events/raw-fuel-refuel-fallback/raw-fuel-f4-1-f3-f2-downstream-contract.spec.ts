import {
  buildEvidenceRevisionFingerprint,
  observationToEvidenceSlice,
} from '../raw-refuel-candidate/raw-refuel-candidate-evidence-fingerprint';
import {
  tryBuildCandidateIdentityKeyFromEvidence,
} from '../raw-refuel-candidate/raw-refuel-candidate-identity-key';
import { detectRawFuelRises } from '../raw-fuel-rise-detector/raw-fuel-rise-detector';
import {
  buildRuntimeDetectionContextFromTrust,
  linearRiseSamples,
  stablePlateauSamples,
} from '../raw-fuel-rise-detector/testing/raw-fuel-rise-detector-test.util';

describe('RFRF F4.1 — F3→F2 downstream contract (unit)', () => {
  const samples = [
    ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
    ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
    ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
  ];

  const trustInput = {
    samples,
    scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
    scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
  };

  const detection = detectRawFuelRises({
    context: buildRuntimeDetectionContextFromTrust(trustInput, {
      organizationId: 'org-f4-1',
      vehicleId: 'veh-f4-1',
    }),
    samples,
  });

  const observation = detection.candidates[0]!;

  it('absoluteDetectionAdmissibility is NOT part of candidateIdentityKey inputs', () => {
    expect(observation.qualityMeta?.absoluteDetectionAdmissibility).toBe('ADMISSIBLE');
    expect(observation.absoluteSignalTrust).toBe('UNKNOWN');

    const withF41Meta = tryBuildCandidateIdentityKeyFromEvidence(observation);
    const { qualityMeta: _ignored, ...identityEvidence } = observation;
    const withoutQualityMeta = tryBuildCandidateIdentityKeyFromEvidence(identityEvidence);

    expect(withF41Meta).not.toBeNull();
    expect(withoutQualityMeta).toBe(withF41Meta);
  });

  it('absoluteDetectionAdmissibility IS included in evidenceRevisionFingerprint', () => {
    const f41Slice = observationToEvidenceSlice(observation);
    const legacySlice = observationToEvidenceSlice({
      ...observation,
      qualityMeta: null,
    });

    const f41Fingerprint = buildEvidenceRevisionFingerprint(f41Slice);
    const legacyFingerprint = buildEvidenceRevisionFingerprint(legacySlice);

    expect(f41Fingerprint).not.toBe(legacyFingerprint);

    const replayFingerprint = buildEvidenceRevisionFingerprint(f41Slice);
    expect(replayFingerprint).toBe(f41Fingerprint);
  });

  it('pre-F4.1-equivalent evidence without qualityMeta shares physical identity but not fingerprint', () => {
    const f41Slice = observationToEvidenceSlice(observation);
    const legacySlice = observationToEvidenceSlice({
      ...observation,
      qualityMeta: null,
    });

    expect(
      tryBuildCandidateIdentityKeyFromEvidence(f41Slice),
    ).toBe(tryBuildCandidateIdentityKeyFromEvidence(legacySlice));
    expect(buildEvidenceRevisionFingerprint(f41Slice)).not.toBe(
      buildEvidenceRevisionFingerprint(legacySlice),
    );
  });
});
