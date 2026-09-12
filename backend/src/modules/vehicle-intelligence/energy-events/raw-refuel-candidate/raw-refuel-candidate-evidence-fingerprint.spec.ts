import { buildEvidenceRevisionFingerprint } from './raw-refuel-candidate-evidence-fingerprint';
import { buildTestObservation } from './testing/raw-refuel-candidate-test.util';

describe('raw-refuel-candidate-evidence-fingerprint', () => {
  it('same evidence produces same fingerprint', () => {
    const obs = buildTestObservation({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
    });
    const slice = {
      organizationId: obs.organizationId,
      vehicleId: obs.vehicleId,
      detectionVersion: obs.detectionVersion,
      signalChannel: obs.signalChannel,
      physicalEvidenceStart: obs.physicalEvidenceStart,
      physicalEvidenceEnd: obs.physicalEvidenceEnd,
      riseOnsetAt: obs.riseOnsetAt,
      riseEndAt: obs.riseEndAt,
      preFuelAbsoluteLiters: obs.preFuelAbsoluteLiters,
      postFuelAbsoluteLiters: obs.postFuelAbsoluteLiters,
      deltaAbsoluteLiters: obs.deltaAbsoluteLiters,
    };
    const a = buildEvidenceRevisionFingerprint(slice);
    const b = buildEvidenceRevisionFingerprint({ ...slice });
    expect(a).toBe(b);
  });

  it('material evidence change produces different fingerprint', () => {
    const base = buildTestObservation({ organizationId: 'org-1', vehicleId: 'veh-1' });
    const slice = (post: number) => ({
      organizationId: base.organizationId,
      vehicleId: base.vehicleId,
      detectionVersion: base.detectionVersion,
      signalChannel: base.signalChannel,
      postFuelAbsoluteLiters: post,
      preFuelAbsoluteLiters: base.preFuelAbsoluteLiters,
      riseOnsetAt: base.riseOnsetAt,
    });
    expect(buildEvidenceRevisionFingerprint(slice(29))).not.toBe(
      buildEvidenceRevisionFingerprint(slice(31)),
    );
  });
});
